import { sql } from "drizzle-orm";
import {
  bigint,
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
} from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creators";
import {
  coinCurrency,
  participantRole,
  sessionEventSource,
  videoSessionEndReason,
  videoSessionKind,
  videoSessionStatus,
} from "./enums";
import { users } from "./users";

/**
 * Video-Sitzungen (öffentliche Streams und private 1:1-Chats).
 * Im Prototyp werden KEINE echten Streams erzeugt; der Mock-Anbieter liefert
 * nur Sitzungsereignisse. Es werden standardmäßig keine Aufnahmen gespeichert.
 */
export const videoSessions = pgTable(
  "video_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: videoSessionKind().notNull(),
    creatorProfileId: uuid()
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "restrict" }),
    creatorUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    customerUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    status: videoSessionStatus().notNull(),
    /** Preis-Snapshot zum Anfragezeitpunkt. */
    coinsPerMinute: integer(),
    commissionBps: integer(),
    currency: coinCurrency().notNull().default("TEST_COIN"),
    provider: text().notNull(),
    providerRoomId: text(),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    endReason: videoSessionEndReason(),
    chargedMinutes: integer().notNull().default(0),
    totalCoins: bigint({ mode: "number" }).notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("video_sessions_creator_idx").on(t.creatorUserId, t.createdAt),
    index("video_sessions_customer_idx").on(t.customerUserId, t.createdAt),
    index("video_sessions_status_idx").on(t.status),
    check(
      "video_sessions_private_fields",
      sql`${t.kind} <> 'private_chat' OR (${t.customerUserId} IS NOT NULL AND ${t.coinsPerMinute} IS NOT NULL AND ${t.commissionBps} IS NOT NULL)`,
    ),
    check(
      "video_sessions_public_no_customer",
      sql`${t.kind} <> 'public_stream' OR ${t.customerUserId} IS NULL`,
    ),
    check("video_sessions_not_self", sql`${t.customerUserId} IS NULL OR ${t.customerUserId} <> ${t.creatorUserId}`),
    // Höchstens eine offene private Anfrage/Sitzung je Kunde.
    uniqueIndex("video_sessions_one_open_per_customer")
      .on(t.customerUserId)
      .where(sql`${t.kind} = 'private_chat' AND ${t.status} IN ('requested', 'accepted', 'active')`),
    // Höchstens ein angenommener/aktiver privater Chat je Creator.
    uniqueIndex("video_sessions_one_private_per_creator")
      .on(t.creatorUserId)
      .where(sql`${t.kind} = 'private_chat' AND ${t.status} IN ('accepted', 'active')`),
    // Höchstens ein laufender öffentlicher Stream je Creator.
    uniqueIndex("video_sessions_one_stream_per_creator")
      .on(t.creatorUserId)
      .where(sql`${t.kind} = 'public_stream' AND ${t.status} = 'active'`),
  ],
);

export const videoSessionParticipants = pgTable(
  "video_session_participants",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: participantRole().notNull(),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp({ withTimezone: true }),
    lastHeartbeatAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("video_session_participants_unique").on(t.sessionId, t.userId)],
);

/** Ereignisprotokoll. Abrechnung nur auf Basis von source = server|provider. */
export const videoSessionEvents = pgTable(
  "video_session_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    type: text().notNull(),
    source: sessionEventSource().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    providerEventId: text(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("video_session_events_session_idx").on(t.sessionId, t.createdAt),
    uniqueIndex("video_session_events_provider_event_unique")
      .on(t.providerEventId)
      .where(sql`${t.providerEventId} IS NOT NULL`),
  ],
);
