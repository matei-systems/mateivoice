import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { requireSession } from "@/server/auth/current";
import { listPublicCreatorsByIds } from "@/server/creators/service";
import { listFavoriteProfileIds } from "@/server/social/service";
import { CreatorCard } from "@/components/creators/creator-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Favoriten" };

export default async function FavoritesPage() {
  const session = await requireSession("/account/favorites");
  if (session.user.role !== "customer") redirect("/account/settings");
  const ids = await listFavoriteProfileIds(session.user.id);
  const creators = await listPublicCreatorsByIds(ids);
  return (
    <>
      <PageHeader eyebrow="Entdecken" title="Favoriten" description="Creator, die du dir gemerkt hast. Nicht mehr verfügbare Profile werden ausgeblendet." />
      {creators.length === 0 ? (
        <Card>
          <EmptyState icon={<Heart className="size-6" aria-hidden="true" />} title="Noch keine Favoriten" description="Tippe auf einem Profil auf „Merken“, um es hier wiederzufinden." action={<ButtonLink href="/creators">Creator entdecken</ButtonLink>} />
        </Card>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {creators.map((creator) => (
            <li key={creator.id}>
              <CreatorCard creator={creator} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
