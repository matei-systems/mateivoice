import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { creatorProfiles, creatorVerifications } from "@/server/db/schema";
import {
  getCreatorProfileBySlug,
  reviewProfile,
  searchCreators,
  submitProfileForReview,
  updateOwnPricing,
  updateOwnProfile,
} from "@/server/creators/service";
import { getMediaForViewer, moderateMedia, uploadCreatorImage } from "@/server/media/service";
import { simulateMockVerification, startVerification } from "@/server/verification/service";
import { actorOf, createCreator, createUser } from "../support/db-helpers";

async function pngFile(width = 64, height = 64, name = "bild.png") {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 240, g: 120, b: 160 } } })
    .png()
    .withMetadata({ exif: { IFD0: { Copyright: "Geheim" } } })
    .toBuffer();
  return new File([new Uint8Array(buffer)], name, { type: "image/png" });
}

describe("Creator-Suche", () => {
  it("zeigt nur freigegebene Profile aktiver Konten; Suche, Filter und Sortierung", async () => {
    await createCreator({ displayName: "Aria Testprofil", availability: "live", coinsPerMinute: 80 });
    await createCreator({ displayName: "Bella Testprofil", availability: "online", coinsPerMinute: 30 });
    await createCreator({ displayName: "Cleo Entwurf", reviewStatus: "draft" });
    const suspended = await createCreator({ displayName: "Dora Gesperrt" });
    await getDb().update(creatorProfiles).set({ reviewStatus: "suspended" }).where(eq(creatorProfiles.id, suspended.profile.id));

    const all = await searchCreators({});
    expect(all.items.map((i) => i.displayName).sort()).toEqual(["Aria Testprofil", "Bella Testprofil"]);
    expect(all.items[0]?.displayName).toBe("Aria Testprofil"); // live zuerst

    expect((await searchCreators({ q: "bella" })).items).toHaveLength(1);
    expect((await searchCreators({ availability: "live" })).items.map((i) => i.displayName)).toEqual(["Aria Testprofil"]);
    expect((await searchCreators({ maxPrice: 50 })).items.map((i) => i.displayName)).toEqual(["Bella Testprofil"]);
    expect((await searchCreators({ sort: "price_asc" })).items[0]?.displayName).toBe("Bella Testprofil");
    expect((await searchCreators({ q: "%" })).items).toHaveLength(0); // Platzhalter werden maskiert
  });

  it("Testmodus-Verifizierung wird niemals als verifiziert dargestellt", async () => {
    await createCreator({ displayName: "Testmodus Creator", verification: "test_passed" });
    const [item] = (await searchCreators({})).items;
    expect(item?.verification.isVerified).toBe(false);
    expect(item?.verification.label).toContain("Testmodus");
  });

  it("die Datenbank verhindert „verified“ durch den Mock-Anbieter", async () => {
    const { user } = await createCreator({ verification: "none" });
    await expect(
      getDb().insert(creatorVerifications).values({ userId: user.id, provider: "mock", providerReference: "x", status: "verified", verifiedAt: new Date() }),
    ).rejects.toThrow();
  });

  it("Mock-Verifizierung führt höchstens zu test_passed", async () => {
    const { user } = await createCreator({ verification: "none" });
    const started = await startVerification(user.id);
    expect(started.status).toBe("pending");
    await simulateMockVerification(user.id, "test_passed");
    const [row] = await getDb().select().from(creatorVerifications).where(eq(creatorVerifications.userId, user.id));
    expect(row?.status).toBe("test_passed");
    const customer = await createUser();
    await expect(startVerification(customer.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("nicht freigegebene Profile sind nur für Eigentümer und Admins sichtbar", async () => {
    const { user, profile } = await createCreator({ reviewStatus: "draft" });
    const stranger = await createUser();
    const admin = await createUser({ role: "admin" });
    expect(await getCreatorProfileBySlug(profile.slug, null)).toBeNull();
    expect(await getCreatorProfileBySlug(profile.slug, actorOf(stranger))).toBeNull();
    expect((await getCreatorProfileBySlug(profile.slug, actorOf(user)))?.isOwner).toBe(true);
    expect(await getCreatorProfileBySlug(profile.slug, actorOf(admin))).not.toBeNull();
  });
});

describe("Profilbearbeitung", () => {
  const validProfile = {
    displayName: "Neuer Name",
    tagline: "Kurz und freundlich",
    bio: "Eine ausführliche Beschreibung des Testprofils für die Entwicklung.",
    contactRules: "Bitte respektvoll bleiben.",
    languages: ["de", "en"],
    tags: ["music"],
    allowSearchIndexing: false,
  };

  it("Änderungen an freigegebenen Profilen gehen erneut in Prüfung", async () => {
    const { user } = await createCreator();
    const result = await updateOwnProfile(actorOf(user), validProfile);
    expect(result.needsReview).toBe(true);
    expect(result.profile.reviewStatus).toBe("pending_review");
    expect(result.profile.availability).toBe("offline");
  });

  it("Creator können nur das eigene Profil ändern; Kunden gar nicht", async () => {
    const customer = await createUser();
    await expect(updateOwnProfile(actorOf(customer), validProfile)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateOwnPricing(actorOf(customer), { coinsPerMinute: 50, enabled: true })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lehnt unbekannte Tags/Sprachen ab", async () => {
    const { user } = await createCreator();
    await expect(updateOwnProfile(actorOf(user), { ...validProfile, tags: ["<script>"] })).rejects.toMatchObject({ code: "validation" });
  });

  it("Preise nur innerhalb der Grenzen", async () => {
    const { user } = await createCreator();
    await expect(updateOwnPricing(actorOf(user), { coinsPerMinute: 5, enabled: true })).rejects.toMatchObject({ code: "validation" });
    await expect(updateOwnPricing(actorOf(user), { coinsPerMinute: 301, enabled: true })).rejects.toMatchObject({ code: "validation" });
    await expect(updateOwnPricing(actorOf(user), { coinsPerMinute: 12.5, enabled: true })).rejects.toMatchObject({ code: "validation" });
    await updateOwnPricing(actorOf(user), { coinsPerMinute: 60, enabled: true });
  });

  it("Einreichen und Freigabe mit Audit", async () => {
    const { user, profile } = await createCreator({ reviewStatus: "draft" });
    await updateOwnProfile(actorOf(user), validProfile);
    await submitProfileForReview(actorOf(user));
    const admin = await createUser({ role: "admin" });
    await expect(
      reviewProfile({ adminUserId: admin.id, profileId: profile.id, decision: "request_changes", note: "" }),
    ).rejects.toMatchObject({ code: "validation" });
    await reviewProfile({ adminUserId: admin.id, profileId: profile.id, decision: "approve", note: "" });
    const [row] = await getDb().select().from(creatorProfiles).where(eq(creatorProfiles.id, profile.id));
    expect(row?.reviewStatus).toBe("approved");
  });
});

describe("Uploads", () => {
  it("speichert Bilder neu kodiert ohne Metadaten und erst nach Freigabe öffentlich", async () => {
    const { user } = await createCreator();
    const asset = await uploadCreatorImage(actorOf(user), await pngFile(), "avatar");
    expect(asset.mimeType).toBe("image/webp");
    expect(asset.moderationStatus).toBe("pending");

    expect(await getMediaForViewer(null, asset.id)).toBeNull();
    const own = await getMediaForViewer(actorOf(user), asset.id);
    expect(own).not.toBeNull();
    const metadata = await sharp(own!.data).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();

    const admin = await createUser({ role: "admin" });
    await moderateMedia({ adminUserId: admin.id, mediaId: asset.id, decision: "approved" });
    expect(await getMediaForViewer(null, asset.id)).not.toBeNull();
  });

  it("lehnt falsche Dateitypen trotz passender Endung ab", async () => {
    const { user } = await createCreator();
    const fake = new File([new TextEncoder().encode("<svg onload=alert(1)>")], "bild.png", { type: "image/png" });
    await expect(uploadCreatorImage(actorOf(user), fake, "gallery")).rejects.toMatchObject({ code: "validation" });
    const html = new File([new TextEncoder().encode("<html><script>alert(1)</script></html>")], "x.jpg", { type: "image/jpeg" });
    await expect(uploadCreatorImage(actorOf(user), html, "gallery")).rejects.toMatchObject({ code: "validation" });
  });

  it("lehnt zu große Dateien ab", async () => {
    const { user } = await createCreator();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "gross.png", { type: "image/png" });
    await expect(uploadCreatorImage(actorOf(user), big, "gallery")).rejects.toMatchObject({ code: "validation" });
  });

  it("Kunden können keine Bilder hochladen", async () => {
    const customer = await createUser();
    await expect(uploadCreatorImage(actorOf(customer), await pngFile(), "gallery")).rejects.toMatchObject({ code: "forbidden" });
  });
});
