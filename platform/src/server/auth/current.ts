import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv } from "@/config/env";
import { hashIp } from "@/server/crypto";
import { AppError } from "@/server/errors";
import { safeRedirectPath } from "@/lib/utils";
import { hasPermission, type Actor, type Permission, type Role } from "./permissions";
import { validateSessionToken, type ValidatedSession } from "./session";
import type { RequestContext } from "./service";

/**
 * Next.js-Anbindung der Sitzungsverwaltung. Seiten nutzen require*-Funktionen
 * (Weiterleitung), Server Actions nutzen assert*-Funktionen (Fehler).
 */

export function sessionCookieName(): string {
  // __Host-Präfix erzwingt Secure, Path=/ und verbietet Domain – nur über HTTPS möglich.
  return getEnv().APP_URL.startsWith("https://") ? "__Host-aurora_session" : "aurora_session";
}

export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const store = await cookies();
  return validateSessionToken(store.get(sessionCookieName())?.value);
});

/** Vollständig angemeldeter Nutzer (inkl. bestätigtem zweitem Faktor, falls aktiv). */
export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session && !session.mfaPending ? session.user : null;
}

export function toActor(session: ValidatedSession | null): Actor | null {
  if (!session || session.mfaPending) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    status: session.user.status,
    emailVerified: session.user.emailVerified,
  };
}

export async function getActor(): Promise<Actor | null> {
  return toActor(await getCurrentSession());
}

function loginRedirect(nextPath?: string): never {
  const next = safeRedirectPath(nextPath, "");
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

export async function requireSession(nextPath?: string): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session) loginRedirect(nextPath);
  if (session.mfaPending) {
    redirect(`/login/mfa${nextPath ? `?next=${encodeURIComponent(safeRedirectPath(nextPath))}` : ""}`);
  }
  return session;
}

export async function requireRole(roles: Role[], nextPath?: string): Promise<ValidatedSession> {
  const session = await requireSession(nextPath);
  if (!roles.includes(session.user.role)) redirect("/forbidden");
  return session;
}

/** Adminbereich: Rolle admin UND bestätigte Zwei-Faktor-Authentifizierung. */
export async function requireAdmin(nextPath = "/admin"): Promise<ValidatedSession> {
  const session = await requireRole(["admin"], nextPath);
  if (!session.user.totpEnabled) redirect("/account/security?mfa=required");
  if (!session.mfaVerified) redirect(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
  if (session.user.status !== "active") redirect("/forbidden");
  return session;
}

/** Für Server Actions und Route Handler: wirft statt weiterzuleiten. */
export async function assertSession(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session || session.mfaPending) throw new AppError("unauthenticated", "Bitte melde dich an.");
  return session;
}

export async function assertPermission(permission: Permission): Promise<{ session: ValidatedSession; actor: Actor }> {
  const session = await assertSession();
  const actor = toActor(session)!;
  if (permission.startsWith("admin.") && (!session.user.totpEnabled || !session.mfaVerified)) {
    throw new AppError("forbidden", "Für den Adminbereich ist eine bestätigte Zwei-Faktor-Anmeldung erforderlich.");
  }
  if (!hasPermission(actor, permission)) {
    if (!actor.emailVerified && actor.status === "active") {
      throw new AppError("forbidden", "Bitte bestätige zuerst deine E-Mail-Adresse.");
    }
    if (actor.status === "suspended") {
      throw new AppError("forbidden", "Dein Konto ist derzeit gesperrt. Du kannst Einspruch einlegen oder den Support kontaktieren.");
    }
    throw new AppError("forbidden", "Für diese Aktion fehlt die Berechtigung.");
  }
  return { session, actor };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: getEnv().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(sessionCookieName());
}

/** Client-IP: rechter Eintrag von X-Forwarded-For (vom eigenen Reverse Proxy bzw. Next.js gesetzt). */
export function clientIpFromHeaders(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 64);
  }
  return headerList.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  return {
    ipHash: hashIp(clientIpFromHeaders(headerList)),
    userAgent: headerList.get("user-agent")?.slice(0, 200) ?? null,
  };
}
