import "server-only";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Transaction } from "@/server/db/client";
import {
  appeals,
  creatorProfiles,
  mediaAssets,
  reports,
  sanctions,
  users,
  videoSessions,
} from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { canViewSession, hasPermission, type Actor } from "@/server/auth/permissions";
import { invalidateAllUserSessions } from "@/server/auth/session";
import { AppError, PG_UNIQUE_VIOLATION, forbidden, invalidState, notFound, pgErrorCode, validationError } from "@/server/errors";
import { notify, notifyAdmins } from "@/server/notifications/service";
import { RATE_LIMITS, enforceRateLimit } from "@/server/rate-limit";
import { endSessionByModeration } from "@/server/video/service";

/**
 * Meldungen, Sanktionen und Einsprüche.
 *
 * Meldungen zu möglichen Minderjährigen, nicht einvernehmlichen oder
 * rechtswidrigen Inhalten erhalten automatisch höchste Priorität und
 * benachrichtigen sofort alle Admins. Jede Entscheidung wird begründet und
 * im Audit-Protokoll festgehalten.
 */

export const REPORT_CATEGORIES = [
  { value: "minor_suspected", label: "Verdacht auf minderjährige Person" },
  { value: "non_consensual", label: "Nicht einvernehmliche Inhalte" },
  { value: "illegal_content", label: "Sonstige rechtswidrige Inhalte" },
  { value: "violence_or_threat", label: "Gewalt oder Drohung" },
  { value: "harassment", label: "Belästigung" },
  { value: "fraud_or_scam", label: "Betrug oder Täuschung" },
  { value: "impersonation", label: "Identitätsmissbrauch" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Sonstiges" },
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export function priorityFor(category: ReportCategory): "critical" | "high" | "normal" {
  if (category === "minor_suspected" || category === "non_consensual" || category === "illegal_content") return "critical";
  if (category === "violence_or_threat" || category === "impersonation") return "high";
  return "normal";
}

export const reportSchema = z.object({
  targetType: z.enum(["creator_profile", "user", "video_session", "media"]),
  targetId: z.uuid("Ungültiges Meldungsziel."),
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value) as [ReportCategory, ...ReportCategory[]], {
    error: "Bitte wähle einen Grund.",
  }),
  description: z
    .string()
    .trim()
    .min(10, "Bitte beschreibe den Vorfall (mind. 10 Zeichen).")
    .max(4000, "Die Beschreibung darf höchstens 4000 Zeichen lang sein."),
});

/** Prüft, ob das Meldungsziel existiert und für den Meldenden zugänglich ist (kein Ausspähen fremder Sitzungen). */
async function assertReportTarget(actor: Actor, targetType: string, targetId: string) {
  const db = getDb();
  if (targetType === "creator_profile") {
    const [row] = await db.select({ id: creatorProfiles.id }).from(creatorProfiles).where(eq(creatorProfiles.id, targetId)).limit(1);
    if (!row) throw notFound("Profil nicht gefunden.");
  } else if (targetType === "user") {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!row) throw notFound("Konto nicht gefunden.");
  } else if (targetType === "video_session") {
    const [row] = await db.select().from(videoSessions).where(eq(videoSessions.id, targetId)).limit(1);
    if (!row || (row.kind === "private_chat" && !canViewSession(actor, row))) throw notFound("Sitzung nicht gefunden.");
  } else if (targetType === "media") {
    const [row] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, targetId)).limit(1);
    if (!row) throw notFound("Inhalt nicht gefunden.");
  }
}

export async function createReport(actor: Actor, rawInput: unknown) {
  if (!hasPermission(actor, "reports.create")) {
    throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  const parsed = reportSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Meldung.");
  await enforceRateLimit(`report:${actor.id}`, RATE_LIMITS.reportsPerUser);
  const input = parsed.data;
  await assertReportTarget(actor, input.targetType, input.targetId);
  const priority = priorityFor(input.category);
  return getDb().transaction(async (tx) => {
    const [report] = await tx
      .insert(reports)
      .values({ reporterUserId: actor.id, ...input, priority })
      .returning({ id: reports.id });
    if (priority !== "normal") {
      await notifyAdmins(tx, {
        type: "report.priority",
        title: priority === "critical" ? "KRITISCHE Meldung eingegangen" : "Dringende Meldung eingegangen",
        body: `Kategorie: ${REPORT_CATEGORIES.find((c) => c.value === input.category)?.label}. Bitte umgehend prüfen.`,
        linkPath: `/admin/reports/${report!.id}`,
      });
    }
    return { id: report!.id, priority };
  });
}

export async function listReports(filter: { status?: "open" | "in_review" | "closed" } = {}) {
  const statusCondition =
    filter.status === "closed"
      ? inArray(reports.status, ["action_taken", "no_action", "dismissed"])
      : filter.status
        ? eq(reports.status, filter.status)
        : inArray(reports.status, ["open", "in_review"]);
  return getDb()
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      category: reports.category,
      priority: reports.priority,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterName: users.username,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterUserId))
    .where(statusCondition)
    .orderBy(sql`CASE ${reports.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`, desc(reports.createdAt))
    .limit(200);
}

