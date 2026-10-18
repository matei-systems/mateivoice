import "server-only";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  authSessions,
  creatorOffers,
  creatorProfiles,
  creatorVerifications,
  notificationPreferences,
  notifications,
  reports,
  sanctions,
  supportMessages,
  supportTickets,
  userConsents,
  users,
  videoSessions,
} from "@/server/db/schema";
import { getStatement } from "@/server/ledger/service";

/**
 * Datenexport für Betroffene (Art. 15/20 DSGVO). Enthält nur Daten der
 * anfragenden Person – keine Daten Dritter, keine internen Notizen, keine
 * Sicherheitsgeheimnisse (Passwort-Hash, TOTP-Geheimnis, Token-Hashes).
 */
export async function exportUserData(userId: string) {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      adultSelfDeclaredAt: users.adultSelfDeclaredAt,
      twoFactorEnabled: users.totpEnabledAt,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [consents, preferences, sessions, profile, verifications, sessionsAsParticipant, ownReports, tickets, ownSanctions, inbox] = await Promise.all([
    db.select({ document: userConsents.document, version: userConsents.documentVersion, acceptedAt: userConsents.acceptedAt }).from(userConsents).where(eq(userConsents.userId, userId)),
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db.select({ createdAt: authSessions.createdAt, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, userAgent: authSessions.userAgent }).from(authSessions).where(eq(authSessions.userId, userId)),
    db.select().from(creatorProfiles).leftJoin(creatorOffers, eq(creatorOffers.creatorProfileId, creatorProfiles.id)).where(eq(creatorProfiles.userId, userId)),
    db.select({ provider: creatorVerifications.provider, status: creatorVerifications.status, createdAt: creatorVerifications.createdAt }).from(creatorVerifications).where(eq(creatorVerifications.userId, userId)),
    db
      .select({
        id: videoSessions.id,
        kind: videoSessions.kind,
        status: videoSessions.status,
        requestedAt: videoSessions.requestedAt,
        startedAt: videoSessions.startedAt,
        endedAt: videoSessions.endedAt,
        chargedMinutes: videoSessions.chargedMinutes,
        totalCoins: videoSessions.totalCoins,
        coinsPerMinute: videoSessions.coinsPerMinute,
      })
      .from(videoSessions)
      .where(or(eq(videoSessions.customerUserId, userId), and(eq(videoSessions.creatorUserId, userId), eq(videoSessions.kind, "private_chat")))),
    db.select({ id: reports.id, category: reports.category, status: reports.status, description: reports.description, createdAt: reports.createdAt }).from(reports).where(eq(reports.reporterUserId, userId)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, userId)),
    db.select({ kind: sanctions.kind, reason: sanctions.reason, startsAt: sanctions.startsAt, endsAt: sanctions.endsAt, liftedAt: sanctions.liftedAt }).from(sanctions).where(eq(sanctions.userId, userId)),
    db.select({ title: notifications.title, body: notifications.body, createdAt: notifications.createdAt, readAt: notifications.readAt }).from(notifications).where(eq(notifications.userId, userId)),
  ]);

  const ticketMessages = tickets.length
    ? await db
        .select({ ticketId: supportMessages.ticketId, isStaff: supportMessages.isStaff, body: supportMessages.body, createdAt: supportMessages.createdAt })
        .from(supportMessages)
        .innerJoin(supportTickets, eq(supportTickets.id, supportMessages.ticketId))
        .where(and(eq(supportTickets.userId, userId), eq(supportMessages.isInternalNote, false)))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    notice: "Export deiner bei der Plattform gespeicherten Daten (Prototyp/Testmodus).",
    account: user,
    consents,
    notificationPreferences: preferences[0] ?? null,
    activeLogins: sessions,
    creatorProfile: profile[0] ?? null,
    verifications,
    videoSessions: sessionsAsParticipant,
    walletStatement: user.role === "customer" ? await getStatement(userId, "customer_wallet", { limit: 10_000 }) : [],
    earningsStatement: user.role === "creator" ? await getStatement(userId, "creator_earnings", { limit: 10_000 }) : [],
    reportsSubmitted: ownReports,
    supportTickets: tickets.map((t) => ({ ...t, messages: ticketMessages.filter((m) => m.ticketId === t.id) })),
    sanctions: ownSanctions,
    notifications: inbox,
  };
}
