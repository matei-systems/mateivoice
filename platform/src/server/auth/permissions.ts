/**
 * Rollen- und Berechtigungsmodell (reine Funktionen, ohne I/O – vollständig testbar).
 *
 * Grundsatz: Versteckte Buttons sind keine Zugriffskontrolle. Jede geschützte
 * Operation prüft serverseitig über diese Funktionen.
 *
 * Mitarbeiterrollen folgen dem Prinzip der minimalen Rechte:
 *  - admin:     Gesamtverantwortung inkl. Einstellungen, Mitarbeiter, Audit
 *  - moderator: Profilprüfung, Meldungen, Sanktionen, Chat-/Stream-Moderation, Beweissicherung
 *  - support:   Support-Anfragen, Datenschutzanfragen, Nutzerdaten (mit Begründung)
 *  - finance:   Transaktionen, Erstattungen, Auszahlungsfreigaben, Berichte, Risikosignale
 */

export type Role = "customer" | "creator" | "admin" | "moderator" | "support" | "finance";
export type StaffRole = "admin" | "moderator" | "support" | "finance";
export type UserStatus = "active" | "suspended" | "deleted";

export const STAFF_ROLES: readonly StaffRole[] = ["admin", "moderator", "support", "finance"];

export function isStaffRole(role: Role | string | null | undefined): role is StaffRole {
  return role === "admin" || role === "moderator" || role === "support" || role === "finance";
}

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Kunde",
  creator: "Creator",
  admin: "Administrator",
  moderator: "Moderation",
  support: "Support",
  finance: "Finanzen",
};

export type Actor = {
  id: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
};

export const PERMISSIONS = [
  // Konto (alle angemeldeten Rollen)
  "account.view",
  "account.manage",
  "support.create",
  "appeals.create",
  "reports.create",
  "notifications.view",
  "blocks.manage",
  // Kunden
  "creators.watch_public",
  "sessions.request_private",
  "wallet.view",
  "wallet.request_test_credit",
  "wallet.purchase",
  "favorites.manage",
  "chat.participate",
  "tips.send",
  "age_verification.manage",
  // Creator
  "studio.access",
  "studio.profile.edit",
  "studio.pricing.edit",
  "studio.availability.set",
  "studio.sessions.manage",
  "studio.earnings.view",
  "studio.verification.manage",
  "studio.payouts.manage",
  "studio.chat.moderate",
  // Mitarbeiter
  "admin.access",
  "admin.users.view",
  "admin.users.reveal_pii",
  "admin.creators.review",
  "admin.reports.manage",
  "admin.sanctions.manage",
  "admin.chat.moderate",
  "admin.streams.manage",
  "admin.legal_holds.manage",
  "admin.ledger.view",
  "admin.ledger.adjust",
  "admin.payouts.manage",
  "admin.payments.simulate",
  "admin.finance.reports",
  "admin.risk.review",
  "admin.packages.manage",
  "admin.support.manage",
  "admin.privacy.manage",
  "admin.settings.manage",
  "admin.categories.manage",
  "admin.config.view",
  "admin.audit.view",
  "admin.staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const COMMON: Permission[] = [
  "account.view",
  "account.manage",
  "support.create",
  "appeals.create",
  "reports.create",
  "notifications.view",
];

const STAFF_COMMON: Permission[] = ["account.view", "account.manage", "notifications.view", "admin.access", "admin.users.view"];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  customer: new Set<Permission>([
    ...COMMON,
    "blocks.manage",
    "creators.watch_public",
    "sessions.request_private",
    "wallet.view",
    "wallet.request_test_credit",
    "wallet.purchase",
    "favorites.manage",
    "chat.participate",
    "tips.send",
    "age_verification.manage",
  ]),
  creator: new Set<Permission>([
    ...COMMON,
    "blocks.manage",
    "chat.participate",
    "studio.access",
    "studio.profile.edit",
    "studio.pricing.edit",
    "studio.availability.set",
    "studio.sessions.manage",
    "studio.earnings.view",
    "studio.verification.manage",
    "studio.payouts.manage",
    "studio.chat.moderate",
  ]),
  moderator: new Set<Permission>([
    ...STAFF_COMMON,
    "admin.creators.review",
    "admin.reports.manage",
    "admin.sanctions.manage",
    "admin.chat.moderate",
    "admin.streams.manage",
    "admin.legal_holds.manage",
  ]),
  support: new Set<Permission>([...STAFF_COMMON, "admin.users.reveal_pii", "admin.support.manage", "admin.privacy.manage"]),
  finance: new Set<Permission>([
    ...STAFF_COMMON,
    "admin.ledger.view",
    "admin.ledger.adjust",
    "admin.payouts.manage",
    "admin.payments.simulate",
    "admin.finance.reports",
    "admin.risk.review",
    "admin.packages.manage",
  ]),
  admin: new Set<Permission>([
    ...STAFF_COMMON,
    "admin.users.reveal_pii",
    "admin.creators.review",
    "admin.reports.manage",
    "admin.sanctions.manage",
    "admin.chat.moderate",
    "admin.streams.manage",
    "admin.legal_holds.manage",
    "admin.ledger.view",
    "admin.ledger.adjust",
    "admin.payouts.manage",
    "admin.payments.simulate",
    "admin.finance.reports",
    "admin.risk.review",
    "admin.packages.manage",
    "admin.support.manage",
    "admin.privacy.manage",
    "admin.settings.manage",
    "admin.categories.manage",
    "admin.config.view",
    "admin.audit.view",
    "admin.staff.manage",
  ]),
};

