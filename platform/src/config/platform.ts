/**
 * Zentrale, nicht geheime Plattformkonfiguration.
 *
 * Diese Datei darf in Client- und Server-Code importiert werden. Sie enthält
 * KEINE Geheimnisse. Geschäftsregeln (Provision, Preisgrenzen, Testmodus-Limits)
 * werden ausschließlich hier gepflegt und nicht in einzelnen Komponenten
 * wiederholt.
 */

export const brand = {
  /** Arbeitsname – bis zur Namensentscheidung über NEXT_PUBLIC_PLATFORM_NAME austauschbar. */
  name: process.env.NEXT_PUBLIC_PLATFORM_NAME?.trim() || "Project Aurora",
  tagline: "Live. Persönlich. Mit Respekt.",
  description:
    "Live-Streams und private 1:1-Videochats mit verifizierten erwachsenen Creatorn – mit klaren Preisen, fairen Regeln und Sicherheit von Anfang an.",
  /** Erster Markt. Expansion (DE, weitere EU-Länder) ist architektonisch vorbereitet. */
  market: "AT",
  locale: "de-AT",
  timeZone: "Europe/Vienna",
} as const;

/**
 * Plattformprovision.
 *
 * VORLÄUFIGE GESCHÄFTSENTSCHEIDUNG: 30 % (3000 Basispunkte). Bemessungsgrundlage
 * im Prototyp: verbrauchte Münzen einer Leistung (Brutto-Münzverbrauch). Die
 * endgültige Brutto-/Netto-Regel (inkl. USt., Zahlungsgebühren) ist vertraglich
 * und steuerlich noch zu klären – siehe docs/LEGAL-OPEN-QUESTIONS-AT.md.
 *
 * Serverseitig kann der Wert über PLATFORM_COMMISSION_BPS überschrieben werden.
 * Jede Buchung speichert den zum Buchungszeitpunkt gültigen Satz.
 */
export const commission = {
  defaultPlatformBps: 3000,
  status: "provisional" as const,
  basisDescription:
    "Vorläufig: Anteil an den verbrauchten Münzen einer Leistung. Endgültige Bemessungsgrundlage wird vertraglich und steuerlich geprüft.",
  roundingDescription:
    "Creator-Anteil wird auf ganze Münzen abgerundet, die Differenz entfällt auf die Plattform. Die Summe entspricht immer dem Münzverbrauch.",
};

/** Preisgrenzen, innerhalb derer Creator ihre Preise selbst festlegen. */
export const pricing = {
  privateChat: {
    minCoinsPerMinute: 10,
    maxCoinsPerMinute: 300,
    defaultCoinsPerMinute: 40,
  },
} as const;

/** Regeln für simulierte Testmünzen (nur im Testmodus aktiv). */
export const testCoins = {
  /** Gutschrift pro Anforderung. */
  grantAmount: 500,
  /** Keine weitere Gutschrift, wenn der Testsaldo diesen Wert erreicht. */
  maxBalanceForGrant: 2000,
  /** Höchstens eine Gutschrift pro Kalendertag (Europe/Vienna). */
  grantsPerDay: 1,
} as const;

/** Parameter für Video-Sitzungen. */
export const videoSessions = {
  /** Wie lange eine Anfrage für einen privaten Chat offen bleibt. */
  requestTtlSeconds: 120,
  /** Gültigkeit eines Beitritts-Tokens. */
  joinTokenTtlSeconds: 120,
  /** Nach so vielen Sekunden ohne Herzschlag gilt eine Verbindung als verloren. */
  heartbeatTimeoutSeconds: 45,
  /** Mindestguthaben in Minuten, um einen privaten Chat anzufragen. */
  minimumBalanceMinutes: 1,
  /** Abrechnungsintervall – jede begonnene Minute wird zu Beginn berechnet. */
  billingIntervalSeconds: 60,
} as const;

/** Uploads. */
export const uploads = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxInputPixels: 40_000_000,
  outputMaxDimension: 1600,
  maxGalleryImages: 6,
} as const;

/**
 * Versionen der Rechtstexte. Alle Texte sind ENTWÜRFE und rechtlich nicht
 * geprüft. Eine Änderung der Version erfordert eine erneute Zustimmung.
 */
export const legalDocuments = {
  terms: { version: "2026-10-entwurf-1", title: "Nutzungsbedingungen", status: "draft" },
  privacy: { version: "2026-10-entwurf-1", title: "Datenschutzinformation", status: "draft" },
  creatorAgreement: {
    version: "2026-10-entwurf-1",
    title: "Creator-Vereinbarung",
    status: "draft",
  },
  communityGuidelines: {
    version: "2026-10-entwurf-1",
    title: "Community-Richtlinien",
    status: "draft",
  },
} as const;

export type LegalDocumentKey = keyof typeof legalDocuments;

/** Mindestalter. */
export const minimumAge = 18;
