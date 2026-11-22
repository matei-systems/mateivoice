import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/server/db/client";
import { chatMessages, chatMutes, moderationActions, userBlocks, users, videoSessions } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { getAgeAccess } from "@/server/age/service";
import { hasPermission, isStaffRole, type Actor } from "@/server/auth/permissions";
import { AppError, featureUnavailable, forbidden, notFound, validationError } from "@/server/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { publish, sessionTopic } from "@/server/realtime/hub";
import { getSettings } from "@/server/settings/service";
import { isBlockedBetween } from "@/server/social/service";

/**
 * Chat in Live-Streams und privaten Sitzungen.
 *
 * Transport: Senden über Server Actions (CSRF-geschützt, Berechtigungsprüfung),
 * Empfangen über Server-Sent Events (/api/sessions/[id]/chat), verteilt über
 * PostgreSQL LISTEN/NOTIFY (siehe realtime/hub.ts).
 *
 * Schutzmaßnahmen: Rate-Limit + Mindestabstand, Längenbegrenzung, Filter für
 * Links/Kontaktdaten (Schutz vor Abwerbung und Betrug), Wiederholungssperre,
 * Stummschaltung (Creator im eigenen Raum, Moderation plattformweit),
 * Blockieren (beidseitig), Meldungen und Löschung mit Begründung.
 */

type SessionRow = typeof videoSessions.$inferSelect;

export type RoomAccess = { canRead: boolean; canWrite: boolean; canModerate: boolean; reason?: string };

export async function loadSession(sessionId: string): Promise<SessionRow | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const [row] = await getDb().select().from(videoSessions).where(eq(videoSessions.id, sessionId)).limit(1);
  return row ?? null;
}

/** Zugriffsrechte einer Person auf den Chat einer Sitzung. */
export async function getRoomAccess(actor: Actor | null, session: SessionRow): Promise<RoomAccess> {
  const none: RoomAccess = { canRead: false, canWrite: false, canModerate: false };
  if (!actor || actor.status !== "active") return none;
  const isCreator = actor.id === session.creatorUserId;
  const live = session.status === "active";

  if (session.kind === "private_chat") {
    const isParticipant = isCreator || actor.id === session.customerUserId;
    if (!isParticipant) return none; // Mitarbeiter sehen private Chats nur über Meldungen (Beweismittel)
    const writable = live && hasPermission(actor, "chat.participate");
    return { canRead: true, canWrite: writable, canModerate: isCreator, reason: writable ? undefined : "Der Chat ist nur während der laufenden Sitzung möglich." };
  }

  // Öffentlicher Stream
  if (isStaffRole(actor.role)) {
    const canModerate = hasPermission(actor, "admin.chat.moderate");
    return { canRead: canModerate, canWrite: false, canModerate };
  }
  if (isCreator) return { canRead: true, canWrite: live, canModerate: true };
  if (actor.role !== "customer" || !hasPermission(actor, "creators.watch_public")) return none;
  const age = await getAgeAccess(actor.id);
  if (!age.allowed) return { canRead: false, canWrite: false, canModerate: false, reason: "Für den Chat ist eine Altersprüfung erforderlich." };
  const writable = live && hasPermission(actor, "chat.participate");
  return {
    canRead: true,
    canWrite: writable,
    canModerate: false,
    reason: writable ? undefined : actor.emailVerified ? "Der Chat ist nur während des Live-Streams möglich." : "Bitte bestätige zuerst deine E-Mail-Adresse.",
  };
}

export type ChatMessageView = {
  id: string;
  kind: "message" | "tip" | "system";
  body: string;
  tipAmount: number | null;
  createdAt: string;
  sender: { id: string | null; username: string; role: "creator" | "customer" | "staff" | "system" };
};

function viewOf(row: {
  id: string;
  kind: "message" | "tip" | "system";
  body: string;
  tipAmount: number | null;
  createdAt: Date;
  senderUserId: string | null;
  username: string | null;
  role: string | null;
}, creatorUserId: string): ChatMessageView {
  const role: ChatMessageView["sender"]["role"] =
    row.kind === "system" || !row.senderUserId ? "system" : row.senderUserId === creatorUserId ? "creator" : isStaffRole(row.role) ? "staff" : "customer";
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    tipAmount: row.tipAmount,
    createdAt: row.createdAt.toISOString(),
    sender: { id: row.senderUserId, username: row.username ?? "System", role },
  };
}

async function blockedSenderIds(viewerId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ blocked: userBlocks.blockedUserId, blocker: userBlocks.blockerUserId })
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerUserId, viewerId), eq(userBlocks.blockedUserId, viewerId)));
  return rows.map((row) => (row.blocker === viewerId ? row.blocked : row.blocker));
}

const messageColumns = {
  id: chatMessages.id,
  kind: chatMessages.kind,
  body: chatMessages.body,
  tipAmount: chatMessages.tipAmount,
  createdAt: chatMessages.createdAt,
  senderUserId: chatMessages.senderUserId,
  username: users.username,
  role: users.role,
};

