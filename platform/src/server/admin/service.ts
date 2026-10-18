import "server-only";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { commission, pricing, testCoins, uploads, videoSessions as videoConfig } from "@/config/platform";
import { getDb } from "@/server/db/client";
import {
  adminAuditLogs,
  creatorProfiles,
  ledgerAccounts,
  ledgerTransactions,
  reports,
  supportTickets,
  users,
  videoSessions,
} from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { notFound } from "@/server/errors";
import { getEmailAdapter } from "@/server/notifications/email";
import { getPaymentProvider } from "@/server/payments/provider";
import { payoutAvailability } from "@/server/payouts/service";
import { getVideoProvider } from "@/server/video/provider";
import { getIdentityProvider } from "@/server/verification/service";

/** Kennzahlen für das Admin-Dashboard (ausschließlich aus Datenbankwerten, keine Schätzungen). */
export async function getDashboardStats() {
  const db = getDb();
  const [userStats] = await db
    .select({
      customers: sql<number>`count(*) FILTER (WHERE ${users.role} = 'customer' AND ${users.status} <> 'deleted')::int`,
      creators: sql<number>`count(*) FILTER (WHERE ${users.role} = 'creator' AND ${users.status} <> 'deleted')::int`,
      suspended: sql<number>`count(*) FILTER (WHERE ${users.status} = 'suspended')::int`,
      unverifiedEmail: sql<number>`count(*) FILTER (WHERE ${users.emailVerifiedAt} IS NULL AND ${users.status} <> 'deleted')::int`,
    })
    .from(users);
  const [creatorStats] = await db
    .select({
      pendingReview: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.reviewStatus} = 'pending_review')::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.reviewStatus} = 'approved')::int`,
      live: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.availability} = 'live')::int`,
      inPrivate: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.availability} = 'in_private')::int`,
    })
    .from(creatorProfiles);
  const [reportStats] = await db
    .select({
      open: sql<number>`count(*) FILTER (WHERE ${reports.status} IN ('open', 'in_review'))::int`,
      critical: sql<number>`count(*) FILTER (WHERE ${reports.status} IN ('open', 'in_review') AND ${reports.priority} = 'critical')::int`,
    })
    .from(reports);
  const [sessionStats] = await db
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${videoSessions.status} = 'active' AND ${videoSessions.kind} = 'private_chat')::int`,
      totalPrivate: sql<number>`count(*) FILTER (WHERE ${videoSessions.kind} = 'private_chat' AND ${videoSessions.status} = 'ended')::int`,
      billedMinutes: sql<number>`coalesce(sum(${videoSessions.chargedMinutes}) FILTER (WHERE ${videoSessions.kind} = 'private_chat'), 0)::int`,
    })
    .from(videoSessions);
  const [ledgerStats] = await db
    .select({
      platformRevenue: sql<number>`coalesce(sum(${ledgerAccounts.balance}) FILTER (WHERE ${ledgerAccounts.kind} = 'platform_revenue' AND ${ledgerAccounts.currency} = 'TEST_COIN'), 0)::bigint`,
      creatorEarnings: sql<number>`coalesce(sum(${ledgerAccounts.balance}) FILTER (WHERE ${ledgerAccounts.kind} = 'creator_earnings' AND ${ledgerAccounts.currency} = 'TEST_COIN'), 0)::bigint`,
      customerBalances: sql<number>`coalesce(sum(${ledgerAccounts.balance}) FILTER (WHERE ${ledgerAccounts.kind} = 'customer_wallet' AND ${ledgerAccounts.currency} = 'TEST_COIN'), 0)::bigint`,
      issued: sql<number>`coalesce(-sum(${ledgerAccounts.balance}) FILTER (WHERE ${ledgerAccounts.kind} IN ('system_test_issuance', 'system_payment_clearing') AND ${ledgerAccounts.currency} = 'TEST_COIN'), 0)::bigint`,
    })
    .from(ledgerAccounts);
  const [ticketStats] = await db
    .select({ open: sql<number>`count(*) FILTER (WHERE ${supportTickets.status} IN ('open', 'waiting_for_user'))::int` })
    .from(supportTickets);
  return {
    users: userStats!,
    creators: creatorStats!,
    reports: reportStats!,
    sessions: sessionStats!,
    ledger: {
      platformRevenue: Number(ledgerStats?.platformRevenue ?? 0),
      creatorEarnings: Number(ledgerStats?.creatorEarnings ?? 0),
      customerBalances: Number(ledgerStats?.customerBalances ?? 0),
      issued: Number(ledgerStats?.issued ?? 0),
    },
    tickets: ticketStats!,
  };
}

