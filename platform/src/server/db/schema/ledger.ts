import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  coinCurrency,
  ledgerAccountKind,
  ledgerTransactionKind,
  paymentOrderStatus,
  payoutStatus,
} from "./enums";
import { users } from "./users";

/**
 * Doppelte Buchführung in ganzen Münzen.
 *
 *  - Jede Buchung (ledger_transactions) besteht aus mindestens zwei Einträgen,
 *    deren Summe exakt 0 ist (per Constraint-Trigger erzwungen).
 *  - Einträge und Buchungen sind unveränderlich (Trigger verhindert UPDATE/DELETE).
 *  - Korrekturen erfolgen ausschließlich über Gegenbuchungen.
 *  - Der Kontosaldo wird in derselben DB-Transaktion fortgeschrieben.
 */
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: ledgerAccountKind().notNull(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    currency: coinCurrency().notNull(),
    balance: bigint({ mode: "number" }).notNull().default(0),
    allowNegative: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ledger_accounts_kind_owner_currency_unique")
      .on(t.kind, t.ownerUserId, t.currency)
      .nullsNotDistinct(),
    check("ledger_accounts_non_negative", sql`${t.allowNegative} OR ${t.balance} >= 0`),
    check(
      "ledger_accounts_owner_required",
      sql`(${t.kind} IN ('customer_wallet', 'creator_earnings')) = (${t.ownerUserId} IS NOT NULL)`,
    ),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Eindeutige Referenz – verhindert doppelte Buchungen bei Wiederholungen. */
    idempotencyKey: text().notNull(),
    kind: ledgerTransactionKind().notNull(),
    currency: coinCurrency().notNull(),
    /** true = simulierte Buchung ohne Geldbewegung. */
    simulated: boolean().notNull(),
    description: text().notNull(),
    referenceType: text(),
    referenceId: uuid(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Rückerstattung/Rückbuchung verweist auf die Originalbuchung (max. eine Umkehr). */
    reversalOfId: uuid().references((): AnyPgColumn => ledgerTransactions.id, {
      onDelete: "restrict",
    }),
    /** Zum Buchungszeitpunkt gültiger Provisionssatz in Basispunkten. */
    commissionBps: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_transactions_idempotency_unique").on(t.idempotencyKey),
    uniqueIndex("ledger_transactions_reversal_unique")
      .on(t.reversalOfId)
      .where(sql`${t.reversalOfId} IS NOT NULL`),
    index("ledger_transactions_reference_idx").on(t.referenceType, t.referenceId),
    index("ledger_transactions_created_idx").on(t.createdAt),
    check("ledger_transactions_test_coin_simulated", sql`${t.currency} <> 'TEST_COIN' OR ${t.simulated}`),
    check(
      "ledger_transactions_commission_range",
      sql`${t.commissionBps} IS NULL OR ${t.commissionBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    transactionId: uuid()
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    amount: bigint({ mode: "number" }).notNull(),
    balanceAfter: bigint({ mode: "number" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_entries_account_idx").on(t.accountId, t.createdAt),
    index("ledger_entries_transaction_idx").on(t.transactionId),
    check("ledger_entries_non_zero", sql`${t.amount} <> 0`),
  ],
);

/** Münzpakete. Im Prototyp ausschließlich Beispiele – nicht kaufbar. */
export const coinPackages = pgTable(
  "coin_packages",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    name: text().notNull(),
    coins: integer().notNull(),
    /** Preis in Cent (Ganzzahl). */
    priceCents: integer().notNull(),
    currency: text().notNull().default("EUR"),
    active: boolean().notNull().default(true),
    isExample: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coin_packages_code_unique").on(t.code),
    check("coin_packages_positive", sql`${t.coins} > 0 AND ${t.priceCents} > 0`),
    check("coin_packages_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Kaufvorgänge über einen Zahlungsanbieter (im Prototyp nur simuliert). */
export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    packageId: uuid()
      .notNull()
      .references(() => coinPackages.id, { onDelete: "restrict" }),
    coins: integer().notNull(),
    priceCents: integer().notNull(),
    currency: text().notNull(),
    provider: text().notNull(),
    providerReference: text(),
    status: paymentOrderStatus().notNull().default("created"),
    idempotencyKey: text().notNull(),
    ledgerTransactionId: uuid().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    simulated: boolean().notNull(),
    failureReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("payment_orders_idempotency_unique").on(t.idempotencyKey),
    uniqueIndex("payment_orders_provider_ref_unique")
      .on(t.provider, t.providerReference)
      .where(sql`${t.providerReference} IS NOT NULL`),
    index("payment_orders_user_idx").on(t.userId, t.createdAt),
  ],
);

/** Eingegangene Zahlungsanbieter-Ereignisse (Webhooks) – Grundlage der Idempotenz. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    type: text().notNull(),
    orderId: uuid().references(() => paymentOrders.id, { onDelete: "restrict" }),
    /** Bereinigte Nutzlast – keine Karten- oder Kontodaten. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique("payment_events_provider_event_unique").on(t.provider, t.providerEventId)],
);

/**
 * Creator-Auszahlungen. Vorbereitet, im Prototyp nicht ausführbar.
 * Testmünzen können per Constraint NIE ausgezahlt werden.
 */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    creatorUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: bigint({ mode: "number" }).notNull(),
    currency: coinCurrency().notNull(),
    status: payoutStatus().notNull().default("requested"),
    provider: text().notNull(),
    providerReference: text(),
    failureReason: text(),
    ledgerTransactionId: uuid().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("payouts_creator_idx").on(t.creatorUserId, t.createdAt),
    check("payouts_amount_positive", sql`${t.amount} > 0`),
    check("payouts_no_test_coins", sql`${t.currency} = 'COIN'`),
  ],
);
