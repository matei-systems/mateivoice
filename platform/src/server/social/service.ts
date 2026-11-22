import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/server/db/client";
import { creatorProfiles, favorites, userBlocks, users } from "@/server/db/schema";
import { hasPermission, isStaffRole, type Actor } from "@/server/auth/permissions";
import { AppError, featureUnavailable, forbidden, notFound } from "@/server/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { getSettings } from "@/server/settings/service";

/**
 * Blockieren und Favoriten.
 *
 * Blockieren wirkt in BEIDE Richtungen: Zwischen zwei Konten mit Blockierung
 * sind keine privaten Anfragen, Chat-Nachrichten und Trinkgelder möglich.
 * Wer wen blockiert hat, wird der blockierten Person nicht angezeigt.
 */

export async function isBlockedBetween(executor: Executor, a: string, b: string): Promise<boolean> {
  const [row] = await executor
    .select({ blocker: userBlocks.blockerUserId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerUserId, a), eq(userBlocks.blockedUserId, b)),
        and(eq(userBlocks.blockerUserId, b), eq(userBlocks.blockedUserId, a)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function blockUser(actor: Actor, targetUserId: string) {
  if (!hasPermission(actor, "blocks.manage")) throw forbidden();
  if (!z.uuid().safeParse(targetUserId).success || targetUserId === actor.id) throw notFound("Konto nicht gefunden.");
  await enforceRateLimit(`blocks:${actor.id}`, RATE_LIMITS.blocksPerUser);
  const [target] = await getDb().select({ role: users.role, status: users.status }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target || target.status === "deleted") throw notFound("Konto nicht gefunden.");
  // Mitarbeiter können nicht blockiert werden (Moderation muss möglich bleiben).
  if (isStaffRole(target.role)) throw new AppError("invalid_state", "Dieses Konto kann nicht blockiert werden.");
  await getDb().insert(userBlocks).values({ blockerUserId: actor.id, blockedUserId: targetUserId }).onConflictDoNothing();
}

export async function unblockUser(actor: Actor, targetUserId: string) {
  if (!hasPermission(actor, "blocks.manage")) throw forbidden();
  if (!z.uuid().safeParse(targetUserId).success) return;
  await getDb().delete(userBlocks).where(and(eq(userBlocks.blockerUserId, actor.id), eq(userBlocks.blockedUserId, targetUserId)));
}

/** Eigene Blockierliste (nur Nutzernamen – keine weiteren Daten). */
export async function listBlockedUsers(userId: string) {
  return getDb()
    .select({ userId: userBlocks.blockedUserId, username: users.username, createdAt: userBlocks.createdAt })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedUserId))
    .where(eq(userBlocks.blockerUserId, userId))
    .orderBy(desc(userBlocks.createdAt));
}

// ── Favoriten ───────────────────────────────────────────────────────────────

async function assertFavoritesEnabled(actor: Actor) {
  if (!hasPermission(actor, "favorites.manage")) throw forbidden();
  if (!(await getSettings()).featureFlags.favorites) throw featureUnavailable("Favoriten sind derzeit deaktiviert.");
}

export async function addFavorite(actor: Actor, creatorProfileId: string) {
  await assertFavoritesEnabled(actor);
  if (!z.uuid().safeParse(creatorProfileId).success) throw notFound("Profil nicht gefunden.");
  await enforceRateLimit(`favorites:${actor.id}`, RATE_LIMITS.favoritesPerUser);
  const [profile] = await getDb()
    .select({ id: creatorProfiles.id, reviewStatus: creatorProfiles.reviewStatus })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);
  if (!profile || profile.reviewStatus !== "approved") throw notFound("Profil nicht gefunden.");
  await getDb().insert(favorites).values({ userId: actor.id, creatorProfileId }).onConflictDoNothing();
}

export async function removeFavorite(actor: Actor, creatorProfileId: string) {
  await assertFavoritesEnabled(actor);
  if (!z.uuid().safeParse(creatorProfileId).success) return;
  await getDb().delete(favorites).where(and(eq(favorites.userId, actor.id), eq(favorites.creatorProfileId, creatorProfileId)));
}

export async function isFavorite(userId: string, creatorProfileId: string) {
  const [row] = await getDb()
    .select({ id: favorites.creatorProfileId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.creatorProfileId, creatorProfileId)))
    .limit(1);
  return !!row;
}

/** Favoriten mit Profil-IDs (die öffentliche Sichtbarkeit prüft die Creator-Suche). */
export async function listFavoriteProfileIds(userId: string) {
  const rows = await getDb()
    .select({ id: favorites.creatorProfileId })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt))
    .limit(200);
  return rows.map((row) => row.id);
}

export async function favoriteCount(creatorProfileId: string) {
  const [row] = await getDb().select({ count: sql<number>`count(*)::int` }).from(favorites).where(eq(favorites.creatorProfileId, creatorProfileId));
  return row?.count ?? 0;
}
