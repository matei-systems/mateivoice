import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { approvePayoutAction, processPayoutAction, rejectPayoutAction } from "@/actions/finance";
import { requireStaff } from "@/server/auth/current";
import { getPayoutForStaff } from "@/server/payouts/service";
import { getSettings } from "@/server/settings/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input } from "@/components/ui/form";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { payoutStatus } from "@/lib/labels";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Auszahlung" };

export default async function AdminPayoutDetailPage({ params }: PageProps<"/admin/payouts/[id]">) {
  const { id } = await params;
  const session = await requireStaff("admin.payouts.manage", `/admin/payouts/${id}`);
  const [row, settings] = await Promise.all([getPayoutForStaff(id), getSettings()]);
  if (!row) notFound();
  const { payout, username, profile } = row;
  const status = payoutStatus[payout.status] ?? { label: payout.status, tone: "neutral" as const };
  const sameReviewer = settings.payout.requireFourEyes && payout.reviewedById === session.user.id;
  return (
    <>
      <PageHeader eyebrow="Auszahlung" title={`${formatCoins(payout.amount)} Münzen an ${username}`} description={`Antrag vom ${formatDateTime(payout.createdAt)}`} />
      {payout.simulated ? <Alert tone="test" title="Sandbox">Diese Auszahlung ist simuliert. Es wird kein Geld überwiesen.</Alert> : null}
      <Card>
        <CardHeader title="Details" action={<Badge tone={status.tone}>{status.label}</Badge>} />
        <CardBody>
          <DescriptionList
            items={[
              { term: "Betrag", detail: `${formatCoins(payout.amount)} ${payout.currency === "TEST_COIN" ? "Testmünzen" : "Münzen"}` },
              { term: "Gegenwert (Snapshot)", detail: `${formatEuroCents(payout.fiatAmountCents ?? 0)} (${formatEuroCents(payout.centsPer100Coins ?? 0)} je 100 Münzen)` },
              { term: "Kontoinhaber/in", detail: profile?.accountHolder ?? "–" },
              { term: "Ziel (maskiert)", detail: payout.destinationMasked ?? "–" },
              { term: "Konto zuletzt geändert", detail: profile ? formatDateTime(profile.updatedAt) : "–" },
              { term: "Anbieter", detail: payout.provider },
              { term: "Anbieter-Referenz", detail: payout.providerReference ?? "–" },
              { term: "Geprüft am", detail: payout.reviewedAt ? formatDateTime(payout.reviewedAt) : "–" },
              { term: "Ausgeführt am", detail: payout.processedAt ? formatDateTime(payout.processedAt) : "–" },
              { term: "Ablehnungs-/Fehlergrund", detail: payout.rejectionReason ?? payout.failureReason ?? "–" },
            ]}
          />
        </CardBody>
      </Card>

      {payout.status === "requested" ? (
        <Card>
          <CardHeader title="Prüfung" description="Prüfe Identität, Risikosignale und Plausibilität. Die Freigabe wird protokolliert." />
          <CardBody className="flex flex-wrap gap-3">
            <ActionForm action={approvePayoutAction} submitLabel="Freigeben" className="flex flex-wrap items-end gap-3 space-y-0">
              <input type="hidden" name="payoutId" value={payout.id} />
              <Field id="approve-note" label="Notiz (optional)" className="min-w-64">
                <Input id="approve-note" name="note" maxLength={300} />
              </Field>
            </ActionForm>
            <ConfirmActionDialog trigger="Ablehnen" title="Auszahlung ablehnen" description="Die Reservierung wird freigegeben; der Creator erhält die Begründung." confirmLabel="Ablehnen" variant="danger" action={rejectPayoutAction} hiddenFields={{ payoutId: payout.id }} reasonLabel="Begründung" reasonRequired />
          </CardBody>
        </Card>
      ) : null}

      {payout.status === "approved" ? (
        <Card>
          <CardHeader title="Ausführung" description="Über den Auszahlungsanbieter. Im Testmodus wählst du das Ergebnis der Sandbox." />
          <CardBody className="space-y-4">
            {sameReviewer ? (
              <Alert tone="warning" title="Vier-Augen-Prinzip">Du hast diese Auszahlung freigegeben. Die Ausführung muss eine andere Person vornehmen.</Alert>
            ) : (
              <div className="flex flex-wrap gap-3">
                <ActionForm action={processPayoutAction} submitLabel={payout.simulated ? "Sandbox: erfolgreich ausführen" : "Ausführen"} className="space-y-0">
                  <input type="hidden" name="payoutId" value={payout.id} />
                  <input type="hidden" name="outcome" value="success" />
                  <input type="hidden" name="note" value="" />
                </ActionForm>
                <ConfirmActionDialog trigger="Fehlschlag erfassen" title="Ausführung fehlgeschlagen" description="Die Reservierung wird freigegeben." confirmLabel="Fehlschlag speichern" variant="danger" action={processPayoutAction} hiddenFields={{ payoutId: payout.id, outcome: "failure" }} reasonLabel="Fehlerbeschreibung" reasonRequired />
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
