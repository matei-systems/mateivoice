import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { requireSession } from "@/server/auth/current";
import { listOrdersForUser } from "@/server/payments/service";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { orderStatus } from "@/lib/labels";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Kaufhistorie" };

export default async function PurchasesPage() {
  const session = await requireSession("/account/purchases");
  if (session.user.role !== "customer") redirect("/account/settings");
  const orders = await listOrdersForUser(session.user.id, 100);
  return (
    <>
      <PageHeader eyebrow="Münzen" title="Kaufhistorie" description="Alle Bestellungen mit Status. Bei Fragen zu einer Zahlung hilft der Support (Bestellnummer angeben)." actions={<ButtonLink href="/account/wallet" size="sm">Münzen kaufen</ButtonLink>} />
      <Card>
        <CardHeader title="Bestellungen" />
        {orders.length === 0 ? (
          <EmptyState icon={<ReceiptText className="size-6" aria-hidden="true" />} title="Noch keine Käufe" description="Gekaufte Münzpakete erscheinen hier." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Datum</TH>
                <TH>Paket</TH>
                <TH className="text-right">Betrag</TH>
                <TH>Status</TH>
                <TH>Bestellnummer</TH>
              </tr>
            </THead>
            <TBody>
              {orders.map((order) => {
                const status = orderStatus[order.status]!;
                return (
                  <TR key={order.id}>
                    <TD className="whitespace-nowrap text-ink-600">{formatDateTime(order.createdAt)}</TD>
                    <TD>
                      {order.packageName} · {formatCoins(order.coins)} {order.simulated ? "Testmünzen" : "Münzen"}
                    </TD>
                    <TD className="text-right tabular-nums">{formatEuroCents(order.priceCents)}</TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {order.simulated ? <Badge tone="test">Sandbox</Badge> : null}
                      </span>
                    </TD>
                    <TD className="font-mono text-xs text-ink-500">{order.id.slice(0, 8)}</TD>
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
