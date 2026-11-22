import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { isTestMode } from "@/config/env";
import { isLanguageCode, SORT_OPTIONS, type SortOption } from "@/config/catalog";
import { getDb } from "@/server/db/client";
import {
  creatorOffers,
  creatorProfiles,
  creatorVerifications,
  mediaAssets,
  users,
} from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { canEditCreatorProfile, hasPermission, type Actor } from "@/server/auth/permissions";
import { AppError, forbidden, invalidState, notFound, validationError } from "@/server/errors";
import { notify, notifyStaff } from "@/server/notifications/service";
import { creatorCanOperate, verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { DECLARATION_VERSION, REQUIRED_DECLARATION_COUNT, declarationsComplete } from "@/server/compliance/declarations";
import { getSettings, listCategories, type Settings } from "@/server/settings/service";

/**
 * Creator-Profile: öffentliche Suche, Profilansicht, Bearbeitung durch den
 * Creator und Prüfung durch Mitarbeiter. Öffentlich sichtbar sind nur Profile,
 * deren Veröffentlichungs-Checkliste vollständig ist (siehe getPublicationChecklist).
 */

// Status/Anbieter der neuesten Verifizierung je Creator (korrelierte Unterabfragen)
const latestVerification = sql<string | null>`(
  SELECT cv.status FROM creator_verifications cv
   WHERE cv.user_id = ${creatorProfiles.userId}
   ORDER BY cv.created_at DESC LIMIT 1
)`;

const latestVerificationProvider = sql<string | null>`(
  SELECT cv.provider FROM creator_verifications cv
   WHERE cv.user_id = ${creatorProfiles.userId}
   ORDER BY cv.created_at DESC LIMIT 1
)`;

/** Anzahl aktueller Pflichterklärungen je Creator (korrelierte Unterabfrage). */
const declarationCount = sql<number>`(
  SELECT count(DISTINCT cd.declaration)::int FROM creator_declarations cd
   WHERE cd.user_id = ${creatorProfiles.userId} AND cd.version = ${DECLARATION_VERSION}
)`;

/**
 * Bedingungen für öffentliche Sichtbarkeit – ein Profil erscheint erst, wenn
 * ALLE Prüfungen abgeschlossen sind: Freigabe durch Mitarbeiter, aktives Konto,
 * Alters-/Identitätsprüfung (echter Anbieter; im Testmodus zusätzlich das
 * Mock-Ergebnis „test_passed“) und vollständige Einwilligungs-/Rechteerklärungen.
 */
function publicVisibilityConditions(): SQL[] {
  const conditions: SQL[] = [
    eq(creatorProfiles.reviewStatus, "approved"),
    eq(users.status, "active"),
    sql`${declarationCount} >= ${REQUIRED_DECLARATION_COUNT}`,
  ];
  if (isTestMode()) {
    conditions.push(
      sql`((${latestVerification} = 'verified' AND ${latestVerificationProvider} <> 'mock') OR (${latestVerification} = 'test_passed' AND ${latestVerificationProvider} = 'mock'))`,
    );
  } else {
    // Echtbetrieb: nur echte Verifizierung, keine Testprofile.
    conditions.push(
      sql`${latestVerification} = 'verified' AND ${latestVerificationProvider} <> 'mock'`,
      eq(creatorProfiles.isTestProfile, false),
    );
  }
  return conditions;
}

export const searchParamsSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  availability: z.enum(["all", "live", "online"]).optional().catch(undefined),
  language: z.string().refine(isLanguageCode).optional().catch(undefined),
  tag: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  sort: z.enum(SORT_OPTIONS.map((o) => o.value) as [SortOption, ...SortOption[]]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});

export type CreatorSearchParams = z.infer<typeof searchParamsSchema>;

export type CreatorCardData = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string;
  availability: (typeof creatorProfiles.$inferSelect)["availability"];
  languages: string[];
  tags: string[];
  coinsPerMinute: number | null;
  privateChatEnabled: boolean;
  avatarMediaId: string | null;
  isTestProfile: boolean;
  verification: ReturnType<typeof verificationDisplay>;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export const PAGE_SIZE = 12;

