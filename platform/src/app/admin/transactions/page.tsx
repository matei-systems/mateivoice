import type { Metadata } from "next";
import { reverseTransactionAction } from "@/actions/admin";
import { refundOrderAction, simulateChargebackAction } from "@/actions/finance";
import { requireStaff, toActor } from "@/server/auth/current";
import { hasPermission } from "@/server/auth/permissions";
import { listLedgerTransactions } from "@/server/admin/service";
import { formatBps } from "@/server/ledger/commission";
import { listRecentOrders, paymentMode } from "@/server/payments/service";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { orderStatus, transactionKindLabel } from "@/lib/labels";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellungen & Journal" };

export default async function AdminTransactionsPage() {
  const session = await requireStaff("admin.ledger.view", "/admin/transactions");
  const actor = toActor(session);
  const canAdjust = hasPermission(actor, "admin.ledger.adjust");
  const canSimulate = hasPermission(actor, "admin.payments.simulate");
  const [transactions, orders] = await Promise.all([listLedgerTransactions(150), listRecentOrders(50)]);
  const mode = paymentMode();
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Bestellungen & Buchungsjournal" description="Gutschriften entstehen ausschließlich durch signaturgeprüfte Anbieter-Ereignisse. Korrekturen nur über begründete Gegenbuchungen." />
      <Alert tone={mode.simulated ? "test" : "warning"} title={mode.provider ? `Zahlungsanbieter: ${mode.provider.label}` : "Kein Zahlungsanbieter"}>
        {mode.available ? (mode.simulated ? "Sandbox – es werden nur Testmünzen ohne Geldwert gutgeschrieben." : "Echtzahlungen aktiv.") : mode.reason}
      </Alert>

      <Card>
        <CardHeader title="Bestellungen" description="Erstattungen werden beim Zahlungsanbieter ausgelöst; die Umbuchung erfolgt mit dessen Bestätigung (Webhook)." />
        <Table>
          <THead>
            <tr>
              <TH>Datum</TH>
              <TH>Kunde</TH>
              <TH>Paket</TH>
              <TH>Status</TH>
              <TH className="text-right">Aktion</TH>
            </tr>
          </THead>
          <TBody>
            {orders.map((order) => {
              const status = orderStatus[order.status]!;
              return (
                <TR key={order.id}>
                  <TD className="whitespace-nowrap text-ink-600">{formatDateTime(order.createdAt)}</TD>
                  <TD>{order.username}</TD>
                  <TD>
                    {order.packageName} · {formatCoins(order.coins)} <span className="text-xs text-ink-500">({formatEuroCents(order.priceCents)})</span>
                    <p className="font-mono text-[0.7rem] text-ink-500">{order.providerReference ?? order.id}</p>
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {order.simulated ? <Badge tone="test">Sandbox</Badge> : null}
                    </span>
                    {order.failureReason ? <p className="mt-1 text-xs text-ink-500">{order.failureReason}</p> : null}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {order.status === "confirmed" && canAdjust ? (
                        <ConfirmActionDialog trigger="Erstatten" title="Kauf erstatten" description="Die Erstattung wird beim Zahlungsanbieter ausgelöst. Bereits verbrauchte Münzen trägt die Plattform." confirmLabel="Erstattung auslösen" action={refundOrderAction} hiddenFields={{ orderId: order.id }} reasonLabel="Begründung" reasonRequired />
                      ) : null}
                      {order.status === "confirmed" && order.simulated && canSimulate ? (
                        <ConfirmActionDialog trigger="Chargeback simulieren" title="Rückbuchung simulieren (Sandbox)" description="Sendet ein signiertes Chargeback-Ereignis an die Webhook-Route." confirmLabel="Simulieren" variant="danger" action={simulateChargebackAction} hiddenFields={{ orderId: order.id }} />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {orders.length === 0 ? <p className="px-6 py-6 text-center text-sm text-ink-600">Noch keine Bestellungen.</p> : null}
      </Card>

      <Card>
        <CardHeader title="Buchungsjournal" description="Neueste 150 Buchungen (unveränderlich, doppelte Buchführung)." />
        <Table>
          <THead>
            <tr>
              <TH>Datum</TH>
              <TH>Vorgang</TH>
              <TH>Auslöser</TH>
              <TH className="text-right">Betrag</TH>
              <TH className="text-right">Aktion</TH>
            </tr>
          </THead>
          <TBody>
            {transactions.map((tx) => (
              <TR key={tx.id}>
                <TD className="whitespace-nowrap text-ink-600">{formatDateTime(tx.createdAt)}</TD>
                <TD>
                  <span className="font-medium">{transactionKindLabel[tx.kind] ?? tx.kind}</span> {tx.simulated ? <Badge tone="test">Test</Badge> : null}
                  {tx.isReversed ? <Badge tone="neutral" className="ml-1">erstattet</Badge> : null}
                  <p className="text-xs text-ink-600">
                    {tx.description}
                    {tx.commissionBps != null ? ` · Provision ${formatBps(tx.commissionBps)}` : ""}
                  </p>
                </TD>
                <TD className="text-ink-600">{tx.actorName ?? "System"}</TD>
                <TD className="text-right tabular-nums">{formatCoins(Number(tx.gross))}</TD>
                <TD>
                  <div className="flex justify-end">
                    {(tx.kind === "session_charge" || tx.kind === "tip") && !tx.isReversed && canAdjust ? (
                      <ConfirmActionDialog trigger="Kulanz erstatten" title="Kulanzerstattung" description="Gegenbuchung aller Einträge: Münzen zurück an den Kunden, Creator- und Plattformanteil werden zurückgebucht. Nur einmal möglich." confirmLabel="Erstatten" action={reverseTransactionAction} hiddenFields={{ transactionId: tx.id }} reasonLabel="Begründung" reasonRequired />
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
