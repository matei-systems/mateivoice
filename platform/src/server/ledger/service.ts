import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getEnv, isTestMode } from "@/config/env";
import { testCoins } from "@/config/platform";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { ledgerAccounts, ledgerEntries, ledgerTransactions, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { AppError, featureUnavailable, notFound, validationError } from "@/server/errors";
import { viennaDayKey } from "@/lib/utils";

/**
 * Serverseitiges Buchungsjournal (doppelte Buchführung in ganzen Münzen).
 *
 * Garantien:
 *  - Idempotenz: Jede Buchung trägt einen eindeutigen idempotencyKey. Eine
 *    Wiederholung liefert die bestehende Buchung statt einer zweiten.
 *  - Atomarität: Buchung, Einträge und Salden werden in EINER DB-Transaktion
 *    geschrieben; beteiligte Konten werden in fester Reihenfolge gesperrt
 *    (SELECT … FOR UPDATE), um Überziehungen und Deadlocks zu verhindern.
 *  - Ausgeglichenheit und Unveränderlichkeit werden zusätzlich per DB-Trigger
 *    erzwungen (drizzle/0001_integrity_triggers.sql).
 *  - Testmünzen (TEST_COIN) sind immer „simuliert“ und können per Constraint
 *    nicht ausgezahlt werden. Echte Münzen (COIN) sind im Prototyp gesperrt.
 */

export type CoinCurrency = "TEST_COIN" | "COIN";
export type AccountKind = (typeof ledgerAccounts.$inferSelect)["kind"];
export type TransactionKind = (typeof ledgerTransactions.$inferSelect)["kind"];

const NEGATIVE_ALLOWED: ReadonlySet<AccountKind> = new Set([
  "system_test_issuance",
  "system_payment_clearing",
  "system_payout_clearing",
  // Vorläufig: Rückerstattungen nach Gutschrift können Creator-/Plattformkonten
  // ins Minus bringen (Verrechnung mit künftigen Einnahmen – vertraglich zu klären).
  "creator_earnings",
  "platform_revenue",
]);

const OWNED_KINDS: ReadonlySet<AccountKind> = new Set(["customer_wallet", "creator_earnings"]);

/** Echte Münzen sind erst nach rechtlicher Prüfung und Anbieterfreigabe zulässig. */
export function realCoinsEnabled(): boolean {
  return false;
}

export async function getOrCreateAccount(
  executor: Executor,
  input: { kind: AccountKind; ownerUserId?: string | null; currency: CoinCurrency },
) {
  const ownerUserId = OWNED_KINDS.has(input.kind) ? (input.ownerUserId ?? null) : null;
  if (OWNED_KINDS.has(input.kind) && !ownerUserId) throw new Error(`Konto ${input.kind} benötigt einen Eigentümer`);
  await executor
    .insert(ledgerAccounts)
    .values({
      kind: input.kind,
      ownerUserId,
      currency: input.currency,
      allowNegative: NEGATIVE_ALLOWED.has(input.kind),
    })
    .onConflictDoNothing();
  const ownerCondition = ownerUserId
    ? eq(ledgerAccounts.ownerUserId, ownerUserId)
    : sql`${ledgerAccounts.ownerUserId} IS NULL`;
  const [account] = await executor
    .select()
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.kind, input.kind), eq(ledgerAccounts.currency, input.currency), ownerCondition))
    .limit(1);
  if (!account) throw new Error("Konto konnte nicht angelegt werden");
  return account;
}

export type PostTransactionInput = {
  idempotencyKey: string;
  kind: TransactionKind;
  currency: CoinCurrency;
  description: string;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string | null;
  reversalOfId?: string;
  commissionBps?: number;
  entries: { accountId: string; amount: number }[];
};

export type PostTransactionResult = { transactionId: string; duplicate: boolean };

export class InsufficientFundsError extends AppError {
  constructor(message = "Nicht genügend Testmünzen.") {
    super("insufficient_funds", message);
  }
}

