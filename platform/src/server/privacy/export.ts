import "server-only";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  ageVerifications,
  chatMessages,
  creatorDeclarations,
  creatorPayoutProfiles,
  favorites,
  moderationActions,
  paymentOrders,
  payouts,
  privacyRequests,
  userBlocks,
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
import { activeCoinCurrency, getStatement } from "@/server/ledger/service";

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
      country: users.country,
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

  const [ageChecks, declarations, favs, blocks, messages, orders, ownPayouts, payoutProfile, decisions, requests] = await Promise.all([
    db.select({ provider: ageVerifications.provider, method: ageVerifications.method, status: ageVerifications.status, createdAt: ageVerifications.createdAt, verifiedAt: ageVerifications.verifiedAt }).from(ageVerifications).where(eq(ageVerifications.userId, userId)),
    db.select({ declaration: creatorDeclarations.declaration, version: creatorDeclarations.version, acceptedAt: creatorDeclarations.acceptedAt }).from(creatorDeclarations).where(eq(creatorDeclarations.userId, userId)),
    db.select({ creatorProfileId: favorites.creatorProfileId, createdAt: favorites.createdAt }).from(favorites).where(eq(favorites.userId, userId)),
    db.select({ blockedUserId: userBlocks.blockedUserId, createdAt: userBlocks.createdAt }).from(userBlocks).where(eq(userBlocks.blockerUserId, userId)),
    db.select({ sessionId: chatMessages.sessionId, kind: chatMessages.kind, body: chatMessages.body, tipAmount: chatMessages.tipAmount, createdAt: chatMessages.createdAt, deletedAt: chatMessages.deletedAt }).from(chatMessages).where(eq(chatMessages.senderUserId, userId)),
    db.select({ id: paymentOrders.id, status: paymentOrders.status, coins: paymentOrders.coins, priceCents: paymentOrders.priceCents, currency: paymentOrders.currency, simulated: paymentOrders.simulated, provider: paymentOrders.provider, createdAt: paymentOrders.createdAt }).from(paymentOrders).where(eq(paymentOrders.userId, userId)),
    db.select({ id: payouts.id, status: payouts.status, amount: payouts.amount, currency: payouts.currency, fiatAmountCents: payouts.fiatAmountCents, simulated: payouts.simulated, destinationMasked: payouts.destinationMasked, createdAt: payouts.createdAt }).from(payouts).where(eq(payouts.creatorUserId, userId)),
    // Bankverbindung nur maskiert (Schutz bei Verlust der Exportdatei); vollständige Daten auf Anfrage beim Support.
    db.select({ accountHolder: creatorPayoutProfiles.accountHolder, country: creatorPayoutProfiles.country, ibanLast4: creatorPayoutProfiles.ibanLast4, updatedAt: creatorPayoutProfiles.updatedAt }).from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, userId)),
    db.select({ action: moderationActions.action, statement: moderationActions.statement, ruleReference: moderationActions.ruleReference, createdAt: moderationActions.createdAt }).from(moderationActions).where(eq(moderationActions.affectedUserId, userId)),
    db.select({ kind: privacyRequests.kind, status: privacyRequests.status, createdAt: privacyRequests.createdAt, completedAt: privacyRequests.completedAt }).from(privacyRequests).where(eq(privacyRequests.userId, userId)),
  ]);

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
    walletStatement: user.role === "customer" ? await getStatement(userId, "customer_wallet", { limit: 10_000, currency: activeCoinCurrency() }) : [],
    earningsStatement: user.role === "creator" ? await getStatement(userId, "creator_earnings", { limit: 10_000, currency: activeCoinCurrency() }) : [],
    reportsSubmitted: ownReports,
    supportTickets: tickets.map((t) => ({ ...t, messages: ticketMessages.filter((m) => m.ticketId === t.id) })),
    sanctions: ownSanctions,
    notifications: inbox,
    ageVerifications: ageChecks,
    creatorDeclarations: declarations,
    favorites: favs,
    blockedUsers: blocks,
    chatMessages: messages,
    purchases: orders,
    payouts: ownPayouts,
    payoutProfile: payoutProfile[0] ?? null,
    moderationDecisions: decisions,
    privacyRequests: requests,
  };
}
