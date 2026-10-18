import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { commission } from "@/config/platform";
import { requireRole, toActor } from "@/server/auth/current";
import { canViewCreatorEarnings } from "@/server/auth/permissions";
import { formatBps } from "@/server/ledger/commission";
import { getBalance, getCreatorEarningsStatement } from "@/server/ledger/service";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { transactionKindLabel } from "@/lib/labels";
import { formatCoins, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Einnahmen" };

export default async function StudioEarningsPage() {
  const session = await requireRole(["creator"], "/studio/earnings");
  const actor = toActor(session)!;
  // Defense in depth: nur eigene Einnahmen.
  if (!canViewCreatorEarnings(actor, actor.id)) return null;
  const [balance, rows] = await Promise.all([getBalance(actor.id, "creator_earnings"), getCreatorEarningsStatement(actor.id, 200)]);
  const totals = rows.reduce(
    (acc, row) => ({ gross: acc.gross + row.gross, share: acc.share + row.creatorShare }),
    { gross: 0, share: 0 },
  );

  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Einnahmen" description="Jede Buchung mit Brutto-Münzverbrauch, Provisionssatz und deinem Anteil." />
      <Alert tone="test" title="Simulierte Einnahmen">Alle Beträge sind Testmünzen ohne Geldwert. Sie können nicht ausgezahlt werden.</Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tone="brand" label="Aktueller Saldo" value={<CoinAmount amount={balance} size="lg" />} icon={<Coins className="size-5" aria-hidden="true" />} />
        <StatCard label="Brutto (angezeigte Buchungen)" value={formatCoins(totals.gross)} hint="Von Kunden verbrauchte Münzen" />
        <StatCard label="Dein Anteil (angezeigte Buchungen)" value={formatCoins(totals.share)} hint={`Vorläufig ${formatBps(commission.defaultPlatformBps)} Provision`} />
      </div>
      <Card>
        <CardHeader title="Buchungen" description={commission.roundingDescription} />
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Datum</TH>
                <TH>Vorgang</TH>
                <TH className="text-right">Brutto</TH>
                <TH className="text-right">Provision</TH>
                <TH className="text-right">Dein Anteil</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.entryId}>
                  <TD className="whitespace-nowrap text-ink-600">{formatDateTime(row.createdAt)}</TD>
                  <TD>
                    <span className="font-medium">{transactionKindLabel[row.kind] ?? row.kind}</span> {row.simulated ? <Badge tone="test">simuliert</Badge> : null}
                    <p className="text-xs text-ink-600">{row.description}</p>
                  </TD>
                  <TD className="text-right tabular-nums">{formatCoins(row.gross)}</TD>
                  <TD className="text-right text-ink-600 tabular-nums">
                    {formatCoins(row.gross - row.creatorShare)}
                    {row.commissionBps != null ? <span className="block text-xs">({formatBps(row.commissionBps)})</span> : null}
                  </TD>
                  <TD className="text-right font-semibold tabular-nums">{formatCoins(row.creatorShare)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardBody>
            <EmptyState title="Noch keine Einnahmen" description="Einnahmen entstehen, sobald Kunden private Chats mit dir führen." />
          </CardBody>
        )}
      </Card>
    </>
  );
}