/** Gesperrte Konten dürfen nur Konto ansehen, Support kontaktieren und Einspruch erheben. */
const SUSPENDED_ALLOWED = new Set<Permission>(["account.view", "support.create", "appeals.create"]);

/** Diese Aktionen erfordern eine bestätigte E-Mail-Adresse. */
const REQUIRES_VERIFIED_EMAIL = new Set<Permission>([
  "sessions.request_private",
  "wallet.request_test_credit",
  "wallet.purchase",
  "chat.participate",
  "tips.send",
  "age_verification.manage",
  "studio.availability.set",
  "studio.verification.manage",
  "studio.payouts.manage",
  "reports.create",
]);

export function hasPermission(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || actor.status === "deleted") return false;
  const granted = ROLE_PERMISSIONS[actor.role];
  if (!granted || !granted.has(permission)) return false;
  if (actor.status === "suspended" && !SUSPENDED_ALLOWED.has(permission)) return false;
  if (REQUIRES_VERIFIED_EMAIL.has(permission) && !actor.emailVerified) return false;
  return true;
}

export function permissionsFor(actor: Actor): Permission[] {
  return PERMISSIONS.filter((permission) => hasPermission(actor, permission));
}

// ── Ressourcenbezogene Richtlinien (Schutz gegen IDOR) ───────────────────────

type SessionLike = { customerUserId: string | null; creatorUserId: string; kind: string };

/**
 * Sitzungsdetails sehen nur Teilnehmer sowie Mitarbeiter, die sie für Meldungen,
 * Streams oder Abrechnung benötigen (nur Metadaten, kein Beitritt).
 */
export function canViewSession(actor: Actor | null | undefined, session: SessionLike): boolean {
  if (!actor || actor.status === "deleted") return false;
  if (isStaffRole(actor.role)) {
    return hasPermission(actor, "admin.reports.manage") || hasPermission(actor, "admin.streams.manage") || hasPermission(actor, "admin.ledger.view");
  }
  return session.customerUserId === actor.id || session.creatorUserId === actor.id;
}

/** Beitritt nur für die beiden Teilnehmer (privat) bzw. angemeldete Kunden (öffentlich). Mitarbeiter treten nie still bei. */
export function canJoinSession(actor: Actor | null | undefined, session: SessionLike): boolean {
  if (!actor || actor.status !== "active") return false;
  if (session.kind === "private_chat") {
    return session.customerUserId === actor.id || session.creatorUserId === actor.id;
  }
  if (session.creatorUserId === actor.id) return true;
  return hasPermission(actor, "creators.watch_public");
}

/** Nur der Eigentümer bearbeitet sein Creator-Profil (Mitarbeiter nutzen eigene Moderationsfunktionen). */
export function canEditCreatorProfile(actor: Actor | null | undefined, profile: { userId: string }): boolean {
  return hasPermission(actor, "studio.profile.edit") && actor!.id === profile.userId;
}

/** Einnahmen sieht nur der Creator selbst oder Mitarbeiter mit Ledger-Berechtigung. */
export function canViewCreatorEarnings(actor: Actor | null | undefined, creatorUserId: string): boolean {
  if (hasPermission(actor, "admin.ledger.view")) return true;
  return hasPermission(actor, "studio.earnings.view") && actor!.id === creatorUserId;
}

/** Eigene Transaktionen; Mitarbeiter mit Ledger-Berechtigung sehen alle. */
export function canViewWallet(actor: Actor | null | undefined, ownerUserId: string): boolean {
  if (hasPermission(actor, "admin.ledger.view")) return true;
  return !!actor && actor.status !== "deleted" && actor.id === ownerUserId;
}

/** Zielpfad nach dem Login je Rolle. */
export function homePathFor(role: Role): string {
  if (isStaffRole(role)) return "/admin";
  return role === "creator" ? "/studio" : "/account";
}
