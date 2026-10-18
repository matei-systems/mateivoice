import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    toAddress: text().notNull(),
    template: text().notNull(),
    subject: text().notNull(),
    /** Nur im Entwicklungsmodus befüllt. */
    bodyText: text(),
    status: emailOutboxStatus().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("email_outbox_created_idx").on(t.createdAt)],
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

