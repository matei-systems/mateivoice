import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { searchCreators, searchParamsSchema } from "@/server/creators/service";
import { CreatorCard } from "@/components/creators/creator-card";
import { CreatorFilters, buildCreatorsHref } from "@/components/creators/creator-filters";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Creator entdecken",
  description: "Live-Streams und private Videochats: Creator nach Verfügbarkeit, Sprache, Thema und Preis finden.",
};

export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const params = searchParamsSchema.parse(flat);
  const result = await searchCreators(params);
  const isLive = params.availability === "live";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 pt-10 sm:px-6 lg:pt-14">
      <PageHeader
        eyebrow={isLive ? "Live" : "Entdecken"}
        title={isLive ? "Jetzt live" : "Creator entdecken"}
        description={
          isLive
            ? "Öffentliche Streams, die gerade laufen. Zum Zusehen ist ein Kundenkonto erforderlich."
            : "Filtere nach Verfügbarkeit, Sprache und Thema. Preise für private Chats sind pro Minute angegeben."
        }
      />
      <CreatorFilters params={params} total={result.total} />
      {result.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((creator, index) => (
              <CreatorCard key={creator.id} creator={creator} index={index} priority={index < 4} />
            ))}
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(page) => buildCreatorsHref(params, { page })} />
        </>
      ) : (
        <EmptyState
          icon={<SearchX className="size-6" aria-hidden="true" />}
          title="Keine passenden Creator gefunden"
          description={
            params.q
              ? `Für „${params.q}“ gibt es mit den gewählten Filtern keine Ergebnisse. Versuche einen anderen Begriff oder entferne Filter.`
              : "Mit den gewählten Filtern gibt es derzeit keine Ergebnisse."
          }
          action={
            <ButtonLink href="/creators" variant="secondary">
              Filter zurücksetzen
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
