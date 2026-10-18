import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { creatorProfiles, users } from "@/server/db/schema";

// Zur Laufzeit erzeugen (Umgebung/DB erst beim Start bekannt, nicht beim Build).
export const dynamic = "force-dynamic";

/** Nur öffentliche Seiten und Profile mit ausdrücklicher Indexierungs-Zustimmung. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = getEnv();
  const base = env.APP_URL;
  const staticPages = ["/", "/creators", "/how-it-works", "/safety", "/for-creators", "/support", "/legal/imprint", "/legal/terms", "/legal/privacy"].map((path) => ({
    url: new URL(path, base).toString(),
    changeFrequency: "weekly" as const,
  }));
  if (env.APP_ENV !== "production") return staticPages;
  const profiles = await getDb()
    .select({ slug: creatorProfiles.slug, updatedAt: creatorProfiles.updatedAt })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(
        eq(creatorProfiles.reviewStatus, "approved"),
        eq(creatorProfiles.allowSearchIndexing, true),
        eq(creatorProfiles.isTestProfile, false),
        eq(users.status, "active"),
      ),
    );
  return [
    ...staticPages,
    ...profiles.map((profile) => ({ url: new URL(`/creators/${profile.slug}`, base).toString(), lastModified: profile.updatedAt })),
  ];
}
