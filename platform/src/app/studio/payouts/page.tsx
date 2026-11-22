import type { Metadata } from "next";
import { Landmark, Wallet } from "lucide-react";
import { cancelPayoutAction, requestPayoutAction, savePayoutProfileAction } from "@/actions/finance";
import { requireRole } from "@/server/auth/current";
import { getPayoutOverview } from "@/server/payouts/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input } from "@/components/ui/form";
import { DescriptionList, PageHeader, StatCard } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { payoutStatus } from "@/lib/labels";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Auszahlungen" };

export default async function StudioPayoutsPage() {
  const session = await requireRole(["creator"], "/studio/payouts");
  const { availability, summary, history, profile } = await getPayoutOverview(session.user.id);
  const test = summary.currency === "TEST_COIN";
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Auszahlungen" description="Hinterlege dein Auszahlungskonto und beantrage Auszahlungen deines verfügbaren Guthabens." />
      {availability.available ? (
        availability.simulated ? (
          <Alert tone="test" title="Sandbox-Auszahlungen">Im Testmodus werden Auszahlungen nur simuliert – es wird kein Geld überwiesen. Testmünzen haben keinen Geldwert.</Alert>
        ) : null
      ) : (
        <Alert tone="warning" title="Auszahlungen derzeit nicht möglich">{availability.reason}</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tone="brand" label="Verfügbar" value={<CoinAmount amount={summary.available} size="lg" test={test} />} hint={`≈ ${formatEuroCents(summary.availableCents)}${test ? " (simuliert)" : ""}`} icon={<Wallet className="size-5" aria-hidden="true" />} />
        <StatCard label="In Haltefrist" value={formatCoins(summary.pending)} hint={`Einnahmen der letzten ${summary.holdDays} Tage (Schutz vor Rückbuchungen)`} />
        <StatCard label="Kontostand gesamt" value={formatCoins(summary.balance)} hint={`Mindestbetrag ${formatCoins(summary.minimumCoins)} Münzen · ${formatEuroCents(summary.centsPer100Coins)} je 100 Münzen (vorläufig)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Auszahlungskonto" description="SEPA-Konto. Die IBAN wird verschlüsselt gespeichert und nur maskiert angezeigt." />
          <CardBody className="space-y-4">
            {profile ? (
              <DescriptionList
                items={[
                  { term: "Kontoinhaber/in", detail: profile.accountHolder },
                  { term: "IBAN", detail: profile.ibanMasked },
                  { term: "Zuletzt geändert", detail: formatDateTime(profile.updatedAt) },
                ]}
              />
            ) : (
              <p className="text-sm text-ink-600">Noch kein Konto hinterlegt.</p>
            )}
            <ActionForm action={savePayoutProfileAction} submitLabel={profile ? "Konto ändern" : "Konto speichern"} submitVariant={profile ? "outline" : "primary"} resetOnSuccess>
              <Field id="payout-holder" label="Kontoinhaber/in" hint="Muss deinem verifizierten Namen entsprechen.">
                <Input id="payout-holder" name="accountHolder" required minLength={2} maxLength={70} autoComplete="name" />
              </Field>
              <Field id="payout-iban" label="IBAN" hint="Nur SEPA-Raum. Änderungen lösen eine Sicherheitsbenachrichtigung und eine zusätzliche Prüfung aus.">
                <Input id="payout-iban" name="iban" required minLength={15} maxLength={42} autoComplete="off" spellCheck={false} />
              </Field>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Auszahlung beantragen" description="Der Betrag wird bis zur Entscheidung reserviert. Freigabe und Ausführung erfolgen durch das Finanzteam (Vier-Augen-Prinzip)." />
          <CardBody className="space-y-4">
            {summary.openPayout ? (
              <Alert tone="info" title="Offener Antrag" action={summary.openPayout.status === "requested" ? <ConfirmActionDialog trigger="Zurückziehen" title="Antrag zurückziehen" confirmLabel="Zurückziehen" action={cancelPayoutAction} hiddenFields={{ payoutId: summary.openPayout.id }} /> : undefined}>
                {formatCoins(summary.openPayout.amount)} Münzen · {payoutStatus[summary.openPayout.status]?.label ?? summary.openPayout.status}
              </Alert>
            ) : !profile ? (
              <p className="text-sm text-ink-600">Bitte hinterlege zuerst ein Auszahlungskonto.</p>
            ) : summary.available < summary.minimumCoins ? (
              <p className="text-sm text-ink-600">Dein verfügbares Guthaben liegt unter dem Mindestbetrag von {formatCoins(summary.minimumCoins)} Münzen.</p>
            ) : (
              <ActionForm action={requestPayoutAction} submitLabel="Auszahlung beantragen" disabledSubmit={!availability.available}>
                <Field id="payout-amount" label="Betrag (Münzen)" hint={`Zwischen ${formatCoins(summary.minimumCoins)} und ${formatCoins(summary.available)} Münzen.`}>
                  <Input id="payout-amount" name="amount" type="number" min={summary.minimumCoins} max={summary.available} defaultValue={summary.available} required />
                </Field>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Verlauf" />
        {history.length === 0 ? (
          <EmptyState icon={<Landmark className="size-6" aria-hidden="true" />} title="Noch keine Auszahlungen" description="Beantragte Auszahlungen erscheinen hier mit Status und Referenz." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Datum</TH>
                <TH className="text-right">Betrag</TH>
                <TH>Status</TH>
                <TH>Referenz / Grund</TH>
              </tr>
            </THead>
            <TBody>
              {history.map((payout) => {
                const s = payoutStatus[payout.status] ?? { label: payout.status, tone: "neutral" as const };
                return (
                  <TR key={payout.id}>
                    <TD className="whitespace-nowrap text-ink-600">{formatDateTime(payout.createdAt)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatCoins(payout.amount)} <span className="text-xs text-ink-500">({formatEuroCents(payout.fiatAmountCents ?? 0)})</span>
                    </TD>
                    <TD>
                      <Badge tone={s.tone}>{s.label}</Badge> {payout.simulated ? <Badge tone="test">Sandbox</Badge> : null}
                    </TD>
                    <TD className="text-sm text-ink-600">{payout.providerReference ?? payout.rejectionReason ?? payout.failureReason ?? "–"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
