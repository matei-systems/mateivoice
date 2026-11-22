import "server-only";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { ledgerAccounts, ledgerEntries, ledgerTransactions, paymentOrders, payouts } from "@/server/db/schema";
import { activeCoinCurrency, reconcileLedger, type CoinCurrency } from "@/server/ledger/service";

/**
 * Finanzberichte auf Basis des Buchungsjournals (Quelle der Wahrheit) und der
 * Bestellungen (Euro-Beträge). Zeiträume: [from, to) in UTC.
 * Im Testmodus beziehen sich alle Werte auf Testmünzen und Sandbox-Bestellungen.
 */

export type ReportPeriod = { from: Date; to: Date };

/** „YYYY-MM“ → Monatszeitraum (Europe/Vienna wird für Berichte vereinfacht als UTC-Monat behandelt). */
export function monthPeriod(month: string | undefined, now = new Date()): ReportPeriod & { month: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const safeMonth = Math.min(Math.max(monthIndex, 0), 11);
  const from = new Date(Date.UTC(year, safeMonth, 1));
  const to = new Date(Date.UTC(year, safeMonth + 1, 1));
  return { from, to, month: `${year}-${String(safeMonth + 1).padStart(2, "0")}` };
}

type FlowRow = { txKind: string; accountKind: string; total: number; count: number };

