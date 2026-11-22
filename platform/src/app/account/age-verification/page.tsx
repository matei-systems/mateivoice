import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { isTestMode } from "@/config/env";
import { simulateAgeVerificationAction, startAgeVerificationAction } from "@/actions/social";
import { requireSession } from "@/server/auth/current";
import { getAgeAccess, getAgeVerificationProvider, getLatestAgeVerification } from "@/server/age/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Altersprüfung" };

export default async function AgeVerificationPage() {
  const session = await requireSession("/account/age-verification");
  if (session.user.role !== "customer") redirect("/account/settings");
  const [access, latest] = await Promise.all([getAgeAccess(session.user.id), getLatestAgeVerification(session.user.id)]);
  const provider = getAgeVerificationProvider();
  const display = verificationDisplay((latest?.status as VerificationStatus | undefined) ?? null, latest?.provider);
  return (
    <>
      <PageHeader
        eyebrow="Jugendschutz"
        title="Altersprüfung"
        description="Live-Streams, private Chats, der Chat und Käufe sind nur für geprüft volljährige Personen zugänglich. Die Prüfung übernimmt ein spezialisierter Anbieter – wir speichern nur das Ergebnis, keine Ausweisdaten."
      />
      <Card>
        <CardHeader title="Status" action={access.allowed ? <Badge tone={access.simulated ? "test" : "success"}>{access.simulated ? "Zugang (Testmodus)" : "Zugang freigeschaltet"}</Badge> : <Badge tone="warning">Prüfung erforderlich</Badge>} />
        <CardBody className="space-y-4">
          <DescriptionList
            items={[
              { term: "Anforderung für dein Land", detail: access.policy === "verified" ? "Altersprüfung über einen Anbieter" : "Selbstauskunft" },
              { term: "Ergebnis", detail: latest ? display.label : "Noch keine Prüfung" },
              { term: "Gestartet", detail: latest ? formatDateTime(latest.createdAt) : "–" },
            ]}
          />
          {access.allowed ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success-700">
              <CheckCircle2 className="size-5" aria-hidden="true" /> Du kannst alle altersbeschränkten Funktionen nutzen.
            </p>
          ) : null}
          {access.simulated ? <Alert tone="test">Simuliertes Ergebnis im Testmodus – es hat KEINE echte Altersprüfung stattgefunden.</Alert> : null}
        </CardBody>
      </Card>
      {!access.allowed ? (
        <Card>
          <CardHeader title="Prüfung durchführen" />
          <CardBody className="space-y-4">
            {!provider ? (
              <Alert tone="warning" title="Noch kein Prüfanbieter angebunden">Die Auswahl eines Anbieters für Altersverifikation (z. B. KJM-positiv bewertete Verfahren für Deutschland) steht aus. Bis dahin sind altersbeschränkte Funktionen nicht verfügbar.</Alert>
            ) : !latest || latest.status === "rejected" || latest.status === "expired" ? (
              <ActionForm action={startAgeVerificationAction} submitLabel="Altersprüfung starten" submitIcon={<ShieldCheck className="size-4" aria-hidden="true" />} />
            ) : latest.status === "pending" && isTestMode() && latest.provider === "mock" ? (
              <div className="space-y-3">
                <Alert tone="test" title="Mock-Anbieter (Testmodus)">Wähle das simulierte Ergebnis. In Produktion leitet der Anbieter durch seine eigene Prüfung.</Alert>
                <div className="flex flex-wrap gap-3">
                  <ActionForm action={simulateAgeVerificationAction} submitLabel="Bestanden simulieren" className="space-y-0">
                    <input type="hidden" name="outcome" value="test_passed" />
                  </ActionForm>
                  <ActionForm action={simulateAgeVerificationAction} submitLabel="Abgelehnt simulieren" submitVariant="outline" className="space-y-0">
                    <input type="hidden" name="outcome" value="rejected" />
                  </ActionForm>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-600">Deine Prüfung läuft. Du wirst benachrichtigt, sobald ein Ergebnis vorliegt.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
