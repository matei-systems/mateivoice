import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { supportMessages, supportTickets, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { emailSchema, type RequestContext } from "@/server/auth/service";
import { forbidden, notFound, validationError } from "@/server/errors";
import { notify, notifyAdmins } from "@/server/notifications/service";
import { RATE_LIMITS, enforceRateLimit } from "@/server/rate-limit";

/**
 * Support-Anfragen. Anfragen werden tatsächlich gespeichert und im Adminbereich
 * bearbeitet. E-Mail-Benachrichtigungen an Gäste sind noch nicht aktiv – das
 * wird in der Oberfläche ehrlich so angezeigt.
 */

export const SUPPORT_CATEGORIES = [
  { value: "account", label: "Konto & Anmeldung" },
  { value: "payments", label: "Münzen & Abrechnung" },
  { value: "technical", label: "Technisches Problem" },
  { value: "safety", label: "Sicherheit & Missbrauch" },
  { value: "creator", label: "Creator-Fragen" },
  { value: "privacy", label: "Datenschutz" },
  { value: "other", label: "Sonstiges" },
] as const;

type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

const ticketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES.map((c) => c.value) as [SupportCategory, ...SupportCategory[]], {
    error: "Bitte wähle ein Thema.",
  }),
  subject: z.string().trim().min(3, "Bitte gib einen Betreff an.").max(150, "Der Betreff ist zu lang."),
  message: z.string().trim().min(10, "Bitte beschreibe dein Anliegen (mind. 10 Zeichen).").max(5000, "Die Nachricht ist zu lang."),
});

export async function createSupportTicket(actor: Actor | null, rawInput: unknown, ctx: RequestContext) {
  const parsed = ticketSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  let contactEmail: string | null = null;
  if (!actor) {
    const email = emailSchema.safeParse((rawInput as { email?: unknown })?.email);
    if (!email.success) throw validationError("Bitte gib eine gültige E-Mail-Adresse für Rückfragen an.");
    contactEmail = email.data;
  } else if (!hasPermission(actor, "support.create")) {
    throw forbidden();
  }
  await enforceRateLimit(`support:${actor ? `user:${actor.id}` : `ip:${ctx.ipHash ?? "unknown"}`}`, RATE_LIMITS.supportPerIp);
  const input = parsed.data;
  return getDb().transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({ userId: actor?.id ?? null, contactEmail, category: input.category, subject: input.subject })
      .returning({ id: supportTickets.id });
    await tx.insert(supportMessages).values({ ticketId: ticket!.id, authorUserId: actor?.id ?? null, body: input.message });
    if (input.category === "safety") {
      await notifyAdmins(tx, {
        type: "support.safety",
        title: "Support-Anfrage zu Sicherheit",
        body: input.subject,
        linkPath: `/admin/support/${ticket!.id}`,
      });
    }
    return { id: ticket!.id };
  });
}

export async function listTicketsForUser(userId: string) {
  return getDb()
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(50);
}

/** Ticket eines Nutzers inkl. Nachrichten – interne Notizen werden ausgeblendet (IDOR-Schutz über userId). */
export async function getTicketForUser(userId: string, ticketId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return null;
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
    .limit(1);
  if (!ticket) return null;
  const messages = await db
    .select({ id: supportMessages.id, body: supportMessages.body, isStaff: supportMessages.isStaff, createdAt: supportMessages.createdAt })
    .from(supportMessages)
    .where(and(eq(supportMessages.ticketId, ticket.id), eq(supportMessages.isInternalNote, false)))
    .orderBy(asc(supportMessages.createdAt));
  return { ticket, messages };
}

export async function addUserMessage(userId: string, ticketId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) throw validationError("Die Nachricht muss 1–5000 Zeichen lang sein.");
  await getDb().transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
      .for("update");
    if (!ticket) throw notFound("Anfrage nicht gefunden.");
    await tx.insert(supportMessages).values({ ticketId, authorUserId: userId, body: text });
    await tx.update(supportTickets).set({ status: "open" }).where(eq(supportTickets.id, ticketId));
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function listTicketsForAdmin(status: "open" | "waiting_for_user" | "closed" | "active" = "active") {
  return getDb()
    .select({
      id: supportTickets.id,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      username: users.username,
      isGuest: supportTickets.contactEmail,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(status === "active" ? inArray(supportTickets.status, ["open", "waiting_for_user"]) : eq(supportTickets.status, status))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(200);
}

export async function getTicketForAdmin(ticketId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return null;
  const db = getDb();
  const [row] = await db
    .select({ ticket: supportTickets, username: users.username })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!row) return null;
  const messages = await db
    .select({ message: supportMessages, authorName: users.username })
    .from(supportMessages)
    .leftJoin(users, eq(users.id, supportMessages.authorUserId))
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));
  return { ...row, messages };
}

export async function replyToTicket(input: {
  adminUserId: string;
  ticketId: string;
  body: string;
  internal: boolean;
  status: "open" | "waiting_for_user" | "closed";
  ipHash?: string | null;
}) {
  const text = input.body.trim();
  if (text.length < 1 || text.length > 5000) throw validationError("Die Antwort muss 1–5000 Zeichen lang sein.");
  await getDb().transaction(async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).for("update");
    if (!ticket) throw notFound("Anfrage nicht gefunden.");
    await tx.insert(supportMessages).values({
      ticketId: ticket.id,
      authorUserId: input.adminUserId,
      isStaff: true,
      isInternalNote: input.internal,
      body: text,
    });
    await tx.update(supportTickets).set({ status: input.status }).where(eq(supportTickets.id, ticket.id));
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: input.internal ? "support.internal_note" : "support.reply",
      targetType: "support_ticket",
      targetId: ticket.id,
      metadata: { status: input.status },
      ipHash: input.ipHash,
    });
    if (!input.internal && ticket.userId) {
      await notify(tx, {
        userId: ticket.userId,
        type: "support.reply",
        title: "Antwort vom Support",
        body: `Zu deiner Anfrage „${ticket.subject}“ gibt es eine Antwort.`,
        linkPath: `/account/support/${ticket.id}`,
      });
    }
  });
}
