import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { cache } from "react";
import { commission, pricing, testCoins, videoSessions } from "@/config/platform";
import { getDb } from "@/server/db/client";
import { categories, platformSettings, platformSettingsHistory } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { AppError, PG_UNIQUE_VIOLATION, notFound, pgErrorCode, validationError } from "@/server/errors";
import { log } from "@/server/log";

/**
 * Admin-konfigurierbare Plattform-Einstellungen.
 *
 * - Jeder Schlüssel hat ein Zod-Schema und einen Standardwert (aus config/platform.ts).
 * - Änderungen erfordern eine Begründung, werden in einer unveränderlichen Historie
 *   und im Audit-Protokoll gespeichert und gelten ab sofort für NEUE Vorgänge
 *   (laufende Sitzungen/Buchungen behalten ihren Snapshot, z. B. den Provisionssatz).
 */

const countryCode = z.string().regex(/^[A-Z]{2}$/, "Ländercode im Format ISO 3166-1 (z. B. AT)");

export const settingsSchemas = {
  commission: z.object({
    /** Plattformanteil in Basispunkten (2500 = 25 %). Obergrenze als Schutz vor Fehleingaben. */
    platformBps: z.number().int().min(0).max(5000),
  }),
  payout: z.object({
    minimumCoins: z.number().int().min(1).max(10_000_000),
    /** Haltefrist für Einnahmen (Schutz vor Rückbuchungen). */
    holdDays: z.number().int().min(0).max(120),
    /**
     * Auszahlungswert in Euro-Cent je 100 Münzen (vorläufig, Geschäftsentscheidung offen).
     * Beispiel: 100 → 100 Münzen = 1,00 €.
     */
    centsPer100Coins: z.number().int().min(1).max(10_000),
    /** Vier-Augen-Prinzip: Freigabe und Ausführung durch verschiedene Personen. */
    requireFourEyes: z.boolean(),
  }),
  payments: z
    .object({
      /** Verbraucherschutz/Betrugsprävention: maximale Käufe je Person (Cent, brutto). */
      dailyLimitCents: z.number().int().min(100).max(1_000_000),
      monthlyLimitCents: z.number().int().min(100).max(10_000_000),
    })
    .refine((v) => v.dailyLimitCents <= v.monthlyLimitCents, { message: "Tageslimit darf nicht über dem Monatslimit liegen." }),
  pricing: z
    .object({
      privateChatMin: z.number().int().min(1).max(10_000),
      privateChatMax: z.number().int().min(1).max(10_000),
      tipMin: z.number().int().min(1).max(100_000),
      tipMax: z.number().int().min(1).max(100_000),
    })
    .refine((v) => v.privateChatMin <= v.privateChatMax && v.tipMin <= v.tipMax, { message: "Minimum darf nicht über dem Maximum liegen." }),
  featureFlags: z.object({
    registrations: z.boolean(),
    creatorApplications: z.boolean(),
    publicStreams: z.boolean(),
    privateChat: z.boolean(),
    chat: z.boolean(),
    tips: z.boolean(),
    favorites: z.boolean(),
    purchases: z.boolean(),
    payouts: z.boolean(),
  }),
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string().max(300),
  }),
  ageAssurance: z.object({
    /** Zugelassene Wohnsitzländer für Registrierungen (Startmarkt DACH). */
    allowedCountries: z.array(countryCode).min(1).max(30),
    /**
     * Anforderung je Land für Zugang zu Streams, privaten Chats, Chat und Käufen:
     * "verified" = Altersprüfung über Anbieter erforderlich; "self_declaration" = Selbstauskunft.
     */
    policy: z.record(countryCode, z.enum(["verified", "self_declaration"])),
    defaultPolicy: z.enum(["verified", "self_declaration"]),
  }),
  streaming: z.object({
    maxViewersPerStream: z.number().int().min(1).max(100_000),
    requestTtlSeconds: z.number().int().min(30).max(900),
    heartbeatTimeoutSeconds: z.number().int().min(15).max(600),
  }),
  chat: z.object({
    maxMessageLength: z.number().int().min(20).max(1000),
    minIntervalSeconds: z.number().int().min(0).max(120),
  }),
  retention: z.object({
    chatMessagesDays: z.number().int().min(1).max(3650),
    emailOutboxDays: z.number().int().min(1).max(3650),
    sessionEventsDays: z.number().int().min(30).max(3650),
  }),
  email: z.object({
    senderName: z.string().trim().min(2).max(60),
  }),
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchemas)[K]> };

export const SETTING_KEYS = Object.keys(settingsSchemas) as SettingKey[];

export const DEFAULT_SETTINGS: Settings = {
  commission: { platformBps: commission.defaultPlatformBps },
  payout: { minimumCoins: 1000, holdDays: 14, centsPer100Coins: 100, requireFourEyes: true },
  payments: { dailyLimitCents: 25_000, monthlyLimitCents: 100_000 },
  pricing: {
    privateChatMin: pricing.privateChat.minCoinsPerMinute,
    privateChatMax: pricing.privateChat.maxCoinsPerMinute,
    tipMin: pricing.tips.min,
    tipMax: pricing.tips.max,
  },
  featureFlags: {
    registrations: true,
    creatorApplications: true,
    publicStreams: true,
    privateChat: true,
    chat: true,
    tips: true,
    favorites: true,
    purchases: true,
    payouts: true,
  },
  maintenance: { enabled: false, message: "" },
  ageAssurance: {
    allowedCountries: ["AT", "DE", "CH"],
    // Konservativer Standard: überall echte Altersprüfung (in DE gesetzlich für geschlossene Benutzergruppen gefordert).
    policy: { AT: "verified", DE: "verified", CH: "verified" },
    defaultPolicy: "verified",
  },
  streaming: {
    maxViewersPerStream: 500,
    requestTtlSeconds: videoSessions.requestTtlSeconds,
    heartbeatTimeoutSeconds: videoSessions.heartbeatTimeoutSeconds,
  },
  chat: { maxMessageLength: 500, minIntervalSeconds: 2 },
  retention: { chatMessagesDays: 90, emailOutboxDays: 30, sessionEventsDays: 365 },
  email: { senderName: "Project Aurora" },
};