/** E-Mail-Adressen werden in Listen maskiert (Datensparsamkeit für Admins). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain.replace(/^[^.]+/, (part) => `${part.slice(0, 1)}•••`)}`;
}

export async function listUsers(filter: { q?: string; role?: "customer" | "creator" | "admin"; status?: "active" | "suspended" | "deleted"; page?: number }) {
  const conditions: SQL[] = [];
  if (filter.q) {
    const pattern = `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(users.username, pattern), ilike(users.email, pattern))!);
  }
  if (filter.role) conditions.push(eq(users.role, filter.role));
  if (filter.status) conditions.push(eq(users.status, filter.status));
  const page = Math.max(1, filter.page ?? 1);
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabledAt: users.totpEnabledAt,
      isTestAccount: users.isTestAccount,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(50)
    .offset((page - 1) * 50);
  return rows.map(({ email, ...row }) => ({ ...row, maskedEmail: maskEmail(email) }));
}

export async function getUserForAdmin(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [user] = await getDb()
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabledAt: users.totpEnabledAt,
      isTestAccount: users.isTestAccount,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      adultSelfDeclaredAt: users.adultSelfDeclaredAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  const { email, ...rest } = user;
  return { ...rest, maskedEmail: maskEmail(email) };
}

/** Vollständige E-Mail nur auf ausdrückliche Anforderung – wird protokolliert. */
export async function revealUserEmail(adminUserId: string, userId: string, reason: string, ipHash?: string | null) {
  if (reason.trim().length < 10) throw new Error("Begründung erforderlich");
  const db = getDb();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound("Konto nicht gefunden.");
  await writeAuditLog(db, {
    actorUserId: adminUserId,
    action: "user.reveal_email",
    targetType: "user",
    targetId: userId,
    reason: reason.trim(),
    ipHash,
  });
  return user.email;
}

export async function listAuditLogs(page = 1) {
  return getDb()
    .select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      reason: adminAuditLogs.reason,
      metadata: adminAuditLogs.metadata,
      createdAt: adminAuditLogs.createdAt,
      actorName: users.username,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(users.id, adminAuditLogs.actorUserId))
    .orderBy(desc(adminAuditLogs.id))
    .limit(100)
    .offset((Math.max(1, page) - 1) * 100);
}

export async function listLedgerTransactions(limit = 100) {
  return getDb()
    .select({
      id: ledgerTransactions.id,
      kind: ledgerTransactions.kind,
      currency: ledgerTransactions.currency,
      simulated: ledgerTransactions.simulated,
      description: ledgerTransactions.description,
      commissionBps: ledgerTransactions.commissionBps,
      reversalOfId: ledgerTransactions.reversalOfId,
      createdAt: ledgerTransactions.createdAt,
      actorName: users.username,
      gross: sql<number>`(SELECT coalesce(sum(e.amount), 0) FROM ledger_entries e WHERE e.transaction_id = ${ledgerTransactions.id} AND e.amount > 0)::bigint`,
      isReversed: sql<boolean>`EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reversal_of_id = ${ledgerTransactions.id})`,
    })
    .from(ledgerTransactions)
    .leftJoin(users, eq(users.id, ledgerTransactions.actorUserId))
    .orderBy(desc(ledgerTransactions.createdAt))
    .limit(limit);
}

/** Nicht geheime Konfiguration für die Admin-Ansicht. Geheimnisse werden niemals angezeigt. */
export function getConfigOverview() {
  const env = getEnv();
  return {
    environment: env.APP_ENV,
    testMode: env.TEST_MODE,
    appUrl: env.APP_URL,
    providers: {
      email: { name: getEmailAdapter().name, real: getEmailAdapter().deliversRealEmail },
      payment: { name: getPaymentProvider()?.name ?? "keiner", real: getPaymentProvider()?.isReal ?? false },
      payout: { name: env.PAYOUT_PROVIDER, real: false, note: payoutAvailability().reason },
      video: { name: getVideoProvider()?.name ?? "keiner", real: getVideoProvider()?.isReal ?? false },
      identity: { name: getIdentityProvider()?.name ?? "keiner", real: getIdentityProvider()?.isReal ?? false },
      storage: { name: env.STORAGE_DRIVER, real: true },
    },
    commission: { platformBps: env.PLATFORM_COMMISSION_BPS, status: commission.status, basis: commission.basisDescription },
    pricing,
    testCoins,
    videoSessions: videoConfig,
    uploads: { maxBytes: uploads.maxBytes, allowedMimeTypes: uploads.allowedMimeTypes, maxGalleryImages: uploads.maxGalleryImages },
  };
}