/** Bucht eine ausgeglichene Transaktion. MUSS innerhalb einer DB-Transaktion aufgerufen werden. */
export async function postTransaction(tx: Transaction, input: PostTransactionInput): Promise<PostTransactionResult> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new Error("Ungültiger idempotencyKey");
  if (input.entries.length < 2) throw new Error("Eine Buchung benötigt mindestens zwei Einträge");
  let sum = 0;
  for (const entry of input.entries) {
    if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) throw new Error("Ungültiger Buchungsbetrag");
    sum += entry.amount;
  }
  if (sum !== 0) throw new Error("Buchung ist nicht ausgeglichen");
  if (input.currency === "COIN" && !realCoinsEnabled()) {
    throw featureUnavailable("Echte Münzen sind im Prototyp nicht verfügbar.");
  }

  const [inserted] = await tx
    .insert(ledgerTransactions)
    .values({
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      currency: input.currency,
      simulated: input.currency === "TEST_COIN",
      description: input.description.slice(0, 300),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorUserId: input.actorUserId ?? null,
      reversalOfId: input.reversalOfId ?? null,
      commissionBps: input.commissionBps ?? null,
    })
    .onConflictDoNothing({ target: ledgerTransactions.idempotencyKey })
    .returning({ id: ledgerTransactions.id });

  if (!inserted) {
    const [existing] = await tx
      .select({ id: ledgerTransactions.id, kind: ledgerTransactions.kind })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) throw new Error("Idempotente Buchung nicht auffindbar");
    if (existing.kind !== input.kind) {
      throw new AppError("conflict", "Die Buchungsreferenz wird bereits für einen anderen Vorgang verwendet.");
    }
    return { transactionId: existing.id, duplicate: true };
  }

  // Konten in deterministischer Reihenfolge sperren (Deadlock-Vermeidung).
  const accountIds = [...new Set(input.entries.map((entry) => entry.accountId))].sort();
  const locked = await tx
    .select()
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.id, accountIds))
    .orderBy(asc(ledgerAccounts.id))
    .for("update");
  if (locked.length !== accountIds.length) throw new Error("Buchungskonto nicht gefunden");
  const balances = new Map(locked.map((account) => [account.id, account]));

  const rows: (typeof ledgerEntries.$inferInsert)[] = [];
  for (const entry of input.entries) {
    const account = balances.get(entry.accountId)!;
    if (account.currency !== input.currency) throw new Error("Währung des Kontos passt nicht zur Buchung");
    const next = account.balance + entry.amount;
    if (!Number.isSafeInteger(next)) throw new Error("Saldoüberlauf");
    if (next < 0 && !account.allowNegative) throw new InsufficientFundsError();
    account.balance = next;
    rows.push({ transactionId: inserted.id, accountId: account.id, amount: entry.amount, balanceAfter: next });
  }
  for (const account of balances.values()) {
    await tx.update(ledgerAccounts).set({ balance: account.balance }).where(eq(ledgerAccounts.id, account.id));
  }
  await tx.insert(ledgerEntries).values(rows);
  return { transactionId: inserted.id, duplicate: false };
}

// ── Abfragen ────────────────────────────────────────────────────────────────

export async function getBalance(userId: string, kind: "customer_wallet" | "creator_earnings", currency: CoinCurrency = "TEST_COIN") {
  const [account] = await getDb()
    .select({ balance: ledgerAccounts.balance })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.ownerUserId, userId), eq(ledgerAccounts.kind, kind), eq(ledgerAccounts.currency, currency)))
    .limit(1);
  return account?.balance ?? 0;
}

export type AccountStatementRow = {
  entryId: string;
  amount: number;
  balanceAfter: number;
  createdAt: Date;
  transactionId: string;
  kind: TransactionKind;
  description: string;
  simulated: boolean;
  commissionBps: number | null;
  reversalOfId: string | null;
  referenceType: string | null;
  referenceId: string | null;
};