/** Für die Admin-Oberfläche: Bezeichnungen der Schlüssel. */
export const SETTING_LABELS: Record<SettingKey, string> = {
  commission: "Provision",
  payout: "Auszahlungsregeln",
  payments: "Kauflimits",
  pricing: "Preisgrenzen",
  featureFlags: "Funktionen (Feature-Flags)",
  maintenance: "Wartungsmodus",
  ageAssurance: "Länder & Altersprüfung",
  streaming: "Streaming",
  chat: "Chat",
  retention: "Aufbewahrungsfristen",
  email: "E-Mail",
};

// Kurzlebiger Prozess-Cache (mehrere Instanzen: max. CACHE_MS veraltete Werte).
const CACHE_MS = 5000;
let cached: { at: number; value: Settings } | undefined;

export function invalidateSettingsCache() {
  cached = undefined;
}

async function loadSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const rows = await getDb().select().from(platformSettings);
  const result: Settings = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    if (!(row.key in settingsSchemas)) continue;
    const key = row.key as SettingKey;
    const parsed = settingsSchemas[key].safeParse(row.value);
    if (parsed.success) {
      (result as Record<SettingKey, unknown>)[key] = parsed.data;
    } else {
      log.error("settings.invalid_stored_value", { key });
    }
  }
  cached = { at: Date.now(), value: result };
  return result;
}

/** Aktuelle Einstellungen (pro Anfrage einmal geladen). */
export const getSettings = cache(loadSettings);

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function updateSetting<K extends SettingKey>(input: {
  actorUserId: string;
  key: K;
  value: unknown;
  reason: string;
  ipHash?: string | null;
}) {
  if (!(input.key in settingsSchemas)) throw notFound("Unbekannte Einstellung.");
  const reason = input.reason.trim();
  if (reason.length < 10) throw validationError("Bitte begründe die Änderung (mind. 10 Zeichen).");
  const parsed = settingsSchemas[input.key].safeParse(input.value);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiger Wert.");
  const value = parsed.data;
  await getDb().transaction(async (tx) => {
    const [previous] = await tx.select().from(platformSettings).where(eq(platformSettings.key, input.key)).for("update");
    await tx
      .insert(platformSettings)
      .values({ key: input.key, value, updatedById: input.actorUserId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedById: input.actorUserId, updatedAt: new Date() } });
    await tx.insert(platformSettingsHistory).values({
      key: input.key,
      value,
      previousValue: previous?.value ?? DEFAULT_SETTINGS[input.key],
      changedById: input.actorUserId,
      reason,
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: "settings.update",
      targetType: "setting",
      targetId: input.key,
      reason,
      metadata: { previous: previous?.value ?? DEFAULT_SETTINGS[input.key], next: value },
      ipHash: input.ipHash,
    });
  });
  invalidateSettingsCache();
  return value;
}

export async function getSettingHistory(key?: SettingKey, limit = 50) {
  const db = getDb();
  const query = db.select().from(platformSettingsHistory);
  return (key ? query.where(eq(platformSettingsHistory.key, key)) : query).orderBy(desc(platformSettingsHistory.createdAt)).limit(limit);
}

/** Seit wann gilt der aktuelle Provisionssatz? (Transparenz für Creator) */
export async function commissionEffectiveSince(): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: platformSettingsHistory.createdAt })
    .from(platformSettingsHistory)
    .where(eq(platformSettingsHistory.key, "commission"))
    .orderBy(desc(platformSettingsHistory.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

// ── Kategorien ──────────────────────────────────────────────────────────────

export async function listCategories(options: { includeInactive?: boolean } = {}) {
  const db = getDb();
  const query = db.select().from(categories);
  return (options.includeInactive ? query : query.where(eq(categories.active, true))).orderBy(asc(categories.sortOrder), asc(categories.label));
}

export const categorySchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Kürzel: Kleinbuchstaben, Ziffern und Bindestriche."),
  label: z.string().trim().min(2).max(40),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean(),
});

export async function upsertCategory(actorUserId: string, raw: unknown, ipHash?: string | null) {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Kategorie.");
  const input = parsed.data;
  try {
    await getDb().transaction(async (tx) => {
      await tx
        .insert(categories)
        .values(input)
        .onConflictDoUpdate({ target: categories.slug, set: { label: input.label, sortOrder: input.sortOrder, active: input.active } });
      await writeAuditLog(tx, { actorUserId, action: "category.upsert", targetType: "category", targetId: input.slug, metadata: input, ipHash });
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new AppError("conflict", "Kategorie existiert bereits.");
    throw error;
  }
}

export async function isActiveCategory(slug: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ slug: categories.slug })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.active, true)))
    .limit(1);
  return !!row;
}

// Re-Export für Seiten, die Standardwerte anzeigen (z. B. Testguthaben-Regeln).
export { testCoins };
