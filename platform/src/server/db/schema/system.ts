import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailOutboxStatus } from "./enums";
import { users } from "./users";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    /** Interner Pfad (z. B. /account/sessions). Keine externen URLs. */
    linkPath: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Ausgehende E-Mails. Im Entwicklungsmodus („dev-outbox“) werden sie hier nur
 * gespeichert und NICHT versendet. Ein echter Versand erfordert einen
 * konfigurierten Anbieter und eine ausdrückliche Freigabe.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    toAddress: text().notNull(),
    template: text().notNull(),
    /** transactional | security | session_updates | marketing */
    category: text().notNull().default("transactional"),
    subject: text().notNull(),
    /** Inhalt nur bis zum Versand bzw. im Entwicklungsmodus gespeichert (Datensparsamkeit). */
    bodyText: text(),
    bodyHtml: text(),
    status: emailOutboxStatus().notNull(),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }),
    lastError: text(),
    providerMessageId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("email_outbox_created_idx").on(t.createdAt),
    index("email_outbox_queue_idx").on(t.status, t.nextAttemptAt),
    check("email_outbox_category", sql`${t.category} IN ('transactional', 'security', 'session_updates', 'marketing')`),
  ],
);

/** Datenbankbasierte Rate-Limits (keine zusätzliche Infrastruktur wie Redis nötig). */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text().primaryKey(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limit_buckets_expires_idx").on(t.expiresAt)],
);