export async function getFinanceReport(period: ReportPeriod, currency: CoinCurrency = activeCoinCurrency()) {
  const db = getDb();
  const flows: FlowRow[] = (
    await db
      .select({
        txKind: ledgerTransactions.kind,
        accountKind: ledgerAccounts.kind,
        total: sql<number>`sum(${ledgerEntries.amount})::bigint`.mapWith(Number),
        count: sql<number>`count(DISTINCT ${ledgerTransactions.id})::int`,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
      .where(and(eq(ledgerTransactions.currency, currency), gte(ledgerTransactions.createdAt, period.from), lt(ledgerTransactions.createdAt, period.to)))
      .groupBy(ledgerTransactions.kind, ledgerAccounts.kind)
  ).map((row) => ({ ...row, total: Number(row.total) }));

  const flow = (txKind: string, accountKind: string) => flows.find((f) => f.txKind === txKind && f.accountKind === accountKind)?.total ?? 0;
  const count = (txKind: string) => Math.max(0, ...flows.filter((f) => f.txKind === txKind).map((f) => f.count));

  const simulated = currency === "TEST_COIN";
  const orderRows = await db
    .select({
      status: paymentOrders.status,
      count: sql<number>`count(*)::int`,
      coins: sql<number>`coalesce(sum(${paymentOrders.coins}), 0)::bigint`.mapWith(Number),
      cents: sql<number>`coalesce(sum(${paymentOrders.priceCents}), 0)::bigint`.mapWith(Number),
    })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.simulated, simulated), gte(paymentOrders.updatedAt, period.from), lt(paymentOrders.updatedAt, period.to)))
    .groupBy(paymentOrders.status);
  const orders = (status: string) => orderRows.find((r) => r.status === status) ?? { count: 0, coins: 0, cents: 0 };

  const payoutRows = await db
    .select({
      status: payouts.status,
      count: sql<number>`count(*)::int`,
      coins: sql<number>`coalesce(sum(${payouts.amount}), 0)::bigint`.mapWith(Number),
      cents: sql<number>`coalesce(sum(${payouts.fiatAmountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(payouts)
    .where(and(eq(payouts.currency, currency), gte(payouts.updatedAt, period.from), lt(payouts.updatedAt, period.to)))
    .groupBy(payouts.status);
  const payoutStat = (status: string) => payoutRows.find((r) => r.status === status) ?? { count: 0, coins: 0, cents: 0 };

  const balances = await db
    .select({ kind: ledgerAccounts.kind, total: sql<number>`coalesce(sum(${ledgerAccounts.balance}), 0)::bigint`.mapWith(Number) })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.currency, currency))
    .groupBy(ledgerAccounts.kind);
  const balance = (kind: string) => balances.find((b) => b.kind === kind)?.total ?? 0;

  const consumption = {
    sessions: { gross: -flow("session_charge", "customer_wallet"), creator: flow("session_charge", "creator_earnings"), platform: flow("session_charge", "platform_revenue"), count: count("session_charge") },
    tips: { gross: -flow("tip", "customer_wallet"), creator: flow("tip", "creator_earnings"), platform: flow("tip", "platform_revenue"), count: count("tip") },
  };

  return {
    currency,
    simulated,
    period,
    purchases: { confirmed: orders("confirmed"), failed: orders("failed"), pending: orders("pending"), refunded: orders("refunded"), chargedBack: orders("charged_back") },
    coins: {
      purchased: flow("purchase", "customer_wallet"),
      testCredits: flow("test_credit", "customer_wallet"),
      refunds: flow("refund", "system_payment_clearing"),
      chargebacks: flow("chargeback", "system_payment_clearing"),
      platformLossFromReversals: -(flow("refund", "platform_revenue") + flow("chargeback", "platform_revenue")),
    },
    consumption,
    totals: {
      gross: consumption.sessions.gross + consumption.tips.gross,
      creatorShare: consumption.sessions.creator + consumption.tips.creator,
      platformShare: consumption.sessions.platform + consumption.tips.platform,
    },
    payouts: { requested: payoutStat("requested"), approved: payoutStat("approved"), completed: payoutStat("completed"), rejected: payoutStat("rejected"), failed: payoutStat("failed") },
    liabilities: {
      customerWallets: balance("customer_wallet"),
      creatorEarnings: balance("creator_earnings"),
      payoutsInFlight: balance("system_payout_clearing"),
      paidOut: balance("system_payout_settled"),
      platformRevenue: balance("platform_revenue"),
    },
    reconciliation: await reconcileLedger(),
  };
}

export type FinanceReport = Awaited<ReturnType<typeof getFinanceReport>>;

/** CSV-Zelle: Texte gegen Formel-Injektion absichern, Zahlen unverändert. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Buchungsjournal eines Zeitraums als CSV (Semikolon-getrennt, für Excel im DACH-Raum). */
export async function exportLedgerCsv(period: ReportPeriod, currency: CoinCurrency = activeCoinCurrency()) {
  const rows = await getDb()
    .select({
      createdAt: ledgerTransactions.createdAt,
      transactionId: ledgerTransactions.id,
      kind: ledgerTransactions.kind,
      description: ledgerTransactions.description,
      commissionBps: ledgerTransactions.commissionBps,
      referenceType: ledgerTransactions.referenceType,
      referenceId: ledgerTransactions.referenceId,
      reversalOfId: ledgerTransactions.reversalOfId,
      accountKind: ledgerAccounts.kind,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(and(eq(ledgerTransactions.currency, currency), gte(ledgerTransactions.createdAt, period.from), lt(ledgerTransactions.createdAt, period.to)))
    .orderBy(asc(ledgerTransactions.createdAt), asc(ledgerTransactions.id))
    .limit(100_000);
  const header = ["Zeitpunkt (UTC)", "Buchung", "Art", "Beschreibung", "Konto", "Betrag (Münzen)", "Provision (bps)", "Referenztyp", "Referenz", "Storno von", "Währung"];
  const lines = [header.join(";")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.createdAt.toISOString()),
        csvCell(row.transactionId),
        csvCell(row.kind),
        csvCell(row.description),
        csvCell(row.accountKind),
        csvCell(Number(row.amount)),
        csvCell(row.commissionBps),
        csvCell(row.referenceType),
        csvCell(row.referenceId),
        csvCell(row.reversalOfId),
        csvCell(currency),
      ].join(";"),
    );
  }
  // BOM für korrekte Umlaute in Excel
  return `﻿${lines.join("\r\n")}\r\n`;
}
