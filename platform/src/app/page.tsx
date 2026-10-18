import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  EyeOff,
  Flag,
  HeartHandshake,
  Lock,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { TAGS } from "@/config/catalog";
import { brand, commission, videoSessions } from "@/config/platform";
import { isTestMode } from "@/config/env";
import { countPublicCreators, searchCreators } from "@/server/creators/service";
import { formatBps } from "@/server/ledger/commission";
import { CreatorCard } from "@/components/creators/creator-card";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { SectionHeading } from "@/components/ui/misc";
import { PlaceholderPortrait } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";

export const metadata = {
  title: { absolute: `${brand.name} – Live-Streams & private Videochats für Erwachsene` },
  description: brand.description,
};

const steps = [
  {
    icon: UserRoundCheck,
    title: "Registrieren & bestätigen",
    text: "Konto in einer Minute anlegen, E-Mail bestätigen. Die Plattform ist ausschließlich für Erwachsene ab 18.",
  },
  {
    icon: Wallet,
    title: "Münzen nutzen",
    text: "Bezahlt wird mit Münzen – transparent pro Minute. Im aktuellen Testmodus gibt es nur kostenloses Testguthaben ohne Geldwert.",
  },
  {
    icon: Radio,
    title: "Live oder privat",
    text: "Öffentliche Streams ansehen oder einen privaten 1:1-Chat anfragen. Du siehst den Preis vorher und kannst jederzeit beenden.",
  },
];

const safety = [
  {
    icon: ShieldCheck,
    title: "Nur für Erwachsene",
    text: "Kundinnen und Kunden bestätigen ihre Volljährigkeit. Creator werden im Echtbetrieb erst nach einer Alters- und Identitätsprüfung durch einen spezialisierten Anbieter freigeschaltet (Anbieter in Auswahl).",
  },
  {
    icon: Flag,
    title: "Melden mit Priorität",
    text: "Jedes Profil und jede Sitzung kann gemeldet werden. Hinweise auf Minderjährige oder nicht einvernehmliche Inhalte werden sofort mit höchster Priorität geprüft.",
  },
  {
    icon: Lock,
    title: "Datensparsam & diskret",
    text: "Kein Klarname nötig, keine Ausweisdaten auf der Plattform, IP-Adressen nur pseudonymisiert. Private Chats werden standardmäßig nicht aufgezeichnet.",
  },
  {
    icon: Clock3,
    title: "Faire Abrechnung",
    text: `Preis pro Minute vorab sichtbar. Abgerechnet wird nur, solange ein privater Chat aktiv ist – jede begonnene Minute (${videoSessions.billingIntervalSeconds} s).`,
  },
  {
    icon: HeartHandshake,
    title: "Respekt als Regel",
    text: "Klare Community-Richtlinien, nachvollziehbare Moderationsentscheidungen und ein Einspruchsweg für alle.",
  },
  {
    icon: EyeOff,
    title: "Ehrlich über Grenzen",
    text: "Bildschirmaufnahmen durch Dritte lassen sich technisch nie vollständig verhindern. Wir sagen das offen – und gehen gegen Missbrauch vor.",
  },
];

const faqs = [
  {
    q: "Ist die Plattform schon in Betrieb?",
    a: "Nein. Dies ist ein Prototyp im Testmodus. Es gibt keine echten Zahlungen, keine echten Streams und keine echten Creator. Alle Profile sind fiktive Testdaten.",
  },
  {
    q: "Was kosten private Chats?",
    a: "Creator legen ihren Minutenpreis innerhalb fester Grenzen selbst fest. Der Preis wird vor der Anfrage angezeigt und für die Dauer des Chats fixiert.",
  },
  {
    q: "Wie werden Creator geprüft?",
    a: "Vor der Freischaltung durchlaufen Creator eine Alters- und Identitätsprüfung durch einen spezialisierten Anbieter. Der Anbieter wird derzeit ausgewählt – bis dahin ist kein Profil als „verifiziert“ gekennzeichnet.",
  },
  {
    q: "Werden meine Chats aufgezeichnet?",
    a: "Private Videochats werden standardmäßig nicht gespeichert. Technisch kann niemand vollständig verhindern, dass ein Gegenüber den eigenen Bildschirm aufnimmt – deshalb gelten klare Regeln und Sanktionen.",
  },
  {
    q: "Ich bin Creator – was verdiene ich?",
    a: `Die Plattformprovision beträgt vorläufig ${formatBps(commission.defaultPlatformBps)} der verbrauchten Münzen; der Rest ist dein Anteil. Die endgültigen Bedingungen werden vertraglich und steuerlich geprüft.`,
  },
];

