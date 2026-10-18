import type { Metadata } from "next";
import { BadgeCheck, Calculator, Coins, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { commission, pricing } from "@/config/platform";
import { formatBps, splitCommission } from "@/server/ledger/commission";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Für Creator",
  description: "Eigene Preise, transparente Abrechnung und Sicherheit – so funktioniert die Plattform für Creator.",
};

export default function ForCreatorsPage() {
  const example = splitCommission(pricing.privateChat.defaultCoinsPerMinute * 10, commission.defaultPlatformBps);
  const features = [
    { icon: SlidersHorizontal, title: "Eigene Preise", text: `Zwischen ${pricing.privateChat.minCoinsPerMinute} und ${pricing.privateChat.maxCoinsPerMinute} Münzen pro Minute – du entscheidest.` },
    { icon: Calculator, title: "Transparente Abrechnung", text: "Jede Minute, jeder Anteil und die Provision sind im Studio einzeln nachvollziehbar." },
    { icon: BadgeCheck, title: "Prüfung schützt alle", text: "Alters- und Identitätsprüfung über einen spezialisierten Anbieter – Ausweisdaten liegen nicht bei uns." },
    { icon: ShieldCheck, title: "Du hast die Kontrolle", text: "Anfragen annehmen oder ablehnen, jederzeit beenden und Verstöße melden." },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 lg:pt-14">
      <PageHeader eyebrow="Für Creator" title="Deine Bühne. Deine Regeln." description="Ein professionelles Umfeld mit klaren Bedingungen – von Anfang an." />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature.title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <feature.icon className="size-6 text-brand-600" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{feature.text}</p>
          </li>
        ))}
      </ul>
      <section className="mt-10 rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-surface p-6 sm:p-8">
        <div className="flex items-center gap-2 text-brand-700">
          <Coins className="size-5" aria-hidden="true" />
          <h2 className="font-semibold">Rechenbeispiel (vorläufig)</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">
          10 Minuten privater Chat zu {pricing.privateChat.defaultCoinsPerMinute} Münzen = <strong>{example.gross} Münzen</strong>. Davon Plattformprovision{" "}
          {formatBps(commission.defaultPlatformBps)} = <strong>{example.platformShare}</strong>, dein Anteil = <strong>{example.creatorShare} Münzen</strong>.
        </p>
        <Alert tone="warning" className="mt-4">
          Die Provision ist eine vorläufige Geschäftsentscheidung. Umrechnung von Münzen in Euro, Bemessungsgrundlage, Umsatzsteuer und Auszahlung werden
          vertraglich und steuerlich geprüft. Aktuell gibt es keine echten Einnahmen oder Auszahlungen.
        </Alert>
      </section>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/register?role=creator" icon={<Sparkles className="size-4" aria-hidden="true" />}>
          Creator-Konto erstellen
        </ButtonLink>
        <ButtonLink href="/legal/creator-agreement" variant="outline">
          Creator-Vereinbarung (Entwurf)
        </ButtonLink>
      </div>
    </div>
  );
}