export async function getReport(reportId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;
  const [row] = await getDb()
    .select({ report: reports, reporterName: users.username })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterUserId))
    .where(eq(reports.id, reportId))
    .limit(1);
  return row ?? null;
}

export async function listReportsByUser(userId: string) {
  return getDb()
    .select({ id: reports.id, category: reports.category, status: reports.status, createdAt: reports.createdAt, targetType: reports.targetType })
    .from(reports)
    .where(eq(reports.reporterUserId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(50);
}

/** Ziel einer Meldung auf das betroffene Konto zurückführen (für Sanktionen). */
export async function resolveReportTargetUser(targetType: string, targetId: string): Promise<string | null> {
  const db = getDb();
  if (targetType === "user") return targetId;
  if (targetType === "creator_profile") {
    const [row] = await db.select({ userId: creatorProfiles.userId }).from(creatorProfiles).where(eq(creatorProfiles.id, targetId)).limit(1);
    return row?.userId ?? null;
  }
  if (targetType === "media") {
    const [row] = await db.select({ userId: mediaAssets.ownerUserId }).from(mediaAssets).where(eq(mediaAssets.id, targetId)).limit(1);
    return row?.userId ?? null;
  }
  if (targetType === "video_session") {
    const [row] = await db.select({ userId: videoSessions.creatorUserId }).from(videoSessions).where(eq(videoSessions.id, targetId)).limit(1);
    return row?.userId ?? null;
  }
  return null;
}

export async function updateReport(input: {
  adminUserId: string;
  reportId: string;
  status: "in_review" | "action_taken" | "no_action" | "dismissed";
  note: string;
  ipHash?: string | null;
}) {
  const note = input.note.trim();
  if (input.status !== "in_review" && note.length < 10) {
    throw validationError("Bitte dokumentiere die Entscheidung (mind. 10 Zeichen).");
  }
  await getDb().transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, input.reportId)).for("update");
    if (!report) throw notFound("Meldung nicht gefunden.");
    const closing = input.status !== "in_review";
    await tx
      .update(reports)
      .set({
        status: input.status,
        assignedAdminId: input.adminUserId,
        resolutionNote: note || report.resolutionNote,
        resolvedAt: closing ? new Date() : null,
      })
      .where(eq(reports.id, report.id));
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: `report.${input.status}`,
      targetType: "report",
      targetId: report.id,
      reason: note || undefined,
      metadata: { previousStatus: report.status, category: report.category, priority: report.priority },
      ipHash: input.ipHash,
    });
    if (closing && report.reporterUserId) {
      await notify(tx, {
        userId: report.reporterUserId,
        type: "report.closed",
        title: "Deine Meldung wurde bearbeitet",
        body: "Danke für deine Meldung. Wir haben sie geprüft und entsprechende Schritte eingeleitet.",
        linkPath: "/account/support",
      });
    }
  });
}

// ── Sanktionen ──────────────────────────────────────────────────────────────

export const sanctionSchema = z.object({
  userId: z.uuid(),
  kind: z.enum(["warning", "suspension", "profile_hidden"]),
  reason: z.string().trim().min(10, "Bitte begründe die Maßnahme (mind. 10 Zeichen).").max(2000),
  durationDays: z.coerce.number().int().min(0).max(3650).optional(),
  reportId: z.uuid().optional(),
});

export async function getActiveSanctions(userId: string) {
  const now = new Date();
  return getDb()
    .select()
    .from(sanctions)
    .where(and(eq(sanctions.userId, userId), isNull(sanctions.liftedAt), or(isNull(sanctions.endsAt), gt(sanctions.endsAt, now))))
    .orderBy(desc(sanctions.createdAt));
}

export async function listSanctionsForUser(userId: string) {
  return getDb()
    .select({ sanction: sanctions, appealStatus: appeals.status, appealId: appeals.id })
    .from(sanctions)
    .leftJoin(appeals, eq(appeals.sanctionId, sanctions.id))
    .where(eq(sanctions.userId, userId))
    .orderBy(desc(sanctions.createdAt));
}