/** Öffentliche Creator-Suche (serverseitig, erweiterbar z. B. um Volltextsuche). */
export async function searchCreators(params: CreatorSearchParams) {
  const db = getDb();
  const conditions = publicVisibilityConditions();
  if (params.q) {
    const pattern = `%${escapeLike(params.q)}%`;
    conditions.push(
      or(ilike(creatorProfiles.displayName, pattern), ilike(creatorProfiles.tagline, pattern), ilike(creatorProfiles.bio, pattern))!,
    );
  }
  if (params.availability === "live") conditions.push(eq(creatorProfiles.availability, "live"));
  if (params.availability === "online") conditions.push(inArray(creatorProfiles.availability, ["online", "live"]));
  if (params.language) conditions.push(sql`${params.language} = ANY(${creatorProfiles.languages})`);
  if (params.tag) conditions.push(sql`${params.tag} = ANY(${creatorProfiles.tags})`);
  if (params.maxPrice) conditions.push(lte(creatorOffers.coinsPerMinute, params.maxPrice));

  const availabilityRank = sql`CASE ${creatorProfiles.availability} WHEN 'live' THEN 0 WHEN 'online' THEN 1 WHEN 'in_private' THEN 2 ELSE 3 END`;
  const orderBy = (() => {
    switch (params.sort) {
      case "newest":
        return [desc(creatorProfiles.createdAt)];
      case "price_asc":
        return [asc(creatorOffers.coinsPerMinute), asc(creatorProfiles.displayName)];
      case "price_desc":
        return [desc(creatorOffers.coinsPerMinute), asc(creatorProfiles.displayName)];
      case "name":
        return [asc(creatorProfiles.displayName)];
      default:
        return [asc(availabilityRank), desc(creatorProfiles.lastOnlineAt), asc(creatorProfiles.displayName)];
    }
  })();

  const page = params.page ?? 1;
  const where = and(...conditions);
  const base = db
    .select({
      id: creatorProfiles.id,
      slug: creatorProfiles.slug,
      displayName: creatorProfiles.displayName,
      tagline: creatorProfiles.tagline,
      availability: creatorProfiles.availability,
      languages: creatorProfiles.languages,
      tags: creatorProfiles.tags,
      coinsPerMinute: creatorOffers.coinsPerMinute,
      privateChatEnabled: creatorOffers.enabled,
      avatarMediaId: sql<string | null>`CASE WHEN ${mediaAssets.moderationStatus} = 'approved' AND ${mediaAssets.deletedAt} IS NULL THEN ${mediaAssets.id} ELSE NULL END`,
      isTestProfile: creatorProfiles.isTestProfile,
      verificationStatus: latestVerification,
      verificationProvider: latestVerificationProvider,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .leftJoin(creatorOffers, and(eq(creatorOffers.creatorProfileId, creatorProfiles.id), eq(creatorOffers.kind, "private_chat")))
    .leftJoin(mediaAssets, eq(mediaAssets.id, creatorProfiles.avatarMediaId))
    .where(where);

  const [rows, totalRow] = await Promise.all([
    base.orderBy(...orderBy).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .leftJoin(creatorOffers, and(eq(creatorOffers.creatorProfileId, creatorProfiles.id), eq(creatorOffers.kind, "private_chat")))
      .where(where),
  ]);
  const total = totalRow[0]?.value ?? 0;
  const items: CreatorCardData[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    tagline: row.tagline,
    availability: row.availability,
    languages: row.languages,
    tags: row.tags,
    coinsPerMinute: row.coinsPerMinute,
    privateChatEnabled: row.privateChatEnabled ?? false,
    avatarMediaId: row.avatarMediaId,
    isTestProfile: row.isTestProfile,
    verification: verificationDisplay(row.verificationStatus as VerificationStatus | null, row.verificationProvider),
  }));
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function countPublicCreators() {
  const [row] = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      live: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.availability} = 'live')::int`,
      online: sql<number>`count(*) FILTER (WHERE ${creatorProfiles.availability} IN ('online', 'live'))::int`,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(...publicVisibilityConditions()));
  return row ?? { total: 0, live: 0, online: 0 };
}

/** Öffentliche Profilansicht. Nicht freigegebene Profile sind nur für den Eigentümer sichtbar. */
export async function getCreatorProfileBySlug(slug: string, viewer: Actor | null) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const db = getDb();
  const [row] = await db
    .select({ profile: creatorProfiles, userStatus: users.status, offer: creatorOffers })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .leftJoin(creatorOffers, and(eq(creatorOffers.creatorProfileId, creatorProfiles.id), eq(creatorOffers.kind, "private_chat")))
    .where(eq(creatorProfiles.slug, slug))
    .limit(1);
  if (!row) return null;
  const isOwner = viewer?.id === row.profile.userId;
  const isAdmin = hasPermission(viewer, "admin.creators.review");

  const [verification] = await db
    .select({ status: creatorVerifications.status, provider: creatorVerifications.provider })
    .from(creatorVerifications)
    .where(eq(creatorVerifications.userId, row.profile.userId))
    .orderBy(desc(creatorVerifications.createdAt))
    .limit(1);

  const declarationsOk = await declarationsComplete(row.profile.userId);
  const publiclyVisible =
    row.profile.reviewStatus === "approved" &&
    row.userStatus === "active" &&
    declarationsOk &&
    creatorCanOperate(verification?.status as VerificationStatus | undefined, verification?.provider, isTestMode()) &&
    (isTestMode() || !row.profile.isTestProfile);
  if (!publiclyVisible && !isOwner && !isAdmin) return null;

  const media = await db
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, width: mediaAssets.width, height: mediaAssets.height, moderationStatus: mediaAssets.moderationStatus })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerUserId, row.profile.userId),
        isNull(mediaAssets.deletedAt),
        isOwner || isAdmin ? sql`true` : eq(mediaAssets.moderationStatus, "approved"),
      ),
    )
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt));

  const avatar = media.find((m) => m.id === row.profile.avatarMediaId && (m.moderationStatus === "approved" || isOwner || isAdmin));
  return {
    profile: row.profile,
    offer: row.offer,
    gallery: media.filter((m) => m.kind === "gallery"),
    avatarMediaId: avatar?.id ?? null,
    verification: verificationDisplay(verification?.status as VerificationStatus | undefined, verification?.provider),
    publiclyVisible,
    isOwner,
  };
}

// ── Bearbeitung durch den Creator ───────────────────────────────────────────

export async function getOwnProfile(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ profile: creatorProfiles, offer: creatorOffers })
    .from(creatorProfiles)
    .leftJoin(creatorOffers, and(eq(creatorOffers.creatorProfileId, creatorProfiles.id), eq(creatorOffers.kind, "private_chat")))
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  const media = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.ownerUserId, userId), isNull(mediaAssets.deletedAt)))
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt));
  return { ...row, media };
}

const textField = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} darf höchstens ${max} Zeichen lang sein.`)
    // Steuerzeichen entfernen (außer Zeilenumbrüchen)
    .transform((value) => value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ""));

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Der Anzeigename muss mindestens 2 Zeichen lang sein.")
    .max(40, "Der Anzeigename darf höchstens 40 Zeichen lang sein."),
  tagline: textField(120, "Die Kurzbeschreibung"),
  bio: textField(2000, "Die Beschreibung"),
  contactRules: textField(1000, "Die Regeln für die Kontaktaufnahme"),
  languages: z.array(z.string().refine(isLanguageCode, "Ungültige Sprache")).max(6, "Höchstens 6 Sprachen."),
  tags: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Ungültiges Thema")).max(6, "Höchstens 6 Themen."),
  allowSearchIndexing: z.boolean(),
});

