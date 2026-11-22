import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  ageVerifications,
  categories,
  creatorDeclarations,
  creatorOffers,
  creatorProfiles,
  creatorVerifications,
  users,
} from "@/server/db/schema";
import { TAGS } from "@/config/catalog";
import { DECLARATION_KINDS, DECLARATION_VERSION } from "@/server/compliance/declarations";
import { invalidateSettingsCache } from "@/server/settings/service";
import { hashPassword } from "@/server/auth/password";
import { createAuthSession } from "@/server/auth/session";
import { encryptField } from "@/server/crypto";
import type { Actor, Role } from "@/server/auth/permissions";
import { testDatabaseUrl } from "./test-database";

const TABLES = [
  "risk_events",
  "moderation_actions",
  "privacy_requests",
  "legal_holds",
  "age_verifications",
  "creator_declarations",
  "chat_mutes",
  "chat_messages",
  "user_blocks",
  "favorites",
  "categories",
  "platform_settings_history",
  "platform_settings",
  "creator_payout_profiles",
  "admin_audit_logs",
  "appeals",
  "sanctions",
  "reports",
  "support_messages",
  "support_tickets",
  "notifications",
  "email_outbox",
  "rate_limit_buckets",
  "video_session_events",
  "video_session_participants",
  "video_sessions",
  "payouts",
  "payment_events",
  "payment_orders",
  "coin_packages",
  "ledger_entries",
  "ledger_transactions",
  "ledger_accounts",
  "creator_offers",
  "creator_verifications",
  "creator_profiles",
  "media_assets",
  "user_consents",
  "notification_preferences",
  "auth_tokens",
  "auth_sessions",
  "users",
];

export async function resetDatabase() {
  testDatabaseUrl(); // Sicherheitsprüfung: nur *_test-Datenbanken
  await getDb().execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
  invalidateSettingsCache();
  // Standard-Kategorien (wie im Seed)
  await getDb()
    .insert(categories)
    .values(TAGS.map((tag, index) => ({ slug: tag.code, label: tag.label, sortOrder: index * 10, active: true })))
    .onConflictDoNothing();
}

export const TEST_PASSWORD = "Sicheres-Test-Passwort-42";

let counter = 0;

export async function createUser(options: {
  role?: Role;
  emailVerified?: boolean;
  status?: "active" | "suspended";
  totpSecret?: string;
  country?: string | null;
  /** Nur Kunden: simulierte Altersprüfung (Mock, Testmodus). Standard: bestanden. */
  ageVerification?: "test_passed" | "none" | "pending";
} = {}) {
  counter += 1;
  const role = options.role ?? "customer";
  const [user] = await getDb()
    .insert(users)
    .values({
      email: `${role}${counter}-${Date.now()}@example.test`,
      username: `${role}_${counter}_${Math.floor(Math.random() * 1e6)}`.slice(0, 24),
      passwordHash: await hashPassword(TEST_PASSWORD),
      role,
      status: options.status ?? "active",
      emailVerifiedAt: options.emailVerified === false ? null : new Date(),
      adultSelfDeclaredAt: new Date(),
      totpSecretEncrypted: options.totpSecret ? encryptField(options.totpSecret) : null,
      totpEnabledAt: options.totpSecret ? new Date() : null,
      country: options.country === undefined ? "AT" : options.country,
      isTestAccount: true,
    })
    .returning();
  const ageVerification = options.ageVerification ?? (role === "customer" ? "test_passed" : "none");
  if (ageVerification !== "none") {
    await getDb().insert(ageVerifications).values({
      userId: user!.id,
      provider: "mock",
      providerReference: `mock_age_${user!.id}`,
      method: "mock",
      status: ageVerification,
    });
  }
  return user!;
}

export function actorOf(user: { id: string; role: Role; status: "active" | "suspended" | "deleted"; emailVerifiedAt: Date | null }): Actor {
  return { id: user.id, role: user.role, status: user.status, emailVerified: user.emailVerifiedAt !== null };
}

export async function createCreator(options: {
  verification?: "none" | "test_passed" | "pending";
  availability?: "offline" | "online" | "live";
  reviewStatus?: "draft" | "approved" | "pending_review";
  coinsPerMinute?: number;
  offerEnabled?: boolean;
  displayName?: string;
  /** Pflichterklärungen abgegeben? Standard: ja. */
  declarations?: boolean;
} = {}) {
  const user = await createUser({ role: "creator" });
  const db = getDb();
  const [profile] = await db
    .insert(creatorProfiles)
    .values({
      userId: user.id,
      slug: `creator-${user.id.slice(0, 8)}`,
      displayName: options.displayName ?? `Creator ${user.id.slice(0, 4)}`,
      tagline: "Testprofil",
      reviewStatus: options.reviewStatus ?? "approved",
      availability: options.availability ?? "online",
      isTestProfile: true,
    })
    .returning();
  await db.insert(creatorOffers).values({
    creatorProfileId: profile!.id,
    kind: "private_chat",
    enabled: options.offerEnabled ?? true,
    coinsPerMinute: options.coinsPerMinute ?? 40,
  });
  const verification = options.verification ?? "test_passed";
  if (verification !== "none") {
    await db.insert(creatorVerifications).values({
      userId: user.id,
      provider: "mock",
      providerReference: `mock-${user.id}`,
      status: verification,
    });
  }
  if (options.declarations !== false) {
    await db.insert(creatorDeclarations).values(
      DECLARATION_KINDS.map((declaration) => ({ userId: user.id, declaration, version: DECLARATION_VERSION, ipHash: null })),
    );
  }
  return { user, profile: profile! };
}

export async function createSessionFor(user: { id: string; role: Role }, mfaVerified = false) {
  return createAuthSession(getDb(), { userId: user.id, role: user.role, mfaVerified });
}
