import type { Metadata } from "next";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { getEnv, isTestMode } from "@/config/env";
import { simulateVerificationAction, startVerificationAction } from "@/actions/studio";
import { requireRole } from "@/server/auth/current";
import { getLatestVerification } from "@/server/verification/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { VerificationBadge } from "@/components/ui/status";
import { verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Verifizierung" };

export default async function StudioVerificationPage() {
  const session = await requireRole(["creator"], "/studio/verification");
  const latest = await getLatestVerification(session.user.id);
  const display = verificationDisplay(latest?.status as VerificationStatus | undefined, latest?.provider);
  const mock = getEnv().IDENTITY_PROVIDER === "mock";
  const canStart = !latest || ["rejected", "expired", "not_started"].includes(latest.status);

  return (
    <>
      <PageHeader eyebrow="Sicherheit" title="Alters- & Identitätsprüfung" description="Voraussetzung für Live-Streams und private Chats." />
      <Alert tone="warning" title="Noch kein Prüfanbieter angebunden">
        Die Prüfung soll über einen spezialisierten Anbieter erfolgen; Ausweisdaten werden nicht auf der Plattform gespeichert. Ein Anbieter ist noch nicht
        ausgewählt oder freigegeben. Bis dahin kann niemand den Status „verifiziert“ erhalten.
      </Alert>
      <Card>
        <CardHeader title="Aktueller Status" action={<VerificationBadge verification={display} />} />
        <CardBody className="space-y-5">
          <p className="text-sm text-ink-700">{display.description}</p>
          {latest ? (
            <DescriptionList
              items={[
                { term: "Anbieter", detail: latest.provider === "mock" ? "Mock (nur Entwicklung)" : latest.provider },
                { term: "Gestartet", detail: formatDateTime(latest.createdAt) },
                { term: "Zuletzt aktualisiert", detail: formatDateTime(latest.updatedAt) },
              ]}
            />
          ) : null}
          {canStart ? (
            <ActionForm action={startVerificationAction} submitLabel="Prüfung starten" submitIcon={<ShieldCheck className="size-4" aria-hidden="true" />} />
          ) : null}
        </CardBody>
      </Card>
      {mock && isTestMode() && latest?.status === "pending" && latest.provider === "mock" ? (
        <Card className="border-test-200">
          <CardHeader title="Entwicklung: Ergebnis simulieren" description="Nur im Testmodus. „Bestanden (Test)“ schaltet simulierte Funktionen frei, gilt aber NICHT als verifiziert." />
          <CardBody className="flex flex-wrap gap-3">
            <ActionForm action={simulateVerificationAction} submitLabel="Bestanden (Test)" submitVariant="secondary" submitIcon={<FlaskConical className="size-4" aria-hidden="true" />}>
              <input type="hidden" name="outcome" value="test_passed" />
            </ActionForm>
            <ActionForm action={simulateVerificationAction} submitLabel="Abgelehnt (Test)" submitVariant="outline">
              <input type="hidden" name="outcome" value="rejected" />
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
