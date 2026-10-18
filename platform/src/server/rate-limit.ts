import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";

/**
 * Datenbankbasierte Rate-Limits mit festem Zeitfenster. Atomar über ein
 * einziges UPSERT – funktioniert auch mit mehreren Server-Instanzen.
 */

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  loginPerAccount: { limit: 8, windowSeconds: 15 * 60 },
  mfaPerSession: { limit: 6, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 5, windowSeconds: 60 * 60 },
  passwordResetPerAccount: { limit: 3, windowSeconds: 60 * 60 },
  passwordResetPerIp: { limit: 10, windowSeconds: 60 * 60 },
  verificationResendPerUser: { limit: 3, windowSeconds: 60 * 60 },
  reportsPerUser: { limit: 10, windowSeconds: 60 * 60 },
  supportPerIp: { limit: 5, windowSeconds: 60 * 60 },
  testCreditPerUser: { limit: 5, windowSeconds: 60 * 60 },
  sessionRequestsPerUser: { limit: 20, windowSeconds: 60 * 60 },
  uploadsPerUser: { limit: 30, windowSeconds: 60 * 60 },
  sensitiveActionPerUser: { limit: 10, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const interval = `${rule.windowSeconds} seconds`;
  const result = await getDb().execute<{ count: number; expires_at: Date }>(sql`
    INSERT INTO rate_limit_buckets (key, window_start, count, expires_at)
    VALUES (${key}, now(), 1, now() + ${interval}::interval)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.expires_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_start = CASE WHEN rate_limit_buckets.expires_at <= now() THEN now() ELSE rate_limit_buckets.window_start END,
      expires_at = CASE WHEN rate_limit_buckets.expires_at <= now() THEN now() + ${interval}::interval ELSE rate_limit_buckets.expires_at END
    RETURNING count, expires_at
  `);
  const row = result.rows[0];
  const count = Number(row?.count ?? 1);
  const expiresAt = row?.expires_at ? new Date(row.expires_at) : new Date();
  return {
    allowed: count <= rule.limit,
    count,
    retryAfterSeconds: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

/** Wirft einen verständlichen Fehler, wenn das Limit überschritten ist. */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const result = await consumeRateLimit(key, rule);
  if (!result.allowed) {
    const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
    throw new AppError(
      "rate_limited",
      `Zu viele Versuche. Bitte versuche es in etwa ${minutes} Minute${minutes === 1 ? "" : "n"} erneut.`,
    );
  }
}

/** Entfernt abgelaufene Einträge (z. B. über einen periodischen Job). */
export async function pruneRateLimits(): Promise<number> {
  const result = await getDb().execute(sql`DELETE FROM rate_limit_buckets WHERE expires_at < now() - interval '1 hour'`);
  return result.rowCount ?? 0;
}