/** Änderungen an freigegebenen Profilen werden vor der Veröffentlichung erneut geprüft. */
export async function updateOwnProfile(actor: Actor, rawInput: unknown) {
  const parsed = profileUpdateSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const input = parsed.data;
  // Themen nur aus den aktiven, von Mitarbeitern gepflegten Kategorien (kein Freitext).
  const activeCategories = new Set((await listCategories()).map((c) => c.slug));
  if (input.tags.some((tag) => !activeCategories.has(tag))) throw validationError("Ungültiges Thema.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(creatorProfiles).where(eq(creatorProfiles.userId, actor.id)).for("update");
    if (!profile) throw notFound("Kein Creator-Profil vorhanden.");
    if (!canEditCreatorProfile(actor, profile)) throw forbidden();
    if (profile.reviewStatus === "suspended") throw invalidState("Dein Profil ist gesperrt und kann derzeit nicht bearbeitet werden.");

    const contentChanged =
      profile.displayName !== input.displayName ||
      profile.tagline !== input.tagline ||
      profile.bio !== input.bio ||
      profile.contactRules !== input.contactRules ||
      profile.languages.join(",") !== input.languages.join(",") ||
      profile.tags.join(",") !== input.tags.join(",");
    const needsReview = contentChanged && profile.reviewStatus === "approved";

    const [updated] = await tx
      .update(creatorProfiles)
      .set({
        ...input,
        languages: [...new Set(input.languages)],
        tags: [...new Set(input.tags)],
        ...(needsReview ? { reviewStatus: "pending_review" as const, availability: "offline" as const } : {}),
      })
      .where(eq(creatorProfiles.id, profile.id))
      .returning();
    if (needsReview) {
      await notifyStaff(tx, "admin.creators.review", {
        type: "creator.review_requested",
        title: "Profiländerung zur Prüfung",
        body: `Das Profil „${input.displayName}“ wurde geändert und wartet auf Prüfung.`,
        linkPath: `/admin/creators/${profile.id}`,
      });
    }
    return { profile: updated!, needsReview };
  });
}

