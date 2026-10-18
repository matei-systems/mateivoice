import "server-only";
import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { authSessions, sanctions, users } from "@/server/db/schema";
import { randomToken, sha256Hex } from "@/server/crypto";
import type { Role, UserStatus } from "./permissions";

/**
 * Serverseitige Sitzungen: Das Cookie enthält einen zufälligen Token, in der
 * Datenbank liegt nur dessen SHA-256-Hash. Ein Datenbankleck erlaubt daher
 * keine Übernahme laufender Sitzungen.
 */

const HOUR = 60 * 60 * 1000;
export const SESSION_TTL_MS: Record<Role, number> = {
  admin: 12 * HOUR,
  creator: 30 * 24 * HOUR,
  customer: 30 * 24 * HOUR,
};
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  totpEnabled: boolean;
  isTestAccount: boolean;
};

export type ValidatedSession = {
  sessionId: string;
  expiresAt: Date;
  mfaVerified: boolean;
  /** Konto hat 2FA aktiv, diese Sitzung wurde aber noch nicht mit TOTP bestätigt. */
  mfaPending: boolean;
  user: SessionUser;
};

export async function createAuthSession(
  executor: Executor,
  input: { userId: string; role: Role; mfaVerified: boolean; userAgent?: string | null; ipHash?: string | null },
) {
  const token = randomToken(32);
  const id = sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS[input.role]);
  await executor.insert(authSessions).values({
    id,
    userId: input.userId,
    expiresAt,
    lastSeenAt: now,
    mfaVerifiedAt: input.mfaVerified ? now : null,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
    ipHash: input.ipHash ?? null,
  });
  return { token, id, expiresAt };
}

export function sessionIdFromToken(token: string): string {
  return sha256Hex(token);
}

export async function validateSessionToken(token: string | undefined | null): Promise<ValidatedSession | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const db = getDb();
  const id = sessionIdFromToken(token);
  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.id, id))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now || row.user.status === "deleted") {
    await db.delete(authSessions).where(eq(authSessions.id, id));
    return null;
  }

  if (row.user.status === "suspended" && (await liftExpiredSuspension(row.user.id))) {
    row.user.status = "active";
  }

  if (now - row.session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
    await db.update(authSessions).set({ lastSeenAt: new Date(now) }).where(eq(authSessions.id, id));
  }

  const totpEnabled = row.user.totpEnabledAt !== null;
  const mfaVerified = row.session.mfaVerifiedAt !== null;
  return {
    sessionId: id,
    expiresAt: row.session.expiresAt,
    mfaVerified,
    mfaPending: totpEnabled && !mfaVerified,
    user: {
      id: row.user.id,
      email: row.user.email,
      username: row.user.username,
      role: row.user.role,
      status: row.user.status,
      emailVerified: row.user.emailVerifiedAt !== null,
      totpEnabled,
      isTestAccount: row.user.isTestAccount,
    },
  };
}

/** Befristete Sperre abgelaufen und keine weitere aktive Sperre → Konto wieder aktiv. */
async function liftExpiredSuspension(userId: string): Promise<boolean> {
  const db = getDb();
  const [active] = await db
    .select({ id: sanctions.id })
    .from(sanctions)
    .where(
      and(
        eq(sanctions.userId, userId),
        eq(sanctions.kind, "suspension"),
        isNull(sanctions.liftedAt),
        or(isNull(sanctions.endsAt), gt(sanctions.endsAt, new Date())),
      ),
    )
    .limit(1);
  if (active) return false;
  const lifted = await db
    .update(users)
    .set({ status: "active" })
    .where(and(eq(users.id, userId), eq(users.status, "suspended")))
    .returning({ id: users.id });
  return lifted.length > 0;
}

export async function invalidateSession(sessionId: string) {
  await getDb().delete(authSessions).where(eq(authSessions.id, sessionId));
}

export async function invalidateAllUserSessions(executor: Executor, userId: string, exceptSessionId?: string) {
  await executor
    .delete(authSessions)
    .where(
      exceptSessionId
        ? and(eq(authSessions.userId, userId), ne(authSessions.id, exceptSessionId))
        : eq(authSessions.userId, userId),
    );
}

export async function markSessionMfaVerified(sessionId: string) {
  await getDb().update(authSessions).set({ mfaVerifiedAt: new Date() }).where(eq(authSessions.id, sessionId));
}

export async function pruneExpiredSessions() {
  const result = await getDb().delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  return result.rowCount ?? 0;
}
