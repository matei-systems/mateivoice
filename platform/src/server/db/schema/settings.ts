import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Admin-konfigurierbare Plattform-Einstellungen (Provision, Auszahlungsregeln,
 * Feature-Flags, Wartungsmodus, Streaming-, Chat- und Aufbewahrungsregeln).
 * Werte werden beim Lesen/Schreiben per Zod-Schema validiert.
 */
export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedById: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Unveränderliche Änderungshistorie (u. a. Nachweis, ab wann welcher Provisionssatz galt). */
export const platformSettingsHistory = pgTable(
  "platform_settings_history",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    key: text().notNull(),
    value: jsonb().$type<unknown>().notNull(),
    previousValue: jsonb().$type<unknown>(),
    changedById: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_settings_history_key_idx").on(t.key, t.createdAt)],
);

/** Von Admins gepflegte Themen-Kategorien (keine Freitext-Tags). */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    label: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_unique").on(t.slug),
    check("categories_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("categories_label_length", sql`char_length(${t.label}) BETWEEN 2 AND 40`),
  ],
);
