import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authTokenPurpose, consentDocument, userRole, userStatus } from "./enums";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Immer klein geschrieben gespeichert. */
    email: text().notNull(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** NULL nach Kontolöschung. Format: scrypt$N$r$p$salt$hash */
    passwordHash: text(),
    role: userRole().notNull().default("customer"),
    status: userStatus().notNull().default("active"),
    /** Öffentlicher Nutzername (kein Klarname nötig – Datensparsamkeit). */
    username: text().notNull(),
    /**
     * Selbstauskunft „volljährig“ bei der Registrierung.
     * ACHTUNG: Das ist KEINE Altersverifikation.
     */
    adultSelfDeclaredAt: timestamp({ withTimezone: true }).notNull(),
    /** TOTP-Geheimnis, AES-256-GCM-verschlüsselt. */
    totpSecretEncrypted: text(),
    totpEnabledAt: timestamp({ withTimezone: true }),
    /** Zuletzt verwendeter TOTP-Zeitschritt (Replay-Schutz). */
    totpLastUsedStep: bigint({ mode: "number" }),
    isTestAccount: boolean().notNull().default(false),
    lastLoginAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_username_lower_unique").on(sql`lower(${t.username})`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_username_format", sql`${t.username} ~ '^[A-Za-z0-9_.-]{3,24}$'`),
    check(
      "users_deleted_consistency",
      sql`(${t.status} = 'deleted') = (${t.deletedAt} IS NOT NULL)`,
    ),
    index("users_role_idx").on(t.role),
  ],
);

/** Serverseitige Sitzungen. Die ID ist der SHA-256-Hash des Cookie-Tokens. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Gesetzt, nachdem der zweite Faktor (TOTP) in dieser Sitzung bestätigt wurde. */
    mfaVerifiedAt: timestamp({ withTimezone: true }),
    userAgent: text(),
    ipHash: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_expires_idx").on(t.expiresAt)],
);

/** Einmal-Token für E-Mail-Bestätigung und Passwort-Zurücksetzung (nur Hash gespeichert). */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_unique").on(t.tokenHash),
    index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose),
  ],
);

/** Nachweis der Zustimmung zu (Entwurfs-)Rechtstexten in einer bestimmten Version. */
export const userConsents = pgTable(
  "user_consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    document: consentDocument().notNull(),
    documentVersion: text().notNull(),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipHash: text(),
  },
  (t) => [unique("user_consents_unique").on(t.userId, t.document, t.documentVersion)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailAccount: boolean().notNull().default(true),
  emailSessionUpdates: boolean().notNull().default(false),
  /** Marketing nur nach ausdrücklicher Einwilligung (Opt-in). */
  emailMarketing: boolean().notNull().default(false),
  inAppSessionUpdates: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