export default async function HomePage() {
  const [counts, live, featured] = await Promise.all([
    countPublicCreators(),
    searchCreators({ availability: "live", page: 1 }),
    searchCreators({ sort: "recommended", page: 1 }),
  ]);
  const heroCreators = (live.items.length ? live.items : featured.items).slice(0, 3);
  const testMode = isTestMode();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-aurora">
        <div className="pointer-events-none absolute -top-24 right-[-10%] size-[34rem] rounded-full bg-brand-200/50 blur-3xl animate-float" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-20 lg:pb-28">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-xs backdrop-blur">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Live-Webcam-Plattform aus Österreich · 18+
            </p>
            <h1 className="mt-6 font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-ink-950 sm:text-6xl lg:text-[4.2rem]">
              Echte Begegnungen.
              <br />
              <span className="text-gradient-brand italic">Live, privat</span> und mit Respekt.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700">
              Öffentliche Live-Streams und private 1:1-Videochats mit erwachsenen Creatorn. Klare Minutenpreise, faire
              Regeln und Sicherheit von Anfang an.
            </p>
            <form action="/creators" method="get" role="search" className="mt-8 flex max-w-xl flex-col gap-3 rounded-2xl border border-line bg-surface/90 p-2 shadow-card backdrop-blur sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Creator suchen</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <Input name="q" type="search" placeholder="Name oder Thema, z. B. Musik" className="h-12 border-transparent pl-10 shadow-none hover:border-transparent" maxLength={60} />
              </label>
              <button type="submit" className="h-12 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700">
                Entdecken
              </button>
            </form>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg" icon={<Sparkles className="size-4" aria-hidden="true" />}>
                Kostenlos registrieren
              </ButtonLink>
              <ButtonLink href="/for-creators" size="lg" variant="outline">
                Als Creator starten
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
              <li className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-brand-600" aria-hidden="true" /> Creator-Prüfung vor Freischaltung
              </li>
              <li className="flex items-center gap-2">
                <Clock3 className="size-4 text-brand-600" aria-hidden="true" /> Preis pro Minute vorab sichtbar
              </li>
              <li className="flex items-center gap-2">
                <Lock className="size-4 text-brand-600" aria-hidden="true" /> Kein Klarname nötig
              </li>
            </ul>
          </div>

          {/* Visuelle Collage aus (fiktiven) Profilen */}
          <div className="relative mx-auto hidden h-[30rem] w-full max-w-md sm:block" aria-hidden="true">
            {heroCreators.map((creator, index) => {
              const position = [
                "left-0 top-6 rotate-[-6deg] z-10",
                "right-0 top-0 rotate-[5deg] z-20",
                "left-[calc(50%-6.5rem)] bottom-0 rotate-[-1deg] z-30",
              ][index];
              return (
                <div key={creator.id} className={`absolute w-52 ${position}`}>
                  <div
                    className="animate-fade-up rounded-3xl border border-white/70 bg-surface p-2 shadow-lift"
                    style={{ animationDelay: `${150 + index * 120}ms` }}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                      <PlaceholderPortrait name={creator.displayName} className="size-full text-5xl" />
                      {creator.availability === "live" ? (
                        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase">
                          <span className="size-1.5 animate-live-pulse rounded-full bg-white" /> Live
                        </span>
                      ) : null}
                    </div>
                    <div className="px-1.5 pt-2.5 pb-1">
                      <p className="font-display text-lg font-semibold">{creator.displayName}</p>
                      <p className="truncate text-xs text-ink-600">{creator.tagline}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="absolute -bottom-2 -left-6 z-40 animate-fade-up rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur" style={{ animationDelay: "520ms" }}>
              <p className="text-xs text-ink-600">Jetzt live</p>
              <p className="text-xl font-semibold tabular-nums text-ink-950">{counts.live}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Kennzahlen */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl grid-cols-3 divide-x divide-line px-4 py-6 text-center sm:px-6">
          {[
            { value: counts.live, label: "live" },
            { value: counts.online, label: "online" },
            { value: counts.total, label: "Creator-Profile" },
          ].map((stat) => (
            <div key={stat.label} className="px-2">
              <p className="font-display text-3xl font-semibold tabular-nums text-ink-950">{stat.value}</p>
              <p className="text-sm text-ink-600">
                {stat.label}
                {testMode ? <span className="ml-1 text-xs text-test-700">(Testdaten)</span> : null}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Jetzt live */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Gerade live" title="Jetzt live dabei sein" description="Öffentliche Streams laufender Creator – anmelden und zusehen." />
          <ButtonLink href="/creators?availability=live" variant="ghost" icon={<Radio className="size-4" aria-hidden="true" />}>
            Alle Live-Streams <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
        <div className="mt-8">
          {live.items.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {live.items.slice(0, 4).map((creator, index) => (
                <CreatorCard key={creator.id} creator={creator} index={index} priority={index < 2} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Radio className="size-6" aria-hidden="true" />}
              title="Gerade ist niemand live"
              description="Schau später wieder vorbei oder entdecke Creator, die für private Chats online sind."
              action={<ButtonLink href="/creators?availability=online">Online-Creator ansehen</ButtonLink>}
            />
          )}
        </div>
      </section>

      {/* Entdecken */}
      <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
        <SectionHeading eyebrow="Entdecken" title="Finde Creator, die zu dir passen" description="Nach Themen, Sprachen und Verfügbarkeit filtern – die Suche ist jederzeit erweiterbar." />
        <ul className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {TAGS.map((tag) => (
            <li key={tag.code} className="shrink-0">
              <Link
                href={`/creators?tag=${tag.code}`}
                className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition hover:-translate-y-px hover:border-brand-300 hover:text-brand-700"
              >
                {tag.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.items.slice(0, 8).map((creator, index) => (
            <CreatorCard key={creator.id} creator={creator} index={index} />
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/creators" variant="outline" size="lg">
            Alle Creator ansehen <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
      </section>

      {/* So funktioniert's */}
      <section id="so-funktionierts" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-28 sm:px-6">
        <SectionHeading align="center" eyebrow="So funktioniert's" title="In drei Schritten live dabei" description="Einfach, transparent und ohne versteckte Kosten." />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-3xl border border-line bg-surface p-7 shadow-card">
              <span className="absolute top-6 right-7 font-display text-5xl font-semibold text-brand-100" aria-hidden="true">
                {index + 1}
              </span>
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <step.icon className="size-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Sicherheit */}
      <section className="mt-28 bg-gradient-to-b from-brand-50/70 to-canvas py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading eyebrow="Sicherheit & Vertrauen" title="Sicherheit ist kein Zusatz – sie ist die Grundlage" description="Wir bauen die Plattform von Anfang an mit Schutzmechanismen für Creator und Kundschaft." />
              <ButtonLink href="/safety" variant="secondary" className="mt-6">
                Mehr zu Sicherheit & Jugendschutz
              </ButtonLink>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {safety.map((item) => (
                <li key={item.title} className="rounded-2xl border border-line bg-surface p-6 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                  <item.icon className="size-6 text-brand-600" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Creator-CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-ink-950 px-6 py-14 text-white sm:px-12 lg:py-16">
          <div className="pointer-events-none absolute -top-24 -right-20 size-96 rounded-full bg-brand-500/40 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 left-10 size-80 rounded-full bg-brand-300/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-brand-300 uppercase">Für Creator</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Deine Preise. Deine Regeln. Transparente Abrechnung.</h2>
              <p className="mt-4 max-w-xl leading-relaxed text-white/75">
                Lege deinen Minutenpreis selbst fest und sieh jede Abrechnung im Detail. Vorläufige Plattformprovision:{" "}
                <strong className="text-white">{formatBps(commission.defaultPlatformBps)}</strong> – endgültige Bedingungen werden vertraglich geprüft.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <ButtonLink href="/register?role=creator" size="lg" variant="inverse">
                Creator-Konto erstellen
              </ButtonLink>
              <ButtonLink href="/for-creators" size="lg" variant="ghostInverse">
                Mehr erfahren
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pt-24 sm:px-6">
        <SectionHeading align="center" eyebrow="Fragen & Antworten" title="Gut zu wissen" />
        <div className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {faqs.map((faq) => (
            <details key={faq.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-950">
                {faq.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-transform duration-300 group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