/** Kontoauszug eines eigenen Kontos. Der Aufrufer muss die Berechtigung prüfen. */
export async function getStatement(
  userId: string,
  kind: "customer_wallet" | "creator_earnings",
  options: { currency?: CoinCurrency; limit?: number } = {},
): Promise<AccountStatementRow[]> {
  return getDb()
    .select({
      entryId: ledgerEntries.id,
      amount: ledgerEntries.amount,
      balanceAfter: ledgerEntries.balanceAfter,
      createdAt: ledgerEntries.createdAt,
      transactionId: ledgerTransactions.id,
      kind: ledgerTransactions.kind,
      description: ledgerTransactions.description,
      simulated: ledgerTransactions.simulated,
      commissionBps: ledgerTransactions.commissionBps,
      reversalOfId: ledgerTransactions.reversalOfId,
      referenceType: ledgerTransactions.referenceType,
      referenceId: ledgerTransactions.referenceId,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .where(
      and(
        eq(ledgerAccounts.ownerUserId, userId),
        eq(ledgerAccounts.kind, kind),
        eq(ledgerAccounts.currency, options.currency ?? "TEST_COIN"),
      ),
    )
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(options.limit ?? 100);
}

// ── Testguthaben ────────────────────────────────────────────────────────────

/**
 * Schreibt simuliertes Testguthaben gut (nur im Testmodus, nur für Kunden,
 * höchstens einmal pro Kalendertag, nur bis zu einem Höchstsaldo).
 */
export async function grantTestCoins(userId: string, now = new Date()) {
  if (!isTestMode()) throw featureUnavailable("Testguthaben ist nur im Testmodus verfügbar.");
  return getDb().transaction(async (tx) => {
    const [user] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "customer" || user.status !== "active") {
      throw new AppError("forbidden", "Testguthaben ist nur für aktive Kundenkonten verfügbar.");
    }
    const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: userId, currency: "TEST_COIN" });
    if (wallet.balance >= testCoins.maxBalanceForGrant) {
      throw new AppError("invalid_state", "Dein Testguthaben ist noch ausreichend. Weitere Testmünzen gibt es, wenn es aufgebraucht ist.");
    }
    const issuance = await getOrCreateAccount(tx, { kind: "system_test_issuance", currency: "TEST_COIN" });
    const result = await postTransaction(tx, {
      idempotencyKey: `test-credit:${userId}:${viennaDayKey(now)}`,
      kind: "test_credit",
      currency: "TEST_COIN",
      description: "Testguthaben (simuliert, ohne Geldwert)",
      actorUserId: userId,
      entries: [
        { accountId: issuance.id, amount: -testCoins.grantAmount },
        { accountId: wallet.id, amount: testCoins.grantAmount },
      ],
    });
    if (result.duplicate) {
      throw new AppError("conflict", "Du hast heute bereits Testguthaben erhalten. Morgen ist wieder eine Gutschrift möglich.");
    }
    return { amount: testCoins.grantAmount, transactionId: result.transactionId };
  });
}

// ── Korrekturen (nur Admin, mit Begründung und Audit-Protokoll) ──────────────

async function reverseTransaction(
  kind: "refund" | "chargeback",
  input: { originalTransactionId: string; adminUserId: string; reason: string; ipHash?: string | null },
) {
  if (input.reason.trim().length < 10) throw validationError("Bitte gib eine nachvollziehbare Begründung an (mind. 10 Zeichen).");
  return getDb().transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.id, input.originalTransactionId))
      .limit(1);
    if (!original) throw notFound("Buchung nicht gefunden.");
    if (original.kind !== "session_charge" && original.kind !== "purchase") {
      throw new AppError("invalid_state", "Nur Sitzungsabrechnungen und Käufe können umgekehrt werden.");
    }
    const [existingReversal] = await tx
      .select({ id: ledgerTransactions.id })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.reversalOfId, original.id))
      .limit(1);
    if (existingReversal) throw new AppError("conflict", "Diese Buchung wurde bereits erstattet bzw. zurückgebucht.");

    const originalEntries = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, original.id));
    const result = await postTransaction(tx, {
      idempotencyKey: `${kind}:${original.id}`,
      kind,
      currency: original.currency,
      description: kind === "refund" ? "Rückerstattung (simuliert)" : "Rückbuchung (simuliert)",
      referenceType: original.referenceType ?? undefined,
      referenceId: original.referenceId ?? undefined,
      actorUserId: input.adminUserId,
      reversalOfId: original.id,
      commissionBps: original.commissionBps ?? undefined,
      entries: originalEntries.map((entry) => ({ accountId: entry.accountId, amount: -entry.amount })),
    });
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: kind === "refund" ? "ledger.refund" : "ledger.chargeback",
      targetType: "ledger_transaction",
      targetId: original.id,
      reason: input.reason,
      metadata: { reversalTransactionId: result.transactionId, simulated: original.simulated },
      ipHash: input.ipHash,
    });
    return result;
  });
}

