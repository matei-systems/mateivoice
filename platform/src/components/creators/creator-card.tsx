import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Languages, Lock } from "lucide-react";
import { languageLabel, tagLabel } from "@/config/catalog";
import type { CreatorCardData } from "@/server/creators/service";
import { PlaceholderPortrait } from "@/components/ui/avatar";
import { PricePerMinute } from "@/components/ui/coins";
import { AvailabilityBadge, TestProfileBadge, VerificationBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";

/** Hochwertige Creator-Karte mit Bild/Platzhalter, Status, Angeboten und Preis. */
export function CreatorCard({ creator, priority, index = 0 }: { creator: CreatorCardData; priority?: boolean; index?: number }) {
  return (
    <article
      className="group relative flex animate-fade-up flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lift focus-within:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {creator.avatarMediaId ? (
          <Image
            src={`/media/${creator.avatarMediaId}`}
            alt={`Profilbild von ${creator.displayName}`}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 640px) 45vw, 92vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            priority={priority}
            unoptimized
          />
        ) : (
          <PlaceholderPortrait
            name={creator.displayName}
            className="size-full text-6xl transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/55 via-ink-950/0 to-ink-950/0" aria-hidden="true" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <AvailabilityBadge availability={creator.availability} overlay />
        </div>
        {creator.isTestProfile ? <TestProfileBadge className="absolute top-3 right-3 shadow-soft" /> : null}
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-white drop-shadow-sm">{creator.displayName}</h3>
          {creator.languages.length > 0 ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/85">
              <Languages className="size-3.5" aria-hidden="true" />
              {creator.languages.map(languageLabel).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-ink-700">{creator.tagline || "Noch keine Kurzbeschreibung."}</p>
        {creator.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Themen">
            {creator.tags.slice(0, 3).map((tag) => (
              <li key={tag} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {tagLabel(tag)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
          {creator.privateChatEnabled && creator.coinsPerMinute ? (
            <div className="flex flex-col">
              <span className="text-[0.7rem] uppercase tracking-wide text-ink-500">Privater Chat</span>
              <PricePerMinute coins={creator.coinsPerMinute} />
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <Lock className="size-3.5" aria-hidden="true" /> Kein privater Chat
            </span>
          )}
          <VerificationBadge verification={creator.verification} className={cn("hidden xl:inline-flex", creator.verification.isVerified && "inline-flex")} />
        </div>
      </div>
      <Link
        href={`/creators/${creator.slug}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        aria-label={`Profil von ${creator.displayName} ansehen`}
      >
        <span className="absolute right-4 bottom-[4.6rem] grid size-9 translate-y-2 place-items-center rounded-full bg-white/95 text-brand-700 opacity-0 shadow-soft transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </span>
      </Link>
    </article>
  );
}