export async function createSanction(adminUserId: string, rawInput: unknown, ipHash?: string | null) {
  const parsed = sanctionSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const input = parsed.data;
  if (input.userId === adminUserId) throw invalidState("Du kannst dich nicht selbst sanktionieren.");
  return getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!target || target.status === "deleted") throw notFound("Konto nicht gefunden.");
    if (target.role === "admin") throw forbidden("Admin-Konten werden über den Betrieb verwaltet.");
    const endsAt = input.durationDays ? new Date(Date.now() + input.durationDays * 86_400_000) : null;
    const [sanction] = await tx
      .insert(sanctions)
      .values({ userId: target.id, kind: input.kind, reason: input.reason, reportId: input.reportId ?? null, createdById: adminUserId, endsAt })
      .returning();
    if (input.kind === "suspension") {
      await tx.update(users).set({ status: "suspended" }).where(eq(users.id, target.id));
      await tx.update(creatorProfiles).set({ availability: "offline" }).where(eq(creatorProfiles.userId, target.id));
      // Laufende Sitzungen des Kontos beenden und Anmeldungen ungültig machen.
      const open = await tx
        .select({ id: videoSessions.id })
        .from(videoSessions)
        .where(
          and(
            or(eq(videoSessions.creatorUserId, target.id), eq(videoSessions.customerUserId, target.id)),
            inArray(videoSessions.status, ["requested", "accepted", "active"]),
          ),
        );
      for (const session of open) await endSessionByModeration(adminUserId, session.id, tx);
      await invalidateAllUserSessions(tx, target.id);
    }
    if (input.kind === "profile_hidden") {
      await tx
        .update(creatorProfiles)
        .set({ reviewStatus: "suspended", availability: "offline" })
        .where(eq(creatorProfiles.userId, target.id));
    }
    await writeAuditLog(tx, {
      actorUserId: adminUserId,
      action: `sanction.${input.kind}`,
      targetType: "user",
      targetId: target.id,
      reason: input.reason,
      metadata: { sanctionId: sanction!.id, endsAt: endsAt?.toISOString() ?? null, reportId: input.reportId ?? null },
      ipHash,
    });
    await notify(tx, {
      userId: target.id,
      type: `sanction.${input.kind}`,
      title: input.kind === "warning" ? "Verwarnung" : input.kind === "suspension" ? "Konto gesperrt" : "Profil ausgeblendet",
      body: `Begründung: ${input.reason} Du kannst Einspruch einlegen.`,
      linkPath: "/account/support",
    });
    return sanction!;
  });
}

export async function liftSanction(input: { adminUserId: string; sanctionId: string; reason: string; ipHash?: string | null }) {
  if (input.reason.trim().length < 10) throw validationError("Bitte begründe die Aufhebung (mind. 10 Zeichen).");
  await getDb().transaction(async (tx) => {
    const [sanction] = await tx.select().from(sanctions).where(eq(sanctions.id, input.sanctionId)).for("update");
    if (!sanction) throw notFound("Maßnahme nicht gefunden.");
    if (sanction.liftedAt) throw new AppError("conflict", "Die Maßnahme wurde bereits aufgehoben.");
    await liftSanctionInTx(tx, sanction, input.adminUserId, input.reason.trim());
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: "sanction.lift",
      targetType: "user",
      targetId: sanction.userId,
      reason: input.reason.trim(),
      metadata: { sanctionId: sanction.id },
      ipHash: input.ipHash,
    });
  });
}

async function liftSanctionInTx(
  tx: Transaction,
  sanction: typeof sanctions.$inferSelect,
  adminUserId: string,
  reason: string,
) {
  const now = new Date();
  await tx.update(sanctions).set({ liftedAt: now, liftedById: adminUserId, liftReason: reason }).where(eq(sanctions.id, sanction.id));
  const remaining = await tx
    .select({ kind: sanctions.kind })
    .from(sanctions)
    .where(and(eq(sanctions.userId, sanction.userId), isNull(sanctions.liftedAt), or(isNull(sanctions.endsAt), gt(sanctions.endsAt, now))));
  if (sanction.kind === "suspension" && !remaining.some((r) => r.kind === "suspension")) {
    await tx.update(users).set({ status: "active" }).where(and(eq(users.id, sanction.userId), eq(users.status, "suspended")));
  }
  if (sanction.kind === "profile_hidden" && !remaining.some((r) => r.kind === "profile_hidden")) {
    await tx
      .update(creatorProfiles)
      .set({ reviewStatus: "pending_review" })
      .where(and(eq(creatorProfiles.userId, sanction.userId), eq(creatorProfiles.reviewStatus, "suspended")));
  }
  await notify(tx, {
    userId: sanction.userId,
    type: "sanction.lifted",
    title: "Maßnahme aufgehoben",
    body: "Eine Maßnahme gegen dein Konto wurde aufgehoben.",
    linkPath: "/account",
  });
}

