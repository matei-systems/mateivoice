import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getEnv, isTestMode } from "@/config/env";
import { getDb } from "@/server/db/client";
import { creatorVerifications, users } from "@/server/db/schema";
import { randomToken } from "@/server/crypto";
import { AppError, featureUnavailable } from "@/server/errors";
import { creatorCanOperate, type VerificationStatus } from "@/lib/verification";

/**
 * Austauschbare Schnittstelle für Alters- und Identitätsprüfung.
 *
 * Es ist noch KEIN Anbieter ausgewählt oder freigegeben. Der Mock-Anbieter
 * dient nur der Entwicklung und kann per DB-Constraint niemals den Status
 * „verified“ erzeugen. Ausweisdaten werden nicht auf der Plattform gespeichert.
 */
export interface IdentityVerificationProvider {
  readonly name: string;
  readonly isReal: boolean;
  /** Startet eine Prüfung beim Anbieter. redirectUrl führt zum Anbieterformular. */
  start(input: { userId: string }): Promise<{ providerReference: string; redirectUrl: string | null }>;
}

const mockProvider: IdentityVerificationProvider = {
  name: "mock",
  isReal: false,
  async start() {
    return { providerReference: `mock_${randomToken(12)}`, redirectUrl: null };
  },
};

export function getIdentityProvider(): IdentityVerificationProvider | null {
  return getEnv().IDENTITY_PROVIDER === "mock" ? mockProvider : null;
}

export async function getLatestVerification(userId: string) {
  const [row] = await getDb()
    .select()
    .from(creatorVerifications)
    .where(eq(creatorVerifications.userId, userId))
    .orderBy(desc(creatorVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

export async function canCreatorOperate(userId: string): Promise<boolean> {
  const latest = await getLatestVerification(userId);
  return creatorCanOperate(latest?.status as VerificationStatus | undefined, latest?.provider, isTestMode());
}

export async function startVerification(userId: string) {
  const provider = getIdentityProvider();
  if (!provider) {
    throw featureUnavailable("Es ist noch kein Anbieter für die Alters- und Identitätsprüfung angebunden.");
  }
  const [user] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role !== "creator") throw new AppError("forbidden", "Nur Creator durchlaufen die Identitätsprüfung.");
  const latest = await getLatestVerification(userId);
  if (latest && ["pending", "test_passed", "verified"].includes(latest.status)) return latest;
  const started = await provider.start({ userId });
  const [row] = await getDb()
    .insert(creatorVerifications)
    .values({ userId, provider: provider.name, providerReference: started.providerReference, status: "pending" })
    .returning();
  return row!;
}

/**
 * Nur Entwicklung: Ergebnis des Mock-Anbieters simulieren. "test_passed" wird
 * überall als „Nicht verifiziert (Testmodus)“ angezeigt.
 */
export async function simulateMockVerification(userId: string, outcome: "test_passed" | "rejected") {
  if (!isTestMode() || getEnv().IDENTITY_PROVIDER !== "mock") {
    throw featureUnavailable("Simulation ist nur im Testmodus mit Mock-Anbieter möglich.");
  }
  const latest = await getLatestVerification(userId);
  if (!latest || latest.provider !== "mock" || latest.status !== "pending") {
    throw new AppError("invalid_state", "Es gibt keine ausstehende Mock-Prüfung.");
  }
  await getDb()
    .update(creatorVerifications)
    .set({ status: outcome, failureReason: outcome === "rejected" ? "Simulierte Ablehnung (Testmodus)" : null })
    .where(and(eq(creatorVerifications.id, latest.id), eq(creatorVerifications.status, "pending")));
}
