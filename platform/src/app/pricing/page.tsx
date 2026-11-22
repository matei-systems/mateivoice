import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gift, Lock, Receipt, RotateCcw, ShieldCheck, Video } from "lucide-react";
import { isTestMode } from "@/config/env";
import { commission } from "@/config/platform";
import { formatBps, splitCommission } from "@/server/ledger/commission";
import { listCoinPackages, paymentMode } from "@/server/payments/service";
import { getSettings } from "@/server/settings/service";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";
import { formatCoins, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Preise & Münzen",
  description: "So funktionieren Münzen: transparente Pakete ohne Abo, Minutenpreise für private Chats, Trinkgelder und faire Aufteilung zwischen Creator und Plattform.",
};

export default async function PricingPage() {
  const [packages, settings] = await Promise.all([listCoinPackages(), getSettings()]);
  const mode = paymentMode();
  const bps = settings.commission.platformBps;
  const example = splitCommission(100, bps);
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 pt-12 pb-8 sm:px-6 lg:pt-16">
      <SectionHeading
        eyebrow="Preise"
        title={
          <>
            Klare Preise. <span className="text-gradient-brand">Kein Abo.</span>
          </>
        }
        description="Du kaufst Münzen als Einmalkauf und setzt sie für private Chats oder Trinkgelder ein. Der Minutenpreis steht immer vor dem Start fest."
      />
      {isTestMode() ? (
        <Alert tone="test" title="Testbetrieb">
          Käufe laufen derzeit über eine Sandbox ohne echtes Geld. Es werden Testmünzen ohne Geldwert gutgeschrieben.
        </Alert>
      ) : null}

      <section aria-labelledby="packages-heading" className="space-y-6">
        <h2 id="packages-heading" className="font-display text-2xl font-semibold">Münzpakete</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col gap-2">
                  <p className="text-sm font-medium text-ink-600">{pkg.name}</p>
                  <p className="flex items-center gap-2 text-3xl font-semibold text-ink-950 tabular-nums">
                    <Coins className="size-6 text-brand-700" aria-hidden="true" /> {formatCoins(pkg.coins)}
                  </p>
                  <p className="text-lg font-semibold text-brand-700">{formatEuroCents(pkg.priceCents)}</p>
                  <p className="mt-auto text-xs text-ink-500">{formatEuroCents(Math.round((pkg.priceCents * 100) / pkg.coins))} je 100 Münzen · inkl. USt.</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/account/wallet">{mode.available ? "Münzen kaufen" : "Zum Guthaben"}</ButtonLink>
          <p className="text-sm text-ink-600">Kauflimits zum Schutz: {formatEuroCents(settings.payments.dailyLimitCents)} pro Tag, {formatEuroCents(settings.payments.monthlyLimitCents)} in 30 Tagen.</p>
        </div>
      </section>

      <section aria-labelledby="use-heading" className="grid gap-6 md:grid-cols-3">
        <h2 id="use-heading" className="sr-only">Wofür Münzen eingesetzt werden</h2>
        {[
          {
            icon: Video,
            title: "Private 1:1-Chats",
            text: `Creator legen ihren Minutenpreis selbst fest (${settings.pricing.privateChatMin}–${settings.pricing.privateChatMax} Münzen/Min.). Jede begonnene Minute wird einmal berechnet – serverseitig, nie im Browser.`,
          },
          { icon: Gift, title: "Trinkgelder", text: `Freiwillig in Streams und privaten Chats (${settings.pricing.tipMin}–${formatCoins(settings.pricing.tipMax)} Münzen). Doppelte Klicks führen nicht zu doppelten Buchungen.` },
          { icon: Lock, title: "Öffentliche Streams", text: "Zuschauen ist für geprüft volljährige Mitglieder kostenlos. Für Chat und Streams ist eine Altersprüfung erforderlich." },
        ].map((item) => (
          <Card key={item.title}>
            <CardBody className="space-y-3">
              <item.icon className="size-6 text-brand-700" aria-hidden="true" />
              <h3 className="font-semibold text-ink-950">{item.title}</h3>
              <p className="text-sm leading-relaxed text-ink-600">{item.text}</p>
            </CardBody>
          </Card>
        ))}
      </section>

      <section aria-labelledby="split-heading" className="grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-10 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 id="split-heading" className="font-display text-2xl font-semibold">Faire Aufteilung</h2>
          <p className="leading-relaxed text-ink-700">
            Von verbrauchten Münzen erhält der Creator <strong className="text-ink-950">{formatBps(10_000 - bps)}</strong>, die Plattform <strong className="text-ink-950">{formatBps(bps)}</strong> (vorläufige Regel).
            Der Satz wird mit jeder Buchung gespeichert – spätere Änderungen wirken nie rückwirkend.
          </p>
          <p className="text-sm text-ink-500">{commission.basisDescription}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-6">
          <p className="text-sm text-ink-600">Beispiel: 100 Münzen</p>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full" aria-hidden="true">
            <div className="bg-brand-600" style={{ width: `${example.creatorShare}%` }} />
            <div className="bg-ink-300" style={{ width: `${example.platformShare}%` }} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-ink-600">Creator</dt>
              <dd className="text-xl font-semibold text-ink-950">{example.creatorShare} Münzen</dd>
            </div>
            <div>
              <dt className="text-ink-600">Plattform</dt>
              <dd className="text-xl font-semibold text-ink-950">{example.platformShare} Münzen</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="rules-heading" className="grid gap-6 md:grid-cols-3">
        <h2 id="rules-heading" className="sr-only">Regeln</h2>
        {[
          { icon: Receipt, title: "Transparente Abrechnung", text: "Jede Buchung erscheint im Kontoauszug mit eindeutiger Referenz. Gutschriften erfolgen erst nach Bestätigung durch den Zahlungsanbieter." },
          { icon: RotateCcw, title: "Erstattungen", text: "Bei technischen Fehlern oder Missbrauch prüfen wir Erstattungen. Für digitale Leistungen kann das Widerrufsrecht mit Beginn der Leistung erlöschen (Entwurf, rechtlich zu prüfen)." },
          { icon: ShieldCheck, title: "Sicher bezahlen", text: "Zahlungsdaten verarbeitet ausschließlich der Zahlungsanbieter. Die Plattform speichert keine Kartendaten." },
        ].map((item) => (
          <div key={item.title} className="space-y-2">
            <item.icon className="size-5 text-brand-700" aria-hidden="true" />
            <h3 className="font-semibold text-ink-950">{item.title}</h3>
            <p className="text-sm leading-relaxed text-ink-600">{item.text}</p>
          </div>
        ))}
      </section>
      <p className="text-sm text-ink-500">
        Fragen? Im{" "}
        <Link href="/help" className="text-brand-700 hover:underline">
          Hilfe-Center
        </Link>{" "}
        findest du Antworten zu Käufen, Erstattungen und Abrechnung.
      </p>
    </div>
  );
}
