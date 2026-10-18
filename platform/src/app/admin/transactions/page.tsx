import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { isTestMode } from "@/config/env";
import { reverseTransactionAction, simulateOrderAction, simulatePaymentEventAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { listLedgerTransactions } from "@/server/admin/service";
import { formatBps } from "@/server/ledger/commission";
import { listCoinPackages, listRecentOrders } from "@/server/payments/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { orderStatus, transactionKindLabel } from "@/lib/labels";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Transaktionen" };

export default async function AdminTransactionsPage() {
  await requireAdmin("/admin/transactions");
  const [transactions, orders, packages] = await Promise.all([listLedgerTransactions(150), listRecentOrders(30), listCoinPackages()]);
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Transaktionen" description="Buchungsjournal (unveränderlich) und simulierte Zahlungsvorgänge. Korrekturen nur über begründete Gegenbuchungen." />
      <Alert tone="test" title="Ausschließlich Testdaten">Es gibt keine echten Zahlungen, Münzkäufe oder Auszahlungen. Alle Beträge sind Testmünzen.</Alert>

      {isTestMode() ? (
        <Card>
          <CardHeader title="Zahlungsfluss simulieren" description="Erzeugt eine simulierte Bestellung und anschließend ein signiertes Anbieter-Ereignis – über denselben Pfad wie ein echter Webhook (Signatur, Idempotenz)." />
          <CardBody className="space-y-6">
            <ActionForm action={simulateOrderAction} submitLabel="Simulierte Bestellung anlegen" submitVariant="outline" submitIcon={<CreditCard className="size-4" aria-hidden="true" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sim-username" label="Nutzername (Kunde)">
                  <Input id="sim-username" name="username" required placeholder="kunde_test" />
                </Field>
                <Field id="sim-package" label="Paket">
                  <Select id="sim-package" name="packageId" required>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} – {formatCoins(p.coins)} Münzen ({formatEuroCents(p.priceCents)}, Beispiel)
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Bestellungen (simuliert)" />
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
                  <TD className="text-ink-600">{formatDateTime(order.createdAt)}</TD>
                  <TD>{order.username}</TD>
                  <TD>
                    {order.packageName} · {formatCoins(order.coins)} <span className="text-xs text-ink-500">({formatEuroCents(order.priceCents)})</span>
                  </TD>
                  <TD>
                    <Badge tone={status.tone}>{status.label}</Badge> {order.simulated ? <Badge tone="test">simuliert</Badge> : null}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {order.status === "pending" ? (
                        <>
                          <ActionForm action={simulatePaymentEventAction} className="space-y-0" submitLabel="Bestätigen" submitSize="sm">
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="type" value="payment.confirmed" />
                          </ActionForm>
                          <ActionForm action={simulatePaymentEventAction} className="space-y-0" submitLabel="Fehlschlag" submitSize="sm" submitVariant="outline">
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="type" value="payment.failed" />
                          </ActionForm>
                        </>
                      ) : order.status === "confirmed" ? (
                        <ActionForm action={simulatePaymentEventAction} className="space-y-0" submitLabel="Rückbuchung" submitSize="sm" submitVariant="outline">
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="type" value="payment.charged_back" />
                        </ActionForm>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {orders.length === 0 ? <p className="px-6 py-6 text-center text-sm text-ink-600">Noch keine simulierten Bestellungen.</p> : null}
      </Card>

      <Card>
        <CardHeader title="Buchungsjournal" description="Neueste 150 Buchungen. Jede Buchung hat eine eindeutige Referenz und ist ausgeglichen." />
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
                  <span className="font-medium">{transactionKindLabel[tx.kind] ?? tx.kind}</span> {tx.simulated ? <Badge tone="test">simuliert</Badge> : null}
                  {tx.isReversed ? <Badge tone="neutral" className="ml-1">umgekehrt</Badge> : null}
                  <p className="text-xs text-ink-600">
                    {tx.description}
                    {tx.commissionBps != null ? ` · Provision ${formatBps(tx.commissionBps)}` : ""}
                  </p>
                </TD>
                <TD className="text-ink-600">{tx.actorName ?? "System"}</TD>
                <TD className="text-right tabular-nums">{formatCoins(Number(tx.gross))}</TD>
                <TD>
                  <div className="flex justify-end gap-1.5">
                    {(tx.kind === "session_charge" || tx.kind === "purchase") && !tx.isReversed ? (
                      <>
                        <ConfirmActionDialog trigger="Erstatten" title="Rückerstattung (simuliert)" description="Erzeugt eine Gegenbuchung aller Einträge. Nur einmal möglich." confirmLabel="Erstatten" action={reverseTransactionAction} hiddenFields={{ transactionId: tx.id, kind: "refund" }} reasonLabel="Begründung" reasonRequired />
                        <ConfirmActionDialog trigger="Rückbuchung" title="Rückbuchung (simuliert)" confirmLabel="Rückbuchen" variant="danger" action={reverseTransactionAction} hiddenFields={{ transactionId: tx.id, kind: "chargeback" }} reasonLabel="Begründung" reasonRequired />
                      </>
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