/** Preisgrenzen kommen aus den Plattform-Einstellungen (admin-konfigurierbar). */
export function pricingSchemaFor(limits: Settings["pricing"]) {
  return z.object({
    coinsPerMinute: z.coerce
      .number({ error: "Bitte gib einen Preis an." })
      .int("Bitte gib eine ganze Zahl an.")
      .min(limits.privateChatMin, `Mindestens ${limits.privateChatMin} Münzen pro Minute.`)
      .max(limits.privateChatMax, `Höchstens ${limits.privateChatMax} Münzen pro Minute.`),
    enabled: z.boolean(),
  });
}

/** Preise nur innerhalb der zentral definierten Grenzen. Laufende Sitzungen behalten ihren Preis-Snapshot. */
export async function updateOwnPricing(actor: Actor, rawInput: unknown) {
  if (!hasPermission(actor, "studio.pricing.edit")) throw forbidden();
  const settings = await getSettings();
  const parsed = pricingSchemaFor(settings.pricing).safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiger Preis.");
  const db = getDb();
  const [profile] = await db.select({ id: creatorProfiles.id, userId: creatorProfiles.userId }).from(creatorProfiles).where(eq(creatorProfiles.userId, actor.id)).limit(1);
  if (!profile || profile.userId !== actor.id) throw notFound("Kein Creator-Profil vorhanden.");
  await db
    .insert(creatorOffers)
    .values({ creatorProfileId: profile.id, kind: "private_chat", ...parsed.data })
    .onConflictDoUpdate({ target: [creatorOffers.creatorProfileId, creatorOffers.kind], set: { ...parsed.data, updatedAt: new Date() } });
}

// ── Veröffentlichungs-Checkliste ────────────────────────────────────────────

export type ChecklistItem = { key: string; label: string; done: boolean; hint?: string };