/** Letzte Nachrichten eines Raums (ohne gelöschte und ohne blockierte Absender). */
export async function listRoomMessages(actor: Actor, session: SessionRow, options: { limit?: number; afterId?: string } = {}): Promise<ChatMessageView[]> {
  const access = await getRoomAccess(actor, session);
  if (!access.canRead) throw forbidden(access.reason);
  const hidden = await blockedSenderIds(actor.id);
  const conditions = [eq(chatMessages.sessionId, session.id), isNull(chatMessages.deletedAt)];
  if (hidden.length) conditions.push(or(isNull(chatMessages.senderUserId), notInArray(chatMessages.senderUserId, hidden))!);
  if (options.afterId && z.uuid().safeParse(options.afterId).success) {
    conditions.push(gt(chatMessages.createdAt, sql`(SELECT created_at FROM chat_messages WHERE id = ${options.afterId})`));
  }
  const rows = await getDb()
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.senderUserId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(Math.min(options.limit ?? 50, 100));
  return rows.reverse().map((row) => viewOf(row, session.creatorUserId));
}

/** Einzelne Nachricht für einen Empfänger (für die Echtzeit-Zustellung). */
export async function getMessageForViewer(actor: Actor, session: SessionRow, messageId: string, hiddenSenders: string[]): Promise<ChatMessageView | null> {
  const [row] = await getDb()
    .select(messageColumns)
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.senderUserId))
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.sessionId, session.id), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!row) return null;
  if (row.senderUserId && hiddenSenders.includes(row.senderUserId)) return null;
  return viewOf(row, session.creatorUserId);
}

export { blockedSenderIds };

// ── Senden ──────────────────────────────────────────────────────────────────

const CONTACT_PATTERNS = [
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]{2,}\.(com|net|org|de|at|ch|io|me|ly|gg|tv|app|xyz|info|eu|co|link|site|online)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /(?:\+|00)?\d[\d\s/().-]{7,}\d/,
  /\b(telegram|whats\s?app|snap(chat)?|onlyfans|insta(gram)?|signal)\b/i,
];

/** Erkennt Links und Kontaktdaten (Abwerbung, Betrug, Schutz Minderjähriger). */
export function containsContactInfo(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeChatBody(raw: string, maxLength: number): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) throw validationError("Bitte gib eine Nachricht ein.");
  if (cleaned.length > maxLength) throw validationError(`Höchstens ${maxLength} Zeichen.`);
  return cleaned;
}

async function activeMute(executor: Executor, userId: string, creatorUserId: string) {
  const [mute] = await executor
    .select({ id: chatMutes.id, until: chatMutes.until, creatorUserId: chatMutes.creatorUserId })
    .from(chatMutes)
    .where(
      and(
        eq(chatMutes.userId, userId),
        or(isNull(chatMutes.creatorUserId), eq(chatMutes.creatorUserId, creatorUserId)),
        or(isNull(chatMutes.until), gt(chatMutes.until, sql`now()`)),
      ),
    )
    .limit(1);
  return mute ?? null;
}

export async function postChatMessage(actor: Actor, sessionId: string, rawBody: string) {
  const settings = await getSettings();
  if (!settings.featureFlags.chat) throw featureUnavailable("Der Chat ist derzeit deaktiviert.");
  const session = await loadSession(sessionId);
  if (!session) throw notFound("Sitzung nicht gefunden.");
  const access = await getRoomAccess(actor, session);
  if (!access.canWrite) throw forbidden(access.reason ?? "Du kannst in diesem Chat nicht schreiben.");
  const body = sanitizeChatBody(rawBody, settings.chat.maxMessageLength);
  if (containsContactInfo(body)) throw validationError("Links und Kontaktdaten sind im Chat nicht erlaubt.");

  const limit = await consumeRateLimit(`chat:${actor.id}`, RATE_LIMITS.chatMessagesPerUser);
  if (!limit.allowed) throw new AppError("rate_limited", "Du schreibst zu schnell. Bitte warte einen Moment.");

  return getDb().transaction(async (tx) => {
    if (actor.id !== session.creatorUserId) {
      if (await isBlockedBetween(tx, actor.id, session.creatorUserId)) throw forbidden("Du kannst in diesem Chat nicht schreiben.");
      if (await activeMute(tx, actor.id, session.creatorUserId)) throw forbidden("Du bist in diesem Chat derzeit stummgeschaltet.");
    }
    const [last] = await tx
      .select({ body: chatMessages.body, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, session.id), eq(chatMessages.senderUserId, actor.id)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);
    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < settings.chat.minIntervalSeconds) throw new AppError("rate_limited", "Bitte warte kurz vor der nächsten Nachricht.");
      if (last.body === body && elapsed < 60) throw validationError("Bitte wiederhole dieselbe Nachricht nicht.");
    }
    const [message] = await tx.insert(chatMessages).values({ sessionId: session.id, senderUserId: actor.id, kind: "message", body }).returning({ id: chatMessages.id });
    await publish(tx, { topic: sessionTopic(session.id), type: "chat.message", id: message!.id });
    return { id: message!.id };
  });
}

