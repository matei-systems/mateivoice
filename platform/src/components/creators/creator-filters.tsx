import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";
import { LANGUAGES, SORT_OPTIONS, TAGS } from "@/config/catalog";
import type { CreatorSearchParams } from "@/server/creators/service";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export function buildCreatorsHref(params: Partial<CreatorSearchParams>, overrides: Partial<CreatorSearchParams> = {}) {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "" || value === null) continue;
    if (key === "availability" && value === "all") continue;
    if (key === "sort" && value === "recommended") continue;
    if (key === "page" && value === 1) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/creators?${query}` : "/creators";
}

const availabilityTabs = [
  { value: "all", label: "Alle" },
  { value: "live", label: "Live" },
  { value: "online", label: "Online" },
] as const;

/**
 * Suche & Filter als echtes GET-Formular: funktioniert ohne JavaScript,
 * ist teilbar (URL) und serverseitig ausgewertet.
 */
export function CreatorFilters({ params, total }: { params: CreatorSearchParams; total: number }) {
  const active = params.availability ?? "all";
  const hasFilters = !!(params.q || params.language || params.tag || params.maxPrice || (params.availability && params.availability !== "all") || (params.sort && params.sort !== "recommended"));
  return (
    <div className="space-y-4">
      <form action="/creators" method="get" role="search" className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
        {params.availability && params.availability !== "all" ? <input type="hidden" name="availability" value={params.availability} /> : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]">
          <label className="relative block">
            <span className="sr-only">Suche nach Name oder Beschreibung</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Name oder Thema suchen …" className="pl-10" maxLength={60} type="search" />
          </label>
          <label>
            <span className="sr-only">Sprache</span>
            <Select name="language" defaultValue={params.language ?? ""}>
              <option value="">Alle Sprachen</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Thema</span>
            <Select name="tag" defaultValue={params.tag ?? ""}>
              <option value="">Alle Themen</option>
              {TAGS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Sortierung</span>
            <Select name="sort" defaultValue={params.sort ?? "recommended"}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" className="w-full md:w-auto">
            Suchen
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-xs" role="tablist" aria-label="Verfügbarkeit">
          {availabilityTabs.map((tab) => (
            <Link
              key={tab.value}
              role="tab"
              aria-selected={active === tab.value}
              href={buildCreatorsHref(params, { availability: tab.value, page: undefined })}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                active === tab.value ? "bg-brand-600 text-white shadow-soft" : "text-ink-700 hover:bg-brand-50 hover:text-brand-700",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-600">
          <span aria-live="polite">
            {total === 1 ? "1 Creator" : `${total} Creator`} gefunden
          </span>
          {hasFilters ? (
            <Link href="/creators" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
              <RotateCcw className="size-3.5" aria-hidden="true" /> Filter zurücksetzen
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