/**
 * Was fehlt noch bis zur Veröffentlichung? Dieselben Regeln gelten für die
 * öffentliche Sichtbarkeit (publicVisibilityConditions) und für die Freigabe
 * durch Mitarbeiter – eine Freigabe ohne vollständige Prüfungen ist nicht möglich.
 */
export async function getPublicationChecklist(userId: string): Promise<{ items: ChecklistItem[]; complete: boolean; readyForApproval: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({ profile: creatorProfiles, emailVerifiedAt: users.emailVerifiedAt, userStatus: users.status })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!row) return { items: [], complete: false, readyForApproval: false };
  const [verification] = await db
    .select({ status: creatorVerifications.status, provider: creatorVerifications.provider })
    .from(creatorVerifications)
    .where(eq(creatorVerifications.userId, userId))
    .orderBy(desc(creatorVerifications.createdAt))
    .limit(1);
  const declarationsOk = await declarationsComplete(userId);
  const verificationOk = creatorCanOperate(verification?.status as VerificationStatus | undefined, verification?.provider, isTestMode());
  const profileOk = row.profile.bio.trim().length >= 40 && row.profile.tagline.trim().length >= 5;
  const items: ChecklistItem[] = [
    { key: "email", label: "E-Mail-Adresse bestätigt", done: !!row.emailVerifiedAt },
    {
      key: "verification",
      label: "Alters- und Identitätsprüfung",
      done: verificationOk,
      hint: verification?.status === "test_passed" ? "Nur simuliert (Testmodus) – keine echte Prüfung." : undefined,
    },
    { key: "declarations", label: "Einwilligungs- und Rechteerklärungen abgegeben", done: declarationsOk },
    { key: "profile", label: "Profiltexte vollständig (Kurzbeschreibung, Beschreibung)", done: profileOk },
    { key: "approval", label: "Profil durch das Team freigegeben", done: row.profile.reviewStatus === "approved" },
  ];
  if (!isTestMode() && row.profile.isTestProfile) {
    items.push({ key: "not_test", label: "Kein Testprofil", done: false, hint: "Testprofile werden im Echtbetrieb nie veröffentlicht." });
  }
  const readyForApproval = items.filter((i) => i.key !== "approval").every((i) => i.done) && row.userStatus === "active";
  return { items, complete: readyForApproval && row.profile.reviewStatus === "approved", readyForApproval };
}

export async function submitProfileForReview(actor: Actor) {
  if (!hasPermission(actor, "studio.profile.edit")) throw forbidden();
  if (!actor.emailVerified) throw new AppError("forbidden", "Bitte bestätige zuerst deine E-Mail-Adresse.");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(creatorProfiles).where(eq(creatorProfiles.userId, actor.id)).for("update");
    if (!profile) throw notFound("Kein Creator-Profil vorhanden.");
    if (profile.reviewStatus !== "draft" && profile.reviewStatus !== "changes_requested") {
      throw invalidState("Das Profil befindet sich bereits in Prüfung oder ist freigegeben.");
    }
    if (profile.bio.trim().length < 40 || profile.tagline.trim().length < 5) {
      throw validationError("Bitte ergänze eine Kurzbeschreibung (mind. 5 Zeichen) und eine Beschreibung (mind. 40 Zeichen).");
    }
    await tx.update(creatorProfiles).set({ reviewStatus: "pending_review" }).where(eq(creatorProfiles.id, profile.id));
    await notifyStaff(tx, "admin.creators.review", {
      type: "creator.review_requested",
      title: "Neues Profil zur Prüfung",
      body: `„${profile.displayName}“ hat das Profil zur Prüfung eingereicht.`,
      linkPath: `/admin/creators/${profile.id}`,
    });
  });
}

// ── Prüfung durch Admins ────────────────────────────────────────────────────

