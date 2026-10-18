import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  appealStatus,
  reportCategory,
  reportPriority,
  reportStatus,
  reportTargetType,
  sanctionKind,
  supportCategory,
  supportStatus,
} from "./enums";
import { users } from "./users";

export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    reporterUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    targetType: reportTargetType().notNull(),
    targetId: uuid().notNull(),
    category: reportCategory().notNull(),
    description: text().notNull(),
    priority: reportPriority().notNull(),
    status: reportStatus().notNull().default("open"),
    assignedAdminId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("reports_queue_idx").on(t.status, t.priority, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
    check("reports_description_length", sql`char_length(${t.description}) BETWEEN 10 AND 4000`),
  ],
);

export const sanctions = pgTable(
  "sanctions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: sanctionKind().notNull(),
    reason: text().notNull(),
    reportId: uuid().references(() => reports.id, { onDelete: "set null" }),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** NULL = unbefristet (bis zur Aufhebung). */
    endsAt: timestamp({ withTimezone: true }),
    liftedAt: timestamp({ withTimezone: true }),
    liftedById: uuid().references(() => users.id, { onDelete: "restrict" }),
    liftReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sanctions_user_idx").on(t.userId, t.createdAt),
    check("sanctions_reason_length", sql`char_length(${t.reason}) >= 10`),
    check("sanctions_period", sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);

export const appeals = pgTable(
  "appeals",
  {
    id: uuid().primaryKey().defaultRandom(),
    sanctionId: uuid()
      .notNull()
      .references(() => sanctions.id, { onDelete: "restrict" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    message: text().notNull(),
    status: appealStatus().notNull().default("open"),
    decidedById: uuid().references(() => users.id, { onDelete: "restrict" }),
    decisionNote: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("appeals_one_per_sanction").on(t.sanctionId),
    check("appeals_message_length", sql`char_length(${t.message}) BETWEEN 20 AND 4000`),
  ],
);

/**
 * Unveränderliches Admin-Audit-Protokoll (UPDATE/DELETE per Trigger gesperrt).
 * Enthält keine Passwörter, Token, Zahlungs- oder Ausweisdaten.
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    reason: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_logs_created_idx").on(t.createdAt),
    index("admin_audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Nur bei Gästen; für angemeldete Nutzer wird die Konto-E-Mail verwendet. */
    contactEmail: text(),
    category: supportCategory().notNull(),
    subject: text().notNull(),
    status: supportStatus().notNull().default("open"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId, t.createdAt),
    index("support_tickets_status_idx").on(t.status, t.createdAt),
    check("support_tickets_contact", sql`${t.userId} IS NOT NULL OR ${t.contactEmail} IS NOT NULL`),
    check("support_tickets_subject_length", sql`char_length(${t.subject}) BETWEEN 3 AND 150`),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    isStaff: boolean().notNull().default(false),
    /** Interne Notizen sind für Nutzer nicht sichtbar. */
    isInternalNote: boolean().notNull().default(false),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("support_messages_ticket_idx").on(t.ticketId, t.createdAt),
    check("support_messages_body_length", sql`char_length(${t.body}) BETWEEN 1 AND 5000`),
  ],
);
