import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creators";
import { chatMessageKind } from "./enums";
import { users } from "./users";
import { videoSessions } from "./video";

/** Favoriten: Kunden merken sich Creator. */
export const favorites = pgTable(
  "favorites",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorProfileId: uuid()
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.creatorProfileId] }), index("favorites_profile_idx").on(t.creatorProfileId)],
);

/** Blockieren: verhindert Anfragen und Chat-Nachrichten zwischen zwei Konten (in beide Richtungen). */
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }),
    index("user_blocks_blocked_idx").on(t.blockedUserId),
    check("user_blocks_not_self", sql`${t.blockerUserId} <> ${t.blockedUserId}`),
  ],
);

/**
 * Chat-Nachrichten in Live-Streams und privaten Sitzungen (Raum = Video-Sitzung).
 * Gelöschte Nachrichten bleiben zur Nachvollziehbarkeit erhalten, werden aber
 * nicht mehr angezeigt; Aufbewahrung gemäß Einstellungen (Retention-Job).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    senderUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: chatMessageKind().notNull().default("message"),
    body: text().notNull(),
    tipAmount: integer(),
    deletedAt: timestamp({ withTimezone: true }),
    deletedById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_session_idx").on(t.sessionId, t.createdAt),
    index("chat_messages_sender_idx").on(t.senderUserId, t.createdAt),
    check("chat_messages_body_length", sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
    check("chat_messages_tip", sql`(${t.kind} = 'tip') = (${t.tipAmount} IS NOT NULL AND ${t.tipAmount} > 0)`),
  ],
);

/**
 * Stummschaltungen: durch den Creator für den eigenen Raum (creatorUserId gesetzt)
 * oder plattformweit durch Moderation (creatorUserId NULL).
 */
export const chatMutes = pgTable(
  "chat_mutes",
  {
    id: uuid().primaryKey().defaultRandom(),
    creatorUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    until: timestamp({ withTimezone: true }),
    reason: text(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_mutes_user_idx").on(t.userId, t.creatorUserId)],
);