export const refundTransaction = (input: Parameters<typeof reverseTransaction>[1]) => reverseTransaction("refund", input);
export const recordChargeback = (input: Parameters<typeof reverseTransaction>[1]) => reverseTransaction("chargeback", input);

/** Manuelle Testguthaben-Korrektur durch Admins (nur Testmodus, nur Kundenkonten). */
export async function adjustTestBalance(input: {
  adminUserId: string;
  userId: string;
  amount: number;
  reason: string;
  requestId: string;
  ipHash?: string | null;
}) {
  if (!isTestMode()) throw featureUnavailable("Korrekturen von Testguthaben sind nur im Testmodus möglich.");
  if (!Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100_000) {
    throw validationError("Bitte gib einen ganzzahligen Betrag zwischen -100000 und 100000 (nicht 0) an.");
  }
  if (input.reason.trim().length < 10) throw validationError("Bitte gib eine nachvollziehbare Begründung an (mind. 10 Zeichen).");
  return getDb().transaction(async (tx) => {
    const [user] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw notFound("Konto nicht gefunden.");
    if (user.role !== "customer") throw new AppError("invalid_state", "Testguthaben kann nur bei Kundenkonten korrigiert werden.");
    const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: input.userId, currency: "TEST_COIN" });
    const issuance = await getOrCreateAccount(tx, { kind: "system_test_issuance", currency: "TEST_COIN" });
    const result = await postTransaction(tx, {
      idempotencyKey: `adjustment:${input.requestId}`,
      kind: "adjustment",
      currency: "TEST_COIN",
      description: "Manuelle Korrektur Testguthaben (Admin)",
      actorUserId: input.adminUserId,
      entries: [
        { accountId: issuance.id, amount: -input.amount },
        { accountId: wallet.id, amount: input.amount },
      ],
    });
    if (!result.duplicate) {
      await writeAuditLog(tx, {
        actorUserId: input.adminUserId,
        action: "ledger.adjust",
        targetType: "user",
        targetId: input.userId,
        reason: input.reason,
        metadata: { amount: input.amount, currency: "TEST_COIN", transactionId: result.transactionId },
        ipHash: input.ipHash,
      });
    }
    return result;
  });
}

// ── Kontrolle ───────────────────────────────────────────────────────────────

export type ReconciliationResult = {
  ok: boolean;
  accountMismatches: { accountId: string; kind: string; balance: number; entriesSum: number }[];
  unbalancedTransactions: string[];
  checkedAt: Date;
};

/** Abgleich: Kontosalden müssen der Summe ihrer Einträge entsprechen. */
export async function reconcileLedger(): Promise<ReconciliationResult> {
  const db = getDb();
  const mismatches = await db.execute<{ account_id: string; kind: string; balance: string; entries_sum: string }>(sql`
    SELECT a.id AS account_id, a.kind, a.balance, COALESCE(SUM(e.amount), 0) AS entries_sum
      FROM ledger_accounts a
      LEFT JOIN ledger_entries e ON e.account_id = a.id
     GROUP BY a.id
    HAVING a.balance <> COALESCE(SUM(e.amount), 0)
  `);
  const unbalanced = await db.execute<{ transaction_id: string }>(sql`
    SELECT t.id AS transaction_id
      FROM ledger_transactions t
      LEFT JOIN ledger_entries e ON e.transaction_id = t.id
     GROUP BY t.id
    HAVING COALESCE(SUM(e.amount), 0) <> 0 OR COUNT(e.id) < 2
  `);
  const accountMismatches = mismatches.rows.map((row) => ({
    accountId: row.account_id,
    kind: row.kind,
    balance: Number(row.balance),
    entriesSum: Number(row.entries_sum),
  }));
  const unbalancedTransactions = unbalanced.rows.map((row) => row.transaction_id);
  return {
    ok: accountMismatches.length === 0 && unbalancedTransactions.length === 0,
    accountMismatches,
    unbalancedTransactions,
    checkedAt: new Date(),
  };
}

export function currentCommissionBps(): number {
  return getEnv().PLATFORM_COMMISSION_BPS;
}