// ── Moderation ──────────────────────────────────────────────────────────────

export async function deleteChatMessage(actor: Actor, messageId: string, reason: string) {
  if (!z.uuid().safeParse(messageId).success) throw notFound("Nachricht nicht gefunden.");
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ message: chatMessages, session: videoSessions })
      .from(chatMessages)
      .innerJoin(videoSessions, eq(videoSessions.id, chatMessages.sessionId))
      .where(eq(chatMessages.id, messageId))
      .for("update");
    if (!row) throw notFound("Nachricht nicht gefunden.");
    const isRoomOwner = row.session.creatorUserId === actor.id && hasPermission(actor, "studio.chat.moderate");
    const isModerator = hasPermission(actor, "admin.chat.moderate");
    if (!isRoomOwner && !isModerator) throw forbidden();
    const statement = reason.trim();
    const asModerator = isModerator && !isRoomOwner;
    if (asModerator && statement.length < 10) throw validationError("Bitte begründe die Löschung (mind. 10 Zeichen).");
    if (row.message.deletedAt) return;
    await tx.update(chatMessages).set({ deletedAt: new Date(), deletedById: actor.id }).where(eq(chatMessages.id, messageId));
    if (asModerator) {
      await tx.insert(moderationActions).values({
        action: "message_deleted",
        affectedUserId: row.message.senderUserId,
        targetType: "chat_message",
        targetId: messageId,
        statement,
        createdById: actor.id,
      });
      await writeAuditLog(tx, { actorUserId: actor.id, action: "chat.message_deleted", targetType: "chat_message", targetId: messageId, reason: statement });
    }
    await publish(tx, { topic: sessionTopic(row.session.id), type: "chat.deleted", id: messageId });
  });
}

export async function muteChatUser(actor: Actor, input: { sessionId: string; userId: string; minutes: number | null; reason: string }) {
  const session = await loadSession(input.sessionId);
  if (!session) throw notFound("Sitzung nicht gefunden.");
  if (!z.uuid().safeParse(input.userId).success || input.userId === actor.id) throw notFound("Konto nicht gefunden.");
  const isRoomOwner = session.creatorUserId === actor.id && hasPermission(actor, "studio.chat.moderate");
  const isModerator = hasPermission(actor, "admin.chat.moderate");
  if (!isRoomOwner && !isModerator) throw forbidden();
  const [target] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target || isStaffRole(target.role)) throw new AppError("invalid_state", "Dieses Konto kann nicht stummgeschaltet werden.");
  const minutes = input.minutes === null ? null : Math.min(Math.max(Math.trunc(input.minutes), 5), 60 * 24 * 30);
  const reason = input.reason.trim().slice(0, 300);
  if (isModerator && !isRoomOwner && reason.length < 10) throw validationError("Bitte begründe die Stummschaltung (mind. 10 Zeichen).");
  await getDb().transaction(async (tx) => {
    await tx.insert(chatMutes).values({
      creatorUserId: isRoomOwner ? session.creatorUserId : null,
      userId: input.userId,
      until: minutes === null ? null : new Date(Date.now() + minutes * 60_000),
      reason: reason || null,
      createdById: actor.id,
    });
    if (isModerator && !isRoomOwner) {
      await tx.insert(moderationActions).values({
        action: "user_muted",
        affectedUserId: input.userId,
        targetType: "user",
        targetId: input.userId,
        statement: reason,
        createdById: actor.id,
      });
      await writeAuditLog(tx, { actorUserId: actor.id, action: "chat.user_muted", targetType: "user", targetId: input.userId, reason, metadata: { minutes } });
    }
  });
}

/** Für Meldungen: Chatverlauf einer Sitzung als Beweismittel (nur Mitarbeiter mit Meldungsrecht). */
export async function getChatTranscriptForStaff(actor: Actor, sessionId: string) {
  if (!hasPermission(actor, "admin.reports.manage") && !hasPermission(actor, "admin.chat.moderate")) throw forbidden();
  const session = await loadSession(sessionId);
  if (!session) return [];
  const rows = await getDb()
    .select({ ...messageColumns, deletedAt: chatMessages.deletedAt })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.senderUserId))
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(500);
  return rows.map((row) => ({ ...viewOf(row, session.creatorUserId), deleted: !!row.deletedAt }));
}

/** Systemnachricht (z. B. „Stream beendet“). */
export async function postSystemMessage(executor: Executor, sessionId: string, body: string) {
  const [message] = await executor.insert(chatMessages).values({ sessionId, senderUserId: null, kind: "system", body: body.slice(0, 300) }).returning({ id: chatMessages.id });
  await publish(executor, { topic: sessionTopic(sessionId), type: "chat.message", id: message!.id });
}

export async function countMessages(sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, number>();
  const rows = await getDb()
    .select({ sessionId: chatMessages.sessionId, count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, sessionIds))
    .groupBy(chatMessages.sessionId);
  return new Map(rows.map((row) => [row.sessionId, row.count]));
}
