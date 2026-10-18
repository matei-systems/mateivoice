/**
 * Entwicklungs-Testdaten. Alle Personen und Profile sind FIKTIV und als
 * Testdaten gekennzeichnet. Keine realen Personen, keine echten Fotos, keine
 * erfundenen Bewertungen oder Verifizierungsnachweise.
 *
 * Aufruf: pnpm db:seed   (nur gegen *_dev / *_e2e Datenbanken)
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { assertDevelopmentDatabase } from "./guards";

async function main() {
  const dbName = assertDevelopmentDatabase({ allowTestDb: true });

  const { getDb, closeDb } = await import("@/server/db/client");
  const schema = await import("@/server/db/schema");
  const { hashPassword } = await import("@/server/auth/password");
  const { encryptField } = await import("@/server/crypto");
  const { generateTotpSecret } = await import("@/server/auth/totp");
  const { grantTestCoins } = await import("@/server/ledger/service");
  const { requestPrivateSession, respondToRequest, joinPrivateSession, leaveSession } = await import("@/server/video/service");
  const { legalDocuments } = await import("@/config/platform");

  const db = getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, "admin@aurora.test")).limit(1);
  if (existing) {
    console.log(`Seed-Daten in "${dbName}" sind bereits vorhanden – nichts zu tun. (Zurücksetzen: pnpm db:reset-dev)`);
    await closeDb();
    return;
  }

  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 12) throw new Error("SEED_DEFAULT_PASSWORD (mind. 12 Zeichen) muss in .env gesetzt sein.");
  const passwordHash = await hashPassword(password);
  const adminTotpSecret = process.env.SEED_ADMIN_TOTP_SECRET || generateTotpSecret();
  const now = new Date();

  async function consent(userId: string, creator = false) {
    const docs: { document: "terms" | "privacy" | "community_guidelines" | "creator_agreement"; documentVersion: string }[] = [
      { document: "terms", documentVersion: legalDocuments.terms.version },
      { document: "privacy", documentVersion: legalDocuments.privacy.version },
      { document: "community_guidelines", documentVersion: legalDocuments.communityGuidelines.version },
    ];
    if (creator) docs.push({ document: "creator_agreement", documentVersion: legalDocuments.creatorAgreement.version });
    await db.insert(schema.userConsents).values(docs.map((d) => ({ ...d, userId })));
    await db.insert(schema.notificationPreferences).values({ userId }).onConflictDoNothing();
  }

  async function createUser(input: { email: string; username: string; role: "customer" | "creator" | "admin"; verified?: boolean; totp?: string }) {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: input.email,
        username: input.username,
        passwordHash,
        role: input.role,
        emailVerifiedAt: input.verified === false ? null : now,
        adultSelfDeclaredAt: now,
        isTestAccount: true,
        totpSecretEncrypted: input.totp ? encryptField(input.totp) : null,
        totpEnabledAt: input.totp ? now : null,
      })
      .returning();
    await consent(user!.id, input.role === "creator");
    return user!;
  }

  // ── Konten ────────────────────────────────────────────────────────────────
  const admin = await createUser({ email: "admin@aurora.test", username: "admin_test", role: "admin", totp: adminTotpSecret });
  const customer = await createUser({ email: "kunde@aurora.test", username: "kunde_test", role: "customer" });
  await createUser({ email: "kunde.unbestaetigt@aurora.test", username: "kunde_unbestaetigt", role: "customer", verified: false });

  const creators: {
    email: string;
    username: string;
    displayName: string;
    tagline: string;
    languages: string[];
    tags: string[];
    price: number;
    availability: "offline" | "online" | "live";
    review: "approved" | "pending_review" | "draft";
    verification: "test_passed" | "pending" | "none";
    offer: boolean;
  }[] = [
    { email: "creator@aurora.test", username: "aria_demo", displayName: "Aria", tagline: "Gute Gespräche, gute Musik und ein Lächeln", languages: ["de", "en"], tags: ["talk", "music"], price: 40, availability: "online", review: "approved", verification: "test_passed", offer: true },
    { email: "bella.demo@aurora.test", username: "bella_demo", displayName: "Bella", tagline: "Tanz, Fitness und gute Laune aus Wien", languages: ["de"], tags: ["dance", "fitness"], price: 55, availability: "live", review: "approved", verification: "test_passed", offer: true },
    { email: "clara.demo@aurora.test", username: "clara_demo", displayName: "Clara", tagline: "Kunst, Mode und entspannte Abende", languages: ["de", "en", "it"], tags: ["art", "fashion"], price: 70, availability: "live", review: "approved", verification: "test_passed", offer: true },
    { email: "dalia.demo@aurora.test", username: "dalia_demo", displayName: "Dalia", tagline: "Kochen, Reisen und lange Gespräche", languages: ["de", "hr"], tags: ["cooking", "travel", "talk"], price: 35, availability: "online", review: "approved", verification: "test_passed", offer: true },
    { email: "elena.demo@aurora.test", username: "elena_demo", displayName: "Elena", tagline: "Gaming-Abende und Comedy", languages: ["de", "en"], tags: ["gaming", "comedy"], price: 30, availability: "online", review: "approved", verification: "test_passed", offer: true },
    { email: "fiona.demo@aurora.test", username: "fiona_demo", displayName: "Fiona", tagline: "Wellness, Achtsamkeit und Ruhe", languages: ["en"], tags: ["wellness", "lifestyle"], price: 90, availability: "live", review: "approved", verification: "test_passed", offer: true },
    { email: "greta.demo@aurora.test", username: "greta_demo", displayName: "Greta", tagline: "Lifestyle-Talk aus Graz", languages: ["de"], tags: ["lifestyle", "talk"], price: 45, availability: "offline", review: "approved", verification: "test_passed", offer: true },
    { email: "hanna.demo@aurora.test", username: "hanna_demo", displayName: "Hanna", tagline: "Musik machen und gemeinsam singen", languages: ["de", "en"], tags: ["music"], price: 60, availability: "offline", review: "approved", verification: "test_passed", offer: true },
    { email: "ivy.demo@aurora.test", username: "ivy_demo", displayName: "Ivy", tagline: "Mode-Tipps und Styling", languages: ["en", "fr"], tags: ["fashion", "lifestyle"], price: 80, availability: "online", review: "approved", verification: "test_passed", offer: true },
    { email: "jana.demo@aurora.test", username: "jana_demo", displayName: "Jana", tagline: "Fitness-Coaching mit Humor", languages: ["de", "cs", "sk"], tags: ["fitness", "comedy"], price: 50, availability: "offline", review: "approved", verification: "test_passed", offer: false },
    { email: "kira.demo@aurora.test", username: "kira_demo", displayName: "Kira", tagline: "Neues Profil – wartet auf Prüfung", languages: ["de"], tags: ["talk"], price: 40, availability: "offline", review: "pending_review", verification: "pending", offer: false },
    { email: "creator.entwurf@aurora.test", username: "lea_entwurf", displayName: "Lea", tagline: "", languages: [], tags: [], price: 40, availability: "offline", review: "draft", verification: "none", offer: false },
  ];

  const bio = (name: string) =>
    `${name} ist ein FIKTIVES Testprofil für die Entwicklung von Project Aurora. Es gibt keine reale Person hinter diesem Profil. ` +
    "Das Profil zeigt, wie Beschreibung, Angebote, Preise und Live-Status später dargestellt werden.";

  const profiles: Record<string, { id: string; userId: string }> = {};
  let minutesAgo = 0;
  for (const c of creators) {
    const user = await createUser({ email: c.email, username: c.username, role: "creator" });
    minutesAgo += 17;
    const [profile] = await db
      .insert(schema.creatorProfiles)
      .values({
        userId: user.id,
        slug: c.displayName.toLowerCase() + (c.review === "draft" ? "-entwurf" : ""),
        displayName: c.displayName,
        tagline: c.tagline,
        bio: c.review === "draft" ? "" : bio(c.displayName),
        contactRules:
          c.review === "draft" ? "" : "Bitte respektvoll bleiben. Keine persönlichen Kontaktdaten erfragen. Wünsche vorab freundlich ansprechen.",
        languages: c.languages,
        tags: c.tags,
        availability: c.availability,
        reviewStatus: c.review,
        reviewedAt: c.review === "approved" ? now : null,
        reviewedById: c.review === "approved" ? admin.id : null,
        isTestProfile: true,
        lastOnlineAt: new Date(now.getTime() - minutesAgo * 60_000),
      })
      .returning();
    profiles[c.username] = { id: profile!.id, userId: user.id };
    await db.insert(schema.creatorOffers).values({ creatorProfileId: profile!.id, kind: "private_chat", enabled: c.offer, coinsPerMinute: c.price });
    if (c.verification !== "none") {
      await db.insert(schema.creatorVerifications).values({
        userId: user.id,
        provider: "mock",
        providerReference: `mock_seed_${c.username}`,
        status: c.verification,
      });
    }
    if (c.availability === "live") {
      const [stream] = await db
        .insert(schema.videoSessions)
        .values({
          kind: "public_stream",
          creatorProfileId: profile!.id,
          creatorUserId: user.id,
          status: "active",
          provider: "mock",
          startedAt: new Date(now.getTime() - 20 * 60_000),
          currency: "TEST_COIN",
        })
        .returning();
      await db.update(schema.videoSessions).set({ providerRoomId: `mock-room-${stream!.id}` }).where(eq(schema.videoSessions.id, stream!.id));
    }
  }

  // ── Münzpakete (nur Beispiele – nicht kaufbar) ────────────────────────────
  await db.insert(schema.coinPackages).values([
    { code: "example-250", name: "Kennenlernen", coins: 250, priceCents: 499, sortOrder: 1 },
    { code: "example-600", name: "Beliebt", coins: 600, priceCents: 999, sortOrder: 2 },
    { code: "example-1300", name: "Mehr Zeit", coins: 1300, priceCents: 1999, sortOrder: 3 },
    { code: "example-3500", name: "Premium", coins: 3500, priceCents: 4999, sortOrder: 4 },
  ]);

  // ── Beispielverlauf über die echten Service-Funktionen ────────────────────
  await grantTestCoins(customer.id);
  const actor = (id: string, role: "customer" | "creator") => ({ id, role, status: "active" as const, emailVerified: true });
  const aria = profiles["aria_demo"]!;
  const session = await requestPrivateSession(actor(customer.id, "customer"), aria.id);
  await respondToRequest(actor(aria.userId, "creator"), session.id, "accept");
  await joinPrivateSession(actor(customer.id, "customer"), session.id);
  await joinPrivateSession(actor(aria.userId, "creator"), session.id);
  await leaveSession(actor(customer.id, "customer"), session.id);

  // ── Moderation & Support (Testfälle) ──────────────────────────────────────
  await db.insert(schema.reports).values({
    reporterUserId: customer.id,
    targetType: "creator_profile",
    targetId: profiles["elena_demo"]!.id,
    category: "spam",
    description: "Testmeldung: Im Profiltext wird auf externe Seiten verwiesen (fiktiver Fall).",
    priority: "normal",
  });
  const [ticket] = await db
    .insert(schema.supportTickets)
    .values({ userId: customer.id, category: "payments", subject: "Frage zum Testguthaben" })
    .returning();
  await db.insert(schema.supportMessages).values({
    ticketId: ticket!.id,
    authorUserId: customer.id,
    body: "Testanfrage: Wie oft kann ich Testguthaben anfordern?",
  });
  await db.insert(schema.notifications).values({
    userId: customer.id,
    type: "welcome",
    title: "Willkommen im Testmodus",
    body: "Alle Profile sind fiktiv. Münzen sind Testguthaben ohne Geldwert.",
    linkPath: "/account",
  });

  const stats = await db.execute<{ users: string }>(sql`SELECT count(*)::text AS users FROM users`);
  console.log(`\nSeed abgeschlossen für "${dbName}" (${stats.rows[0]?.users} Testkonten).`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("Testkonten (nur Entwicklung, Passwort aus SEED_DEFAULT_PASSWORD):");
  console.log("  Admin:    admin@aurora.test   (2FA erforderlich)");
  console.log("  Kunde:    kunde@aurora.test");
  console.log("  Creator:  creator@aurora.test (Profil „Aria“)");
  if (!process.env.SEED_ADMIN_TOTP_SECRET) {
    console.log(`  Admin-TOTP-Geheimnis (in Authenticator-App eintragen): ${adminTotpSecret}`);
  }
  console.log("──────────────────────────────────────────────────────────────\n");
  await closeDb();
}

main().catch((error: unknown) => {
  console.error("Seed fehlgeschlagen:", error instanceof Error ? error.message : error);
  process.exit(1);
});
