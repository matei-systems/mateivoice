import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { creatorDeclarations } from "@/server/db/schema";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { forbidden, validationError } from "@/server/errors";

/**
 * Pflichterklärungen für Creator. Ohne vollständige, aktuelle Erklärungen wird
 * ein Profil nicht veröffentlicht. Texte sind ENTWÜRFE (rechtlich zu prüfen).
 */
export const DECLARATION_VERSION = "2026-11-v1";

export const DECLARATIONS = [
  {
    kind: "adult_and_identity",
    title: "Volljährigkeit und Identität",
    text: "Ich bin mindestens 18 Jahre alt und nutze das Konto ausschließlich selbst. Ich stimme einer Alters- und Identitätsprüfung durch einen spezialisierten Anbieter zu.",
  },
  {
    kind: "sole_performer",
    title: "Nur verifizierte Personen",
    text: "In meinen Streams, Bildern und Chats sind ausschließlich ich selbst zu sehen. Weitere Personen dürfen nur auftreten, wenn sie selbst über die Plattform verifiziert sind (derzeit nicht unterstützt).",
  },
  {
    kind: "content_rights",
    title: "Rechte an Inhalten",
    text: "Ich besitze alle Rechte an den Inhalten, die ich hochlade oder übertrage (inkl. Musik, Bilder, Marken), und verletze keine Rechte Dritter.",
  },
  {
    kind: "consent_and_no_coercion",
    title: "Freiwilligkeit",
    text: "Ich handle freiwillig, ohne Druck, Zwang oder Abhängigkeit von Dritten und kann jederzeit pausieren oder beenden.",
  },
  {
    kind: "no_recording_distribution",
    title: "Keine Aufzeichnung und Weitergabe",
    text: "Ich zeichne keine Kundinnen und Kunden auf und gebe keine Inhalte aus Sitzungen weiter. Mir ist bekannt, dass Aufnahmen durch Gegenüber technisch nicht vollständig verhindert werden können.",
  },
  {
    kind: "rules_acknowledged",
    title: "Regeln",
    text: "Ich habe die Community-Richtlinien und die Creator-Vereinbarung (Entwurf) gelesen und halte mich daran.",
  },
] as const;

export type DeclarationKind = (typeof DECLARATIONS)[number]["kind"];
export const DECLARATION_KINDS = DECLARATIONS.map((d) => d.kind) as DeclarationKind[];

export async function getAcceptedDeclarations(userId: string, executor: Executor = getDb()) {
  const rows = await executor
    .select({ declaration: creatorDeclarations.declaration, acceptedAt: creatorDeclarations.acceptedAt })
    .from(creatorDeclarations)
    .where(and(eq(creatorDeclarations.userId, userId), eq(creatorDeclarations.version, DECLARATION_VERSION)));
  return new Map(rows.map((r) => [r.declaration, r.acceptedAt]));
}

export async function declarationsComplete(userId: string, executor: Executor = getDb()) {
  const accepted = await getAcceptedDeclarations(userId, executor);
  return DECLARATION_KINDS.every((kind) => accepted.has(kind));
}

/** Speichert die Erklärungen (alle müssen gleichzeitig bestätigt werden). */
export async function acceptDeclarations(actor: Actor, kinds: string[], ipHash: string | null) {
  if (actor.role !== "creator" || !hasPermission(actor, "studio.profile.edit")) throw forbidden();
  const missing = DECLARATION_KINDS.filter((kind) => !kinds.includes(kind));
  if (missing.length > 0) throw validationError("Bitte bestätige alle Erklärungen.");
  await getDb()
    .insert(creatorDeclarations)
    .values(DECLARATION_KINDS.map((declaration) => ({ userId: actor.id, declaration, version: DECLARATION_VERSION, ipHash })))
    .onConflictDoNothing();
}

/** SQL-taugliche Liste für Abfragen (Anzahl Pflichterklärungen). */
export const REQUIRED_DECLARATION_COUNT = DECLARATION_KINDS.length;

export async function usersWithCompleteDeclarations(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const rows = await getDb()
    .select({ userId: creatorDeclarations.userId, declaration: creatorDeclarations.declaration })
    .from(creatorDeclarations)
    .where(and(inArray(creatorDeclarations.userId, userIds), eq(creatorDeclarations.version, DECLARATION_VERSION)));
  const byUser = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byUser.get(row.userId) ?? new Set<string>();
    set.add(row.declaration);
    byUser.set(row.userId, set);
  }
  return new Set([...byUser.entries()].filter(([, set]) => set.size >= REQUIRED_DECLARATION_COUNT).map(([id]) => id));
}
