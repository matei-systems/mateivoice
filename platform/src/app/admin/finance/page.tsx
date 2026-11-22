import type { Metadata } from "next";
import { Download, Scale } from "lucide-react";
import { requireStaff } from "@/server/auth/current";
import { getFinanceReport, monthPeriod } from "@/server/finance/reports";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList, PageHeader, StatCard } from "@/components/ui/misc";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Finanzbericht" };

export default async function AdminFinancePage({ searchParams }: PageProps<"/admin/finance">) {
  await requireStaff("admin.finance.reports", "/admin/finance");
  const params = await searchParams;
  const period = monthPeriod(typeof params.month === "string" ? params.month : undefined);
  const report = await getFinanceReport(period);
  const unit = report.simulated ? "Testmünzen" : "Münzen";
  const prev = monthPeriod(new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth() - 1, 1)).toISOString().slice(0, 7));
  const next = monthPeriod(new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth() + 1, 1)).toISOString().slice(0, 7));
  return (
    <>
      <PageHeader
        eyebrow="Finanzen"
        title={`Finanzbericht ${period.month}`}
        description="Auswertung aus dem unveränderlichen Buchungsjournal und den Bestellungen. Euro-Beträge stammen aus bestätigten Bestellungen (brutto)."
        actions={
          <>
            <a className={buttonClasses({ variant: "outline", size: "sm" })} href={`/admin/finance?month=${prev.month}`}>
              ← {prev.month}
            </a>
            <a className={buttonClasses({ variant: "outline", size: "sm" })} href={`/admin/finance?month=${next.month}`}>
              {next.month} →
            </a>
            <a className={buttonClasses({ variant: "secondary", size: "sm" })} href={`/admin/finance/export?month=${period.month}`}>
              <Download className="size-4" aria-hidden="true" /> CSV-Export
            </a>
          </>
        }
      />
      {report.simulated ? <Alert tone="test" title="Testmodus">Alle Werte betreffen Testmünzen und Sandbox-Bestellungen. Es wurde kein echtes Geld bewegt.</Alert> : null}
      <Alert tone={report.reconciliation.ok ? "success" : "danger"} title={report.reconciliation.ok ? "Abgleich erfolgreich" : "Abgleich mit Abweichungen"}>
        Kontosalden = Summe der Buchungen: {report.reconciliation.ok ? "ja" : `nein (${report.reconciliation.accountMismatches.length} Konten, ${report.reconciliation.unbalancedTransactions.length} Buchungen)`} · geprüft {formatDateTime(report.reconciliation.checkedAt)}
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="brand" label="Käufe (bestätigt)" value={formatEuroCents(report.purchases.confirmed.cents)} hint={`${report.purchases.confirmed.count} Bestellungen · ${formatCoins(report.purchases.confirmed.coins)} ${unit}`} />
        <StatCard label="Verbrauch gesamt" value={`${formatCoins(report.totals.gross)}`} hint={`${unit} (Sitzungen + Trinkgelder)`} />
        <StatCard label="Anteil Creator" value={formatCoins(report.totals.creatorShare)} hint={unit} />
        <StatCard label="Anteil Plattform" value={formatCoins(report.totals.platformShare)} hint={unit} icon={<Scale className="size-5" aria-hidden="true" />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Zahlungen" />
          <CardBody>
            <DescriptionList
              items={[
                { term: "Bestätigt", detail: `${report.purchases.confirmed.count} · ${formatEuroCents(report.purchases.confirmed.cents)}` },
                { term: "Ausstehend", detail: `${report.purchases.pending.count} · ${formatEuroCents(report.purchases.pending.cents)}` },
                { term: "Fehlgeschlagen", detail: `${report.purchases.failed.count}` },
                { term: "Erstattet", detail: `${report.purchases.refunded.count} · ${formatEuroCents(report.purchases.refunded.cents)}` },
                { term: "Rückbuchungen", detail: <span className={report.purchases.chargedBack.count ? "text-danger-700" : undefined}>{`${report.purchases.chargedBack.count} · ${formatEuroCents(report.purchases.chargedBack.cents)}`}</span> },
                { term: "Verlust aus Umkehrungen", detail: `${formatCoins(report.coins.platformLossFromReversals)} ${unit}` },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Verbrauch und Aufteilung" />
          <CardBody>
            <DescriptionList
              items={[
                { term: "Private Chats", detail: `${formatCoins(report.consumption.sessions.gross)} (Creator ${formatCoins(report.consumption.sessions.creator)} / Plattform ${formatCoins(report.consumption.sessions.platform)})` },
                { term: "Trinkgelder", detail: `${formatCoins(report.consumption.tips.gross)} (Creator ${formatCoins(report.consumption.tips.creator)} / Plattform ${formatCoins(report.consumption.tips.platform)})` },
                { term: "Testguthaben ausgegeben", detail: `${formatCoins(report.coins.testCredits)}` },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Auszahlungen im Zeitraum" />
          <CardBody>
            <DescriptionList
              items={[
                { term: "Beantragt (offen)", detail: `${report.payouts.requested.count} · ${formatCoins(report.payouts.requested.coins)}` },
                { term: "Freigegeben (offen)", detail: `${report.payouts.approved.count} · ${formatCoins(report.payouts.approved.coins)}` },
                { term: "Ausgeführt", detail: `${report.payouts.completed.count} · ${formatCoins(report.payouts.completed.coins)} (${formatEuroCents(report.payouts.completed.cents)})` },
                { term: "Abgelehnt / fehlgeschlagen", detail: `${report.payouts.rejected.count} / ${report.payouts.failed.count}` },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Bestände (aktuell)" description="Verbindlichkeiten gegenüber Kunden (unverbrauchte Münzen) und Creatorn." />
          <CardBody>
            <DescriptionList
              items={[
                { term: "Kundenguthaben", detail: `${formatCoins(report.liabilities.customerWallets)} ${unit}` },
                { term: "Creator-Guthaben", detail: `${formatCoins(report.liabilities.creatorEarnings)} ${unit}` },
                { term: "Auszahlungen in Bearbeitung", detail: `${formatCoins(report.liabilities.payoutsInFlight)} ${unit}` },
                { term: "Ausgezahlt (kumuliert)", detail: `${formatCoins(report.liabilities.paidOut)} ${unit}` },
                { term: "Plattformerlöse (kumuliert)", detail: `${formatCoins(report.liabilities.platformRevenue)} ${unit}` },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <p className="text-xs text-ink-500">
        Hinweis: Steuerliche Auswertungen (USt./OSS, DAC7-Meldungen) erfordern zusätzliche Stammdaten und steuerliche Beratung – siehe docs/LEGAL-DACH.md. <Badge tone="neutral">vorläufig</Badge>
      </p>
    </>
  );
}
