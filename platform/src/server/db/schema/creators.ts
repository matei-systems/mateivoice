import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  creatorAvailability,
  creatorReviewStatus,
  mediaKind,
  mediaVisibility,
  moderationStatus,
  offerKind,
  verificationStatus,
} from "./enums";
import { users } from "./users";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaKind().notNull(),
    /** Schlüssel im (privaten) Speicher – niemals ein öffentlicher Pfad. */
    storageKey: text().notNull(),
    mimeType: text().notNull(),
    byteSize: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    sha256: text().notNull(),
    visibility: mediaVisibility().notNull().default("public"),
    moderationStatus: moderationStatus().notNull().default("pending"),
    moderationNote: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("media_assets_storage_key_unique").on(t.storageKey),
    index("media_assets_owner_idx").on(t.ownerUserId),
    check("media_assets_size_positive", sql`${t.byteSize} > 0`),
  ],
);

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    displayName: text().notNull(),
    tagline: text().notNull().default(""),
    bio: text().notNull().default(""),
    languages: text().array().notNull().default(sql`'{}'::text[]`),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    contactRules: text().notNull().default(""),
    availability: creatorAvailability().notNull().default("offline"),
    reviewStatus: creatorReviewStatus().notNull().default("draft"),
    reviewNote: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedById: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    avatarMediaId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    /** Datenschutzfreundlicher Standard: Profile werden nicht indexiert. */
    allowSearchIndexing: boolean().notNull().default(false),
    /** Kennzeichnet fiktive Entwicklungsprofile. */
    isTestProfile: boolean().notNull().default(false),
    lastOnlineAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("creator_profiles_user_unique").on(t.userId),
    uniqueIndex("creator_profiles_slug_unique").on(t.slug),
    index("creator_profiles_review_idx").on(t.reviewStatus),
    index("creator_profiles_availability_idx").on(t.availability),
    check("creator_profiles_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "creator_profiles_display_name_length",
      sql`char_length(${t.displayName}) BETWEEN 2 AND 40`,
    ),
    check("creator_profiles_tagline_length", sql`char_length(${t.tagline}) <= 120`),
    check("creator_profiles_bio_length", sql`char_length(${t.bio}) <= 2000`),
  ],
);

export const creatorOffers = pgTable(
  "creator_offers",
  {
    id: uuid().primaryKey().defaultRandom(),
    creatorProfileId: uuid()
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    kind: offerKind().notNull(),
    enabled: boolean().notNull().default(false),
    coinsPerMinute: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("creator_offers_profile_kind_unique").on(t.creatorProfileId, t.kind),
    // Harte Datenbankgrenze; die engeren Geschäftsgrenzen stehen in config/platform.ts.
    check("creator_offers_price_range", sql`${t.coinsPerMinute} BETWEEN 1 AND 10000`),
  ],
);

/**
 * Verifizierungsversuche (Alter & Identität) über einen externen Anbieter.
 * Es werden KEINE Ausweisdaten gespeichert – nur Status und Anbieterreferenz.
 */
export const creatorVerifications = pgTable(
  "creator_verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    providerReference: text().notNull(),
    status: verificationStatus().notNull().default("pending"),
    verifiedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    failureReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("creator_verifications_provider_ref_unique").on(t.provider, t.providerReference),
    index("creator_verifications_user_idx").on(t.userId, t.createdAt),
    // Ein Mock-Anbieter kann niemals „verifiziert“ erzeugen.
    check(
      "creator_verifications_no_mock_verified",
      sql`${t.status} <> 'verified' OR ${t.provider} <> 'mock'`,
    ),
    // „test_passed“ existiert nur beim Mock-Anbieter.
    check(
      "creator_verifications_test_passed_mock_only",
      sql`${t.status} <> 'test_passed' OR ${t.provider} = 'mock'`,
    ),
    check(
      "creator_verifications_verified_at",
      sql`${t.status} <> 'verified' OR ${t.verifiedAt} IS NOT NULL`,
    ),
  ],
);
