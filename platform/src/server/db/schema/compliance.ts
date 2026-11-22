import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import {
  creatorDeclarationKind,
  legalHoldTarget,
  moderationActionKind,
  privacyRequestKind,
  privacyRequestStatus,
  riskSeverity,
  riskStatus,
  verificationStatus,
} from "./enums";
import { reports } from "./moderation";
import { users } from "./users";

/**
 * Erklärungen eines Creators (Volljährigkeit/Identität, alleinige Mitwirkung,
 * Rechte an Inhalten, Einvernehmlichkeit, keine Aufzeichnung/Verbreitung,
 * Regeln). Versioniert – eine neue Version erfordert eine erneute Erklärung.
 */
export const creatorDeclarations = pgTable(
  "creator_declarations",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    declaration: creatorDeclarationKind().notNull(),
    version: text().notNull(),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipHash: text(),
  },
  (t) => [unique("creator_declarations_unique").on(t.userId, t.declaration, t.version)],
);

/**
 * Altersprüfung von Zuschauerinnen und Zuschauern über einen spezialisierten
 * Anbieter. Es werden keine Ausweisdaten gespeichert – nur Status, Methode und
 * Anbieterreferenz. Der Mock-Anbieter kann niemals „verified“ setzen.
 */
export const ageVerifications = pgTable(
  "age_verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    providerReference: text().notNull(),
    method: text(),
    status: verificationStatus().notNull().default("pending"),
    verifiedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("age_verifications_provider_ref_unique").on(t.provider, t.providerReference),
    index("age_verifications_user_idx").on(t.userId, t.createdAt),
    check("age_verifications_no_mock_verified", sql`${t.status} <> 'verified' OR ${t.provider} <> 'mock'`),
    check("age_verifications_test_passed_mock_only", sql`${t.status} <> 'test_passed' OR ${t.provider} = 'mock'`),
    check("age_verifications_verified_at", sql`${t.status} <> 'verified' OR ${t.verifiedAt} IS NOT NULL`),
  ],
);

/** Beweissicherung: gesperrte Objekte werden von Lösch- und Aufbewahrungsjobs ausgenommen. */
export const legalHolds = pgTable(
  "legal_holds",
  {
    id: uuid().primaryKey().defaultRandom(),
    targetType: legalHoldTarget().notNull(),
    targetId: uuid().notNull(),
    reason: text().notNull(),
    reportId: uuid().references(() => reports.id, { onDelete: "set null" }),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp({ withTimezone: true }),
    releasedById: uuid().references(() => users.id, { onDelete: "set null" }),
    releaseReason: text(),
  },
  (t) => [
    index("legal_holds_target_idx").on(t.targetType, t.targetId),
    check("legal_holds_reason_length", sql`char_length(${t.reason}) >= 10`),
  ],
);

/** Protokoll von Betroffenenanfragen (DSGVO). */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: privacyRequestKind().notNull(),
    status: privacyRequestStatus().notNull().default("received"),
    note: text(),
    handledById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("privacy_requests_status_idx").on(t.status, t.createdAt)],
);

/**
 * Moderationsmaßnahmen mit Begründung (Statement of Reasons), die der
 * betroffenen Person mitgeteilt wird.
 */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid().primaryKey().defaultRandom(),
    action: moderationActionKind().notNull(),
    affectedUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    targetType: text().notNull(),
    targetId: text().notNull(),
    /** Für die betroffene Person sichtbare Begründung. */
    statement: text().notNull(),
    /** Verletzte Regel (z. B. Abschnitt der Community-Richtlinien). */
    ruleReference: text(),
    reportId: uuid().references(() => reports.id, { onDelete: "set null" }),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("moderation_actions_user_idx").on(t.affectedUserId, t.createdAt),
    check("moderation_actions_statement_length", sql`char_length(${t.statement}) >= 10`),
  ],
);

/** Risikosignale (Betrugsprävention) zur Prüfung durch Mitarbeiter. */
export const riskEvents = pgTable(
  "risk_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: text().notNull(),
    severity: riskSeverity().notNull(),
    /** Nur nicht sensible Kontextdaten (IDs, Beträge, Zähler). */
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: riskStatus().notNull().default("open"),
    reviewedById: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_events_status_idx").on(t.status, t.severity, t.createdAt), index("risk_events_user_idx").on(t.userId)],
);
