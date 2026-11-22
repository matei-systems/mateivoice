import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/server/db/client";
import { legalHolds, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { AppError, notFound, validationError } from "@/server/errors";

/**
 * Beweissicherung (Legal Hold).
 *
 * Gesperrte Objekte werden von Lösch- und Aufbewahrungsjobs ausgenommen und
 * verhindern die Selbstlöschung eines Kontos, solange ein Verfahren läuft
 * (z. B. Meldung zu möglicher Minderjährigkeit, behördliche Anfrage).
 * Holds werden nie gelöscht, nur mit Begründung freigegeben.
 */

export type HoldTarget = "user" | "media" | "video_session" | "chat_message" | "report";

export const holdSchema = z.object({
  targetType: z.enum(["user", "media", "video_session", "chat_message", "report"]),
  targetId: z.uuid("Ungültige ID."),
  reason: z.string().trim().min(10, "Bitte begründe die Beweissicherung (mind. 10 Zeichen).").max(1000),
  reportId: z.uuid().optional(),
});

export async function placeLegalHold(executor: Executor, input: { staffUserId: string | null; targetType: HoldTarget; targetId: string; reason: string; reportId?: string | null }) {
  const existing = await executor
    .select({ id: legalHolds.id })
    .from(legalHolds)
    .where(and(eq(legalHolds.targetType, input.targetType), eq(legalHolds.targetId, input.targetId), isNull(legalHolds.releasedAt)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await executor
    .insert(legalHolds)
    .values({ targetType: input.targetType, targetId: input.targetId, reason: input.reason, reportId: input.reportId ?? null, createdById: input.staffUserId })
    .returning({ id: legalHolds.id });
  await writeAuditLog(executor, {
    actorUserId: input.staffUserId,
    action: "legal_hold.placed",
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    metadata: { holdId: row!.id, reportId: input.reportId ?? null },
  });
  return row!.id;
}

export async function createLegalHold(staffUserId: string, raw: unknown) {
  const parsed = holdSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  return getDb().transaction((tx) => placeLegalHold(tx, { staffUserId, ...parsed.data }));
}

export async function releaseLegalHold(input: { staffUserId: string; holdId: string; reason: string; ipHash?: string | null }) {
  const reason = input.reason.trim();
  if (reason.length < 10) throw validationError("Bitte begründe die Freigabe (mind. 10 Zeichen).");
  if (!z.uuid().safeParse(input.holdId).success) throw notFound("Beweissicherung nicht gefunden.");
  await getDb().transaction(async (tx) => {
    const [hold] = await tx.select().from(legalHolds).where(eq(legalHolds.id, input.holdId)).for("update");
    if (!hold) throw notFound("Beweissicherung nicht gefunden.");
    if (hold.releasedAt) throw new AppError("conflict", "Bereits freigegeben.");
    await tx.update(legalHolds).set({ releasedAt: new Date(), releasedById: input.staffUserId, releaseReason: reason }).where(eq(legalHolds.id, hold.id));
    await writeAuditLog(tx, { actorUserId: input.staffUserId, action: "legal_hold.released", targetType: hold.targetType, targetId: hold.targetId, reason, metadata: { holdId: hold.id }, ipHash: input.ipHash });
  });
}

export async function hasActiveHold(executor: Executor, targetType: HoldTarget, targetId: string) {
  const [row] = await executor
    .select({ id: legalHolds.id })
    .from(legalHolds)
    .where(and(eq(legalHolds.targetType, targetType), eq(legalHolds.targetId, targetId), isNull(legalHolds.releasedAt)))
    .limit(1);
  return !!row;
}

export async function listLegalHolds(options: { includeReleased?: boolean } = {}) {
  const creator = sql<string | null>`(SELECT username FROM users u WHERE u.id = ${legalHolds.createdById})`;
  return getDb()
    .select({ hold: legalHolds, createdBy: creator, targetUsername: users.username })
    .from(legalHolds)
    .leftJoin(users, and(eq(legalHolds.targetType, "user"), eq(users.id, legalHolds.targetId)))
    .where(options.includeReleased ? undefined : isNull(legalHolds.releasedAt))
    .orderBy(desc(legalHolds.createdAt))
    .limit(200);
}

/** SQL-Bedingung: Objekt-ID ist NICHT unter aktiver Beweissicherung (für Lösch-Jobs). */
export function notUnderHold(targetType: HoldTarget, idColumn: unknown) {
  return sql`NOT EXISTS (SELECT 1 FROM legal_holds lh WHERE lh.target_type = ${targetType} AND lh.target_id = ${idColumn} AND lh.released_at IS NULL)`;
}
