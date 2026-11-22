import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/server/db/client";
import { authSessions, authTokens, chatMessages, emailOutbox, ledgerAccounts, payouts, privacyRequests, rateLimitBuckets, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { AppError, notFound, validationError } from "@/server/errors";
import { log } from "@/server/log";
import { getSettings } from "@/server/settings/service";
import { hasActiveHold, notUnderHold } from "./holds";

/**
 * Betroffenenrechte (DSGVO Art. 15–21) und Aufbewahrung.
 *
 * - Auskunft/Export: Selbstbedienung im Konto (Protokoll als Datenschutzanfrage).
 * - Löschung: Selbstbedienung mit Prüfungen (Beweissicherung, offene Auszahlungen,
 *   echtes Guthaben). Buchungs- und Steuerdaten bleiben pseudonymisiert erhalten
 *   (gesetzliche Aufbewahrungspflichten, z. B. § 132 BAO – siehe docs/LEGAL-DACH.md).
 * - Berichtigung/Widerspruch: werden vom Support erfasst und bearbeitet.
 */

export async function logPrivacyRequest(
  executor: Executor,
  input: { userId: string | null; kind: "export" | "deletion" | "rectification" | "objection"; status?: "received" | "completed" | "rejected" | "on_hold"; note?: string; handledById?: string | null },
) {
  const status = input.status ?? "received";
  const [row] = await executor
    .insert(privacyRequests)
    .values({
      userId: input.userId,
      kind: input.kind,
      status,
      note: input.note ?? null,
      handledById: input.handledById ?? null,
      completedAt: status === "completed" || status === "rejected" ? new Date() : null,
    })
    .returning({ id: privacyRequests.id });
  return row!.id;
}

export type DeletionBlocker = { code: "legal_hold" | "open_payout" | "real_balance"; message: string };

/** Was spricht gegen eine sofortige Löschung? (Wird vor der Löschung geprüft und angezeigt.) */
export async function deletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const db = getDb();
  const blockers: DeletionBlocker[] = [];
  if (await hasActiveHold(db, "user", userId)) {
    blockers.push({ code: "legal_hold", message: "Zu deinem Konto läuft ein Prüfverfahren. Deine Löschanfrage wird protokolliert und nach Abschluss bearbeitet." });
  }
  const [openPayout] = await db
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.creatorUserId, userId), inArray(payouts.status, ["requested", "approved", "processing"])))
    .limit(1);
  if (openPayout) blockers.push({ code: "open_payout", message: "Du hast einen offenen Auszahlungsantrag. Bitte warte, bis er abgeschlossen ist." });
  const [balance] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerAccounts.balance}), 0)::bigint`.mapWith(Number) })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.ownerUserId, userId), eq(ledgerAccounts.currency, "COIN")));
  if ((balance?.total ?? 0) > 0) {
    blockers.push({ code: "real_balance", message: "Auf deinem Konto befindet sich noch echtes Guthaben. Bitte kontaktiere den Support, damit wir über Auszahlung bzw. Erstattung entscheiden können." });
  }
  return blockers;
}

// ── Verwaltung (Support) ────────────────────────────────────────────────────

export const privacyRequestSchema = z.object({
  username: z.string().trim().min(3).max(24),
  kind: z.enum(["export", "deletion", "rectification", "objection"]),
  note: z.string().trim().min(10, "Bitte beschreibe die Anfrage (mind. 10 Zeichen).").max(2000),
});

export async function recordPrivacyRequest(staffUserId: string, raw: unknown, ipHash?: string | null) {
  const parsed = privacyRequestSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.username, parsed.data.username)).limit(1);
  if (!user) throw notFound("Kein Konto mit diesem Nutzernamen gefunden.");
  return getDb().transaction(async (tx) => {
    const id = await logPrivacyRequest(tx, { userId: user.id, kind: parsed.data.kind, note: parsed.data.note, handledById: staffUserId });
    await writeAuditLog(tx, { actorUserId: staffUserId, action: "privacy.request_recorded", targetType: "privacy_request", targetId: id, metadata: { kind: parsed.data.kind }, ipHash });
    return id;
  });
}

export async function updatePrivacyRequest(input: { staffUserId: string; requestId: string; status: "completed" | "rejected" | "on_hold"; note: string; ipHash?: string | null }) {
  const note = input.note.trim();
  if (note.length < 10) throw validationError("Bitte dokumentiere die Bearbeitung (mind. 10 Zeichen).");
  if (!z.uuid().safeParse(input.requestId).success) throw notFound("Anfrage nicht gefunden.");
  await getDb().transaction(async (tx) => {
    const [request] = await tx.select().from(privacyRequests).where(eq(privacyRequests.id, input.requestId)).for("update");
    if (!request) throw notFound("Anfrage nicht gefunden.");
    if (request.status === "completed" || request.status === "rejected") throw new AppError("invalid_state", "Die Anfrage ist bereits abgeschlossen.");
    await tx
      .update(privacyRequests)
      .set({ status: input.status, note: [request.note, note].filter(Boolean).join("\n—\n").slice(0, 4000), handledById: input.staffUserId, completedAt: input.status === "on_hold" ? null : new Date() })
      .where(eq(privacyRequests.id, request.id));
    await writeAuditLog(tx, { actorUserId: input.staffUserId, action: `privacy.${input.status}`, targetType: "privacy_request", targetId: request.id, reason: note, ipHash: input.ipHash });
  });
}

export async function listPrivacyRequests(limit = 200) {
  return getDb()
    .select({ request: privacyRequests, username: users.username })
    .from(privacyRequests)
    .leftJoin(users, eq(users.id, privacyRequests.userId))
    .orderBy(sql`CASE ${privacyRequests.status} WHEN 'received' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END`, desc(privacyRequests.createdAt))
    .limit(limit);
}

// ── Aufbewahrung (Job) ──────────────────────────────────────────────────────

/**
 * Löscht Daten nach Ablauf der konfigurierten Fristen. Objekte unter
 * Beweissicherung und Nachrichten mit offenen Meldungen bleiben erhalten.
 * Buchungen, Audit-Protokolle und Moderationsbegründungen sind unveränderlich
 * und werden NICHT durch diesen Job gelöscht.
 */
export async function runRetention(now = new Date()) {
  const settings = await getSettings();
  const db = getDb();
  const day = 86_400_000;
  const chatCutoff = new Date(now.getTime() - settings.retention.chatMessagesDays * day);
  const outboxCutoff = new Date(now.getTime() - settings.retention.emailOutboxDays * day);

  const deletedChat = await db
    .delete(chatMessages)
    .where(
      and(
        lt(chatMessages.createdAt, chatCutoff),
        notUnderHold("chat_message", chatMessages.id),
        notUnderHold("video_session", chatMessages.sessionId),
        sql`(${chatMessages.senderUserId} IS NULL OR ${notUnderHold("user", chatMessages.senderUserId)})`,
        sql`NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_type = 'chat_message' AND r.target_id = ${chatMessages.id} AND r.status IN ('open', 'in_review'))`,
      ),
    )
    .returning({ id: chatMessages.id });
  const deletedOutbox = await db
    .delete(emailOutbox)
    .where(and(lt(emailOutbox.createdAt, outboxCutoff), inArray(emailOutbox.status, ["sent", "failed", "suppressed", "stored_dev"])))
    .returning({ id: emailOutbox.id });
  const deletedBuckets = await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now)).returning({ key: rateLimitBuckets.key });
  const deletedSessions = await db.delete(authSessions).where(lt(authSessions.expiresAt, now)).returning({ id: authSessions.id });
  const deletedTokens = await db
    .delete(authTokens)
    .where(lt(authTokens.expiresAt, new Date(now.getTime() - 7 * day)))
    .returning({ id: authTokens.id });
  const result = {
    chatMessages: deletedChat.length,
    emailOutbox: deletedOutbox.length,
    rateLimitBuckets: deletedBuckets.length,
    authSessions: deletedSessions.length,
    authTokens: deletedTokens.length,
  };
  log.info("retention.completed", result);
  return result;
}
