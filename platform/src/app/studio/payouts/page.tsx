import type { Metadata } from "next";
import { Landmark, Lock } from "lucide-react";
import { requireRole } from "@/server/auth/current";
import { getPayoutOverview } from "@/server/payouts/service";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Auszahlungen" };

const steps = [
  "Auswahl eines Zahlungs-/Auszahlungsanbieters, der das Geschäftsmodell schriftlich freigibt",
  "Creator-Vertrag, steuerliche Klärung und Identitätsprüfung (KYC) beim Anbieter",
  "Umstellung von Testmünzen auf rechtlich geprüfte echte Münzen",
  "Auszahlungsrhythmus, Mindestbetrag und Verrechnung von Rückbuchungen festlegen",
];

export default async function StudioPayoutsPage() {
  const session = await requireRole(["creator"], "/studio/payouts");
  const overview = await getPayoutOverview(session.user.id);
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Auszahlungen" description="Vorbereitete Ansicht – Auszahlungen sind noch nicht möglich." />
      <Alert tone="warning" title="Auszahlungen nicht verfügbar">{overview.availability.reason}</Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Simulierte Einnahmen" />
          <CardBody className="space-y-4">
            <CoinAmount amount={overview.testEarnings} size="xl" />
            <button type="button" disabled className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-lg bg-ink-100 px-5 text-sm font-medium text-ink-500">
              <Lock className="size-4" aria-hidden="true" /> Auszahlung beantragen (nicht verfügbar)
            </button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Bis zur Freischaltung" />
          <CardBody>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-700">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Auszahlungsverlauf" />
        <CardBody>
          <EmptyState icon={<Landmark className="size-6" aria-hidden="true" />} title="Keine Auszahlungen" description="Sobald Auszahlungen möglich sind, erscheinen hier Status (ausstehend, abgeschlossen, fehlgeschlagen) und Belege." />
        </CardBody>
      </Card>
    </>
  );
}