export async function listProfilesForAdmin(filter: { status?: (typeof creatorProfiles.$inferSelect)["reviewStatus"] } = {}) {
  return getDb()
    .select({
      id: creatorProfiles.id,
      slug: creatorProfiles.slug,
      displayName: creatorProfiles.displayName,
      reviewStatus: creatorProfiles.reviewStatus,
      availability: creatorProfiles.availability,
      isTestProfile: creatorProfiles.isTestProfile,
      updatedAt: creatorProfiles.updatedAt,
      username: users.username,
      userStatus: users.status,
      verificationStatus: latestVerification,
      verificationProvider: latestVerificationProvider,
      pendingMedia: sql<number>`(SELECT count(*)::int FROM media_assets m WHERE m.owner_user_id = ${creatorProfiles.userId} AND m.moderation_status = 'pending' AND m.deleted_at IS NULL)`,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(filter.status ? eq(creatorProfiles.reviewStatus, filter.status) : undefined)
    .orderBy(
      sql`CASE ${creatorProfiles.reviewStatus} WHEN 'pending_review' THEN 0 ELSE 1 END`,
      desc(creatorProfiles.updatedAt),
    )
    .limit(200);
}

export async function getProfileForAdmin(profileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const db = getDb();
  const [row] = await db
    .select({ profile: creatorProfiles, offer: creatorOffers, username: users.username, userStatus: users.status, userId: users.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .leftJoin(creatorOffers, and(eq(creatorOffers.creatorProfileId, creatorProfiles.id), eq(creatorOffers.kind, "private_chat")))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!row) return null;
  const [verification] = await db
    .select()
    .from(creatorVerifications)
    .where(eq(creatorVerifications.userId, row.userId))
    .orderBy(desc(creatorVerifications.createdAt))
    .limit(1);
  const media = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.ownerUserId, row.userId), isNull(mediaAssets.deletedAt)))
    .orderBy(asc(mediaAssets.sortOrder));
  return { ...row, verification: verification ?? null, media };
}

export async function reviewProfile(input: {
  adminUserId: string;
  profileId: string;
  decision: "approve" | "request_changes" | "suspend";
  note: string;
  ipHash?: string | null;
}) {
  const note = input.note.trim();
  if (input.decision !== "approve" && note.length < 10) {
    throw validationError("Bitte begründe die Entscheidung (mind. 10 Zeichen).");
  }
  return getDb().transaction(async (tx) => {
    const [profile] = await tx.select().from(creatorProfiles).where(eq(creatorProfiles.id, input.profileId)).for("update");
    if (!profile) throw notFound("Profil nicht gefunden.");
    if (profile.userId === input.adminUserId) throw forbidden("Eigene Profile dürfen nicht selbst geprüft werden.");
    if (input.decision === "approve") {
      const checklist = await getPublicationChecklist(profile.userId);
      if (!checklist.readyForApproval) {
        const missing = checklist.items.filter((i) => !i.done && i.key !== "approval").map((i) => i.label);
        throw invalidState(`Freigabe nicht möglich – es fehlt noch: ${missing.join(", ")}.`);
      }
    }
    const status = input.decision === "approve" ? "approved" : input.decision === "request_changes" ? "changes_requested" : "suspended";
    await tx
      .update(creatorProfiles)
      .set({
        reviewStatus: status,
        reviewNote: note || null,
        reviewedAt: new Date(),
        reviewedById: input.adminUserId,
        ...(status !== "approved" ? { availability: "offline" as const } : {}),
      })
      .where(eq(creatorProfiles.id, profile.id));
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: `creator.${input.decision}`,
      targetType: "creator_profile",
      targetId: profile.id,
      reason: note || undefined,
      metadata: { previousStatus: profile.reviewStatus, newStatus: status },
      ipHash: input.ipHash,
    });
    await notify(tx, {
      userId: profile.userId,
      type: `creator.${input.decision}`,
      title:
        status === "approved" ? "Profil freigegeben" : status === "changes_requested" ? "Änderungen am Profil erforderlich" : "Profil gesperrt",
      body:
        status === "approved"
          ? "Dein Profil wurde geprüft und freigegeben."
          : `Begründung: ${note}`,
      linkPath: "/studio/profile",
    });
  });
}