/** Befristete Sperren nach Ablauf automatisch aufheben (lazy beim Login bzw. per Job). */
export async function expireSuspension(userId: string) {
  const db = getDb();
  const [user] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.status !== "suspended") return false;
  const active = await getActiveSanctions(userId);
  if (active.some((s) => s.kind === "suspension")) return false;
  await db.update(users).set({ status: "active" }).where(and(eq(users.id, userId), eq(users.status, "suspended")));
  return true;
}

// ── Einsprüche ──────────────────────────────────────────────────────────────

export async function createAppeal(actor: Actor, input: { sanctionId: string; message: string }) {
  if (!hasPermission(actor, "appeals.create")) throw forbidden();
  const message = input.message.trim();
  if (message.length < 20) throw validationError("Bitte begründe deinen Einspruch (mind. 20 Zeichen).");
  if (message.length > 4000) throw validationError("Der Einspruch darf höchstens 4000 Zeichen lang sein.");
  await enforceRateLimit(`appeal:${actor.id}`, RATE_LIMITS.reportsPerUser);
  const db = getDb();
  const [sanction] = await db.select().from(sanctions).where(eq(sanctions.id, input.sanctionId)).limit(1);
  if (!sanction || sanction.userId !== actor.id) throw notFound("Maßnahme nicht gefunden.");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(appeals).values({ sanctionId: sanction.id, userId: actor.id, message });
      await notifyAdmins(tx, {
        type: "appeal.created",
        title: "Neuer Einspruch",
        body: "Ein Einspruch gegen eine Maßnahme wartet auf Entscheidung.",
        linkPath: "/admin/sanctions",
      });
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new AppError("conflict", "Gegen diese Maßnahme wurde bereits Einspruch eingelegt.");
    }
    throw error;
  }
}

export async function listOpenAppeals() {
  return getDb()
    .select({ appeal: appeals, sanction: sanctions, username: users.username })
    .from(appeals)
    .innerJoin(sanctions, eq(sanctions.id, appeals.sanctionId))
    .innerJoin(users, eq(users.id, appeals.userId))
    .where(eq(appeals.status, "open"))
    .orderBy(desc(appeals.createdAt));
}

export async function listRecentSanctions(limit = 100) {
  return getDb()
    .select({ sanction: sanctions, username: users.username })
    .from(sanctions)
    .innerJoin(users, eq(users.id, sanctions.userId))
    .orderBy(desc(sanctions.createdAt))
    .limit(limit);
}

export async function decideAppeal(input: {
  adminUserId: string;
  appealId: string;
  decision: "upheld" | "overturned";
  note: string;
  ipHash?: string | null;
}) {
  if (input.note.trim().length < 10) throw validationError("Bitte begründe die Entscheidung (mind. 10 Zeichen).");
  await getDb().transaction(async (tx) => {
    const [appeal] = await tx.select().from(appeals).where(eq(appeals.id, input.appealId)).for("update");
    if (!appeal) throw notFound("Einspruch nicht gefunden.");
    if (appeal.status !== "open") throw new AppError("conflict", "Über diesen Einspruch wurde bereits entschieden.");
    await tx
      .update(appeals)
      .set({ status: input.decision, decidedById: input.adminUserId, decisionNote: input.note.trim(), decidedAt: new Date() })
      .where(eq(appeals.id, appeal.id));
    if (input.decision === "overturned") {
      const [sanction] = await tx.select().from(sanctions).where(eq(sanctions.id, appeal.sanctionId)).for("update");
      if (sanction && !sanction.liftedAt) await liftSanctionInTx(tx, sanction, input.adminUserId, `Einspruch stattgegeben: ${input.note.trim()}`);
    }
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: `appeal.${input.decision}`,
      targetType: "appeal",
      targetId: appeal.id,
      reason: input.note.trim(),
      metadata: { sanctionId: appeal.sanctionId },
      ipHash: input.ipHash,
    });
    await notify(tx, {
      userId: appeal.userId,
      type: "appeal.decided",
      title: input.decision === "overturned" ? "Einspruch stattgegeben" : "Einspruch abgelehnt",
      body: `Begründung: ${input.note.trim()}`,
      linkPath: "/account/support",
    });
  });
}
