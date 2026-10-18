import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { uploads } from "@/config/platform";
import { getDb } from "@/server/db/client";
import { creatorProfiles, mediaAssets } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { AppError, forbidden, notFound, validationError } from "@/server/errors";
import { notify } from "@/server/notifications/service";
import { RATE_LIMITS, enforceRateLimit } from "@/server/rate-limit";
import { getStorage, mediaKey } from "./storage";
import { sniffImageType } from "./validation";

/**
 * Bild-Uploads für Creator-Profile.
 *
 *  1. Größenlimit (5 MB) und Typprüfung über Magic Bytes.
 *  2. Dekodierung mit Pixel-Limit (Schutz vor Dekompressionsbomben).
 *  3. Neu-Kodierung als WebP: entfernt EXIF/GPS-Metadaten und eingebettete Inhalte.
 *  4. Speicherung außerhalb von /public; Status „pending“ bis zur Moderation.
 */
export async function uploadCreatorImage(actor: Actor, file: File, kind: "avatar" | "gallery") {
  if (!hasPermission(actor, "studio.profile.edit")) throw forbidden();
  await enforceRateLimit(`upload:${actor.id}`, RATE_LIMITS.uploadsPerUser);
  if (!(file instanceof File) || file.size === 0) throw validationError("Bitte wähle eine Bilddatei aus.");
  if (file.size > uploads.maxBytes) throw validationError("Die Datei ist zu groß (maximal 5 MB).");

  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(input);
  if (!type) throw validationError("Erlaubt sind nur JPEG-, PNG- oder WebP-Bilder.");

  const db = getDb();
  if (kind === "gallery") {
    const [existing] = await db
      .select({ value: count() })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.ownerUserId, actor.id), eq(mediaAssets.kind, "gallery"), isNull(mediaAssets.deletedAt)));
    if ((existing?.value ?? 0) >= uploads.maxGalleryImages) {
      throw validationError(`Es sind höchstens ${uploads.maxGalleryImages} Galeriebilder möglich.`);
    }
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(input, { limitInputPixels: uploads.maxInputPixels, failOn: "error" })
      .rotate()
      .resize({ width: uploads.outputMaxDimension, height: uploads.outputMaxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw validationError("Das Bild konnte nicht verarbeitet werden. Bitte verwende eine andere Datei.");
  }

  const id = randomUUID();
  const key = mediaKey(id);
  await getStorage().put(key, output.data);
  try {
    return await db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(mediaAssets)
        .values({
          id,
          ownerUserId: actor.id,
          kind,
          storageKey: key,
          mimeType: "image/webp",
          byteSize: output.data.length,
          width: output.info.width,
          height: output.info.height,
          sha256: createHash("sha256").update(output.data).digest("hex"),
          visibility: "public",
          moderationStatus: "pending",
        })
        .returning();
      if (kind === "avatar") {
        await tx.update(creatorProfiles).set({ avatarMediaId: id }).where(eq(creatorProfiles.userId, actor.id));
      }
      return asset!;
    });
  } catch (error) {
    await getStorage().delete(key);
    throw error;
  }
}

export async function deleteOwnMedia(actor: Actor, mediaId: string) {
  if (!hasPermission(actor, "studio.profile.edit")) throw forbidden();
  const db = getDb();
  await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
    if (!asset || asset.ownerUserId !== actor.id || asset.deletedAt) throw notFound("Bild nicht gefunden.");
    await tx.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, mediaId));
    await tx
      .update(creatorProfiles)
      .set({ avatarMediaId: null })
      .where(and(eq(creatorProfiles.userId, actor.id), eq(creatorProfiles.avatarMediaId, mediaId)));
  });
  const [asset] = await db.select({ key: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.id, mediaId));
  if (asset) await getStorage().delete(asset.key);
}

/**
 * Liefert eine Datei nur aus, wenn sie öffentlich & freigegeben ist oder der
 * Betrachter Eigentümer bzw. Admin ist.
 */
export async function getMediaForViewer(viewer: Actor | null, mediaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return null;
  const [asset] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
  if (!asset || asset.deletedAt) return null;
  const isPublic = asset.visibility === "public" && asset.moderationStatus === "approved";
  const isOwner = viewer?.id === asset.ownerUserId;
  const isAdmin = hasPermission(viewer, "admin.creators.review");
  if (!isPublic && !isOwner && !isAdmin) return null;
  const data = await getStorage().get(asset.storageKey);
  if (!data) return null;
  return { data, mimeType: asset.mimeType, isPublic };
}

export async function moderateMedia(input: {
  adminUserId: string;
  mediaId: string;
  decision: "approved" | "rejected";
  note?: string;
  ipHash?: string | null;
}) {
  if (input.decision === "rejected" && (input.note?.trim().length ?? 0) < 10) {
    throw validationError("Bitte begründe die Ablehnung (mind. 10 Zeichen).");
  }
  await getDb().transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, input.mediaId)).for("update");
    if (!asset || asset.deletedAt) throw notFound("Bild nicht gefunden.");
    if (asset.moderationStatus === input.decision) throw new AppError("conflict", "Das Bild hat diesen Status bereits.");
    await tx
      .update(mediaAssets)
      .set({ moderationStatus: input.decision, moderationNote: input.note?.trim() || null })
      .where(eq(mediaAssets.id, asset.id));
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: `media.${input.decision === "approved" ? "approve" : "reject"}`,
      targetType: "media",
      targetId: asset.id,
      reason: input.note?.trim() || undefined,
      ipHash: input.ipHash,
    });
    if (input.decision === "rejected") {
      await notify(tx, {
        userId: asset.ownerUserId,
        type: "media.rejected",
        title: "Bild abgelehnt",
        body: `Ein hochgeladenes Bild wurde nicht freigegeben. Begründung: ${input.note?.trim()}`,
        linkPath: "/studio/profile",
      });
    }
  });
}
