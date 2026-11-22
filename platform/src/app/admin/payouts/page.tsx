import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { requireStaff } from "@/server/auth/current";
import { listPayoutsForStaff, payoutAvailability } from "@/server/payouts/service";
import { getSettings } from "@/server/settings/service";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { payoutStatus } from "@/lib/labels";
import { cn, formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Auszahlungen" };

const FILTERS = [
  { value: "", label: "Alle" },
  { value: "requested", label: "Beantragt" },
  { value: "approved", label: "Freigegeben" },
  { value: "completed", label: "Ausgeführt" },
  { value: "rejected", label: "Abgelehnt" },
] as const;

export default async function AdminPayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  await requireStaff("admin.payouts.manage", "/admin/payouts");
  const params = await searchParams;
  const status = typeof params.status === "string" && FILTERS.some((f) => f.value === params.status) ? params.status : "";
  const [rows, settings] = await Promise.all([
    listPayoutsForStaff(status ? { status: status as "requested" } : {}),
    getSettings(),
  ]);
  const availability = payoutAvailability();
  const open = rows.filter((r) => r.payout.status === "requested" || r.payout.status === "approved");
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Auszahlungen" description="Anträge prüfen, freigeben und ausführen. Freigabe und Ausführung erfolgen nach dem Vier-Augen-Prinzip durch verschiedene Personen." />
      {availability.simulated ? (
        <Alert tone="test" title="Sandbox-Auszahlungen">Es wird kein Geld überwiesen. Testmünzen sind per Datenbankregel nur über den Sandbox-Anbieter „auszahlbar“.</Alert>
      ) : (
        <Alert tone="warning" title="Keine echten Auszahlungen">{availability.reason}</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tone={open.length ? "warning" : "default"} label="Offene Anträge (Ansicht)" value={open.length} icon={<Banknote className="size-5" aria-hidden="true" />} />
        <StatCard label="Mindestbetrag" value={`${formatCoins(settings.payout.minimumCoins)} Münzen`} hint={`Haltefrist ${settings.payout.holdDays} Tage`} />
        <StatCard label="Auszahlungswert" value={`${formatEuroCents(settings.payout.centsPer100Coins)} / 100 Münzen`} hint={settings.payout.requireFourEyes ? "Vier-Augen-Prinzip aktiv" : "Vier-Augen-Prinzip AUS"} />
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/payouts?status=${f.value}` : "/admin/payouts"}
            className={cn("rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset", status === f.value ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-700 ring-line hover:bg-brand-50")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardHeader title="Anträge" />
        {rows.length === 0 ? (
          <EmptyState icon={<Banknote className="size-6" aria-hidden="true" />} title="Keine Auszahlungen" description="Es liegen keine Anträge für diesen Filter vor." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Datum</TH>
                <TH>Creator</TH>
                <TH className="text-right">Betrag</TH>
                <TH>Ziel</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ payout, username }) => {
                const s = payoutStatus[payout.status] ?? { label: payout.status, tone: "neutral" as const };
                return (
                  <TR key={payout.id}>
                    <TD className="whitespace-nowrap text-ink-600">
                      <Link href={`/admin/payouts/${payout.id}`} className="font-medium text-brand-700 hover:underline">
                        {formatDateTime(payout.createdAt)}
                      </Link>
                    </TD>
                    <TD>{username}</TD>
                    <TD className="text-right tabular-nums">
                      {formatCoins(payout.amount)} <span className="text-xs text-ink-500">({formatEuroCents(payout.fiatAmountCents ?? 0)})</span>
                    </TD>
                    <TD className="text-ink-600">{payout.destinationMasked ?? "–"}</TD>
                    <TD>
                      <Badge tone={s.tone}>{s.label}</Badge> {payout.simulated ? <Badge tone="test">Sandbox</Badge> : null}
                    </TD>
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
