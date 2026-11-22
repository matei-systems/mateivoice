import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getEnv, isTestMode } from "@/config/env";
import { getDb } from "@/server/db/client";
import { ageVerifications, users } from "@/server/db/schema";
import { hasPermission, isStaffRole, type Actor } from "@/server/auth/permissions";
import { randomToken } from "@/server/crypto";
import { AppError, featureUnavailable, forbidden } from "@/server/errors";
import { getSettings, type Settings } from "@/server/settings/service";
import type { VerificationStatus } from "@/lib/verification";

/**
 * Altersprüfung für Zuschauerinnen und Zuschauer (Age Assurance).
 *
 * Für Deutschland verlangt der Jugendmedienschutz für pornografische Angebote
 * eine geschlossene Benutzergruppe mit Altersverifikation (Identifizierung +
 * Authentifizierung). Die Anforderung je Land ist in den Plattform-Einstellungen
 * konfigurierbar; Standard ist überall „verified“. Ein Anbieter ist noch NICHT
 * ausgewählt – der Mock-Anbieter erzeugt höchstens „test_passed“ (nur Testmodus).
 */

export interface AgeVerificationProvider {
  readonly name: string;
  readonly isReal: boolean;
  start(input: { userId: string }): Promise<{ providerReference: string; redirectUrl: string | null; method: string }>;
}

const mockProvider: AgeVerificationProvider = {
  name: "mock",
  isReal: false,
  async start() {
    return { providerReference: `mock_age_${randomToken(12)}`, redirectUrl: null, method: "mock" };
  },
};

export function getAgeVerificationProvider(): AgeVerificationProvider | null {
  return getEnv().IDENTITY_PROVIDER === "mock" ? mockProvider : null;
}

export type AgeAccess = {
  allowed: boolean;
  policy: "verified" | "self_declaration";
  status: VerificationStatus | null;
  provider: string | null;
  /** true, wenn nur ein simuliertes Ergebnis (Testmodus) vorliegt. */
  simulated: boolean;
};

export function policyForCountry(settings: Settings, country: string | null | undefined): "verified" | "self_declaration" {
  if (country && settings.ageAssurance.policy[country]) return settings.ageAssurance.policy[country]!;
  return settings.ageAssurance.defaultPolicy;
}

export async function getLatestAgeVerification(userId: string) {
  const [row] = await getDb()
    .select()
    .from(ageVerifications)
    .where(eq(ageVerifications.userId, userId))
    .orderBy(desc(ageVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

/** Reine Entscheidungslogik (testbar): darf die Person altersbeschränkte Funktionen nutzen? */
export function evaluateAgeAccess(input: {
  policy: "verified" | "self_declaration";
  status: VerificationStatus | null;
  provider: string | null;
  expiresAt: Date | null;
  testMode: boolean;
  now?: Date;
}): AgeAccess {
  const base = { policy: input.policy, status: input.status, provider: input.provider };
  if (input.policy === "self_declaration") return { ...base, allowed: true, simulated: false };
  const notExpired = !input.expiresAt || input.expiresAt.getTime() > (input.now ?? new Date()).getTime();
  if (input.status === "verified" && input.provider !== "mock" && notExpired) return { ...base, allowed: true, simulated: false };
  if (input.testMode && input.status === "test_passed" && input.provider === "mock") return { ...base, allowed: true, simulated: true };
  return { ...base, allowed: false, simulated: false };
}

export async function getAgeAccess(userId: string): Promise<AgeAccess> {
  const [settings, user, latest] = await Promise.all([
    getSettings(),
    getDb().select({ country: users.country, role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
    getLatestAgeVerification(userId),
  ]);
  return evaluateAgeAccess({
    policy: policyForCountry(settings, user[0]?.country),
    status: (latest?.status as VerificationStatus | undefined) ?? null,
    provider: latest?.provider ?? null,
    expiresAt: latest?.expiresAt ?? null,
    testMode: isTestMode(),
  });
}

/** Wirft einen verständlichen Fehler, wenn die Altersprüfung fehlt. Creator/Mitarbeiter sind ausgenommen (eigene Prüfung). */
export async function assertViewerAgeAccess(actor: Actor) {
  if (actor.role !== "customer") return;
  const access = await getAgeAccess(actor.id);
  if (!access.allowed) {
    throw new AppError(
      "forbidden",
      "Für diese Funktion ist eine Altersprüfung erforderlich. Du kannst sie in deinem Konto unter „Altersprüfung“ starten.",
      { details: { reason: "age_verification_required" } },
    );
  }
}

export async function startAgeVerification(actor: Actor) {
  if (!hasPermission(actor, "age_verification.manage")) {
    throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  const provider = getAgeVerificationProvider();
  if (!provider) throw featureUnavailable("Es ist noch kein Anbieter für die Altersprüfung angebunden.");
  const latest = await getLatestAgeVerification(actor.id);
  if (latest && ["pending", "test_passed", "verified"].includes(latest.status)) return latest;
  const started = await provider.start({ userId: actor.id });
  const [row] = await getDb()
    .insert(ageVerifications)
    .values({ userId: actor.id, provider: provider.name, providerReference: started.providerReference, method: started.method, status: "pending" })
    .returning();
  return row!;
}

/** Nur Testmodus: Ergebnis des Mock-Anbieters simulieren. Ergebnis bleibt „nicht verifiziert (Testmodus)“. */
export async function simulateAgeVerification(actor: Actor, outcome: "test_passed" | "rejected") {
  if (!isTestMode() || getEnv().IDENTITY_PROVIDER !== "mock") throw featureUnavailable("Simulation ist nur im Testmodus verfügbar.");
  if (isStaffRole(actor.role)) throw forbidden();
  const latest = await getLatestAgeVerification(actor.id);
  if (!latest || latest.provider !== "mock" || latest.status !== "pending") {
    throw new AppError("invalid_state", "Es gibt keine ausstehende Mock-Prüfung.");
  }
  await getDb()
    .update(ageVerifications)
    .set({ status: outcome })
    .where(and(eq(ageVerifications.id, latest.id), eq(ageVerifications.status, "pending")));
}
