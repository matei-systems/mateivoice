/**
 * Rollen- und Berechtigungsmodell (reine Funktionen, ohne I/O – vollständig testbar).
 *
 * Grundsatz: Versteckte Buttons sind keine Zugriffskontrolle. Jede geschützte
 * Operation prüft serverseitig über diese Funktionen.
 */

export type Role = "customer" | "creator" | "admin";
export type UserStatus = "active" | "suspended" | "deleted";

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
  // Kunden
  "creators.watch_public",
  "sessions.request_private",
  "wallet.view",
  "wallet.request_test_credit",
  // Creator
  "studio.access",
  "studio.profile.edit",
  "studio.pricing.edit",
  "studio.availability.set",
  "studio.sessions.manage",
  "studio.earnings.view",
  "studio.verification.manage",
  // Administration
  "admin.access",
  "admin.users.manage",
  "admin.creators.review",
  "admin.reports.manage",
  "admin.sanctions.manage",
  "admin.ledger.view",
  "admin.ledger.adjust",
  "admin.payments.simulate",
  "admin.config.view",
  "admin.audit.view",
  "admin.support.manage",
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

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  customer: new Set<Permission>([
    ...COMMON,
    "creators.watch_public",
    "sessions.request_private",
    "wallet.view",
    "wallet.request_test_credit",
  ]),
  creator: new Set<Permission>([
    ...COMMON,
    "studio.access",
    "studio.profile.edit",
    "studio.pricing.edit",
    "studio.availability.set",
    "studio.sessions.manage",
    "studio.earnings.view",
    "studio.verification.manage",
  ]),
  admin: new Set<Permission>([
    ...COMMON,
    "admin.access",
    "admin.users.manage",
    "admin.creators.review",
    "admin.reports.manage",
    "admin.sanctions.manage",
    "admin.ledger.view",
    "admin.ledger.adjust",
    "admin.payments.simulate",
    "admin.config.view",
    "admin.audit.view",
    "admin.support.manage",
  ]),
};

/** Gesperrte Konten dürfen nur Konto ansehen, Support kontaktieren und Einspruch erheben. */
const SUSPENDED_ALLOWED = new Set<Permission>(["account.view", "support.create", "appeals.create"]);

/** Diese Aktionen erfordern eine bestätigte E-Mail-Adresse. */
const REQUIRES_VERIFIED_EMAIL = new Set<Permission>([
  "sessions.request_private",
  "wallet.request_test_credit",
  "studio.availability.set",
  "studio.verification.manage",
  "reports.create",
]);

export function hasPermission(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || actor.status === "deleted") return false;
  if (!ROLE_PERMISSIONS[actor.role].has(permission)) return false;
  if (actor.status === "suspended" && !SUSPENDED_ALLOWED.has(permission)) return false;
  if (REQUIRES_VERIFIED_EMAIL.has(permission) && !actor.emailVerified) return false;
  return true;
}

export function permissionsFor(actor: Actor): Permission[] {
  return PERMISSIONS.filter((permission) => hasPermission(actor, permission));
}

// ── Ressourcenbezogene Richtlinien (Schutz gegen IDOR) ───────────────────────

type SessionLike = { customerUserId: string | null; creatorUserId: string; kind: string };

/** Teilnehmer eines privaten Chats oder Admins dürfen Sitzungsdetails sehen. */
export function canViewSession(actor: Actor | null | undefined, session: SessionLike): boolean {
  if (!actor || actor.status === "deleted") return false;
  if (actor.role === "admin") return hasPermission(actor, "admin.access");
  return session.customerUserId === actor.id || session.creatorUserId === actor.id;
}

/** Beitritt nur für die beiden Teilnehmer (privat) bzw. angemeldete Kunden (öffentlich). */
export function canJoinSession(actor: Actor | null | undefined, session: SessionLike): boolean {
  if (!actor || actor.status !== "active") return false;
  if (session.kind === "private_chat") {
    return session.customerUserId === actor.id || session.creatorUserId === actor.id;
  }
  if (session.creatorUserId === actor.id) return true;
  return hasPermission(actor, "creators.watch_public");
}

/** Nur der Eigentümer bearbeitet sein Creator-Profil (Admins nutzen eigene Moderationsfunktionen). */
export function canEditCreatorProfile(actor: Actor | null | undefined, profile: { userId: string }): boolean {
  return hasPermission(actor, "studio.profile.edit") && actor!.id === profile.userId;
}

/** Einnahmen sieht nur der Creator selbst oder ein Admin mit Ledger-Berechtigung. */
export function canViewCreatorEarnings(actor: Actor | null | undefined, creatorUserId: string): boolean {
  if (hasPermission(actor, "admin.ledger.view")) return true;
  return hasPermission(actor, "studio.earnings.view") && actor!.id === creatorUserId;
}

/** Eigene Transaktionen; Admins mit Ledger-Berechtigung sehen alle. */
export function canViewWallet(actor: Actor | null | undefined, ownerUserId: string): boolean {
  if (hasPermission(actor, "admin.ledger.view")) return true;
  return !!actor && actor.status !== "deleted" && actor.id === ownerUserId;
}

/** Zielpfad nach dem Login je Rolle. */
export function homePathFor(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "creator":
      return "/studio";
    default:
      return "/account";
  }
}
