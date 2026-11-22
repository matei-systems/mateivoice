import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireSession, toActor } from "@/server/auth/current";
import { getOrderForUser } from "@/server/payments/service";
import { AutoRefresh } from "@/components/studio/auto-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader } from "@/components/ui/misc";
import { formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Zahlungsstatus" };

/**
 * Rückkehr vom Zahlungsanbieter. Diese Seite zeigt NUR den Status an –
 * gutgeschrieben wird ausschließlich nach dem signierten Anbieter-Ereignis.
 */
export default async function WalletReturnPage({ searchParams }: PageProps<"/account/wallet/return">) {
  const session = await requireSession("/account/wallet");
  const params = await searchParams;
  const orderId = typeof params.order === "string" ? params.order : "";
  const row = await getOrderForUser(toActor(session)!, orderId);
  if (!row) notFound();
  const { order, packageName } = row;
  const pending = order.status === "pending" || order.status === "created";
  return (
    <>
      <PageHeader eyebrow="Kauf" title="Zahlungsstatus" description={`${packageName} · ${formatEuroCents(order.priceCents)}`} />
      {pending ? <AutoRefresh intervalMs={2000} /> : null}
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
          {order.status === "confirmed" ? (
            <>
              <CheckCircle2 className="size-12 text-success-600" aria-hidden="true" />
              <p className="text-lg font-semibold text-ink-950">Zahlung bestätigt</p>
              <CoinAmount amount={order.coins} size="lg" test={order.simulated} />
              <p className="text-sm text-ink-600">wurden deinem Guthaben gutgeschrieben.</p>
            </>
          ) : pending ? (
            <>
              <Clock className="size-12 animate-pulse text-warning-600" aria-hidden="true" />
              <p className="text-lg font-semibold text-ink-950">Zahlung wird geprüft …</p>
              <p className="max-w-md text-sm text-ink-600">Die Gutschrift erfolgt, sobald der Zahlungsanbieter die Zahlung bestätigt hat. Diese Seite aktualisiert sich automatisch.</p>
            </>
          ) : (
            <>
              <XCircle className="size-12 text-danger-600" aria-hidden="true" />
              <p className="text-lg font-semibold text-ink-950">{order.status === "failed" ? "Zahlung nicht abgeschlossen" : "Zahlung storniert"}</p>
              {order.failureReason ? <p className="text-sm text-ink-600">{order.failureReason}</p> : null}
            </>
          )}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <ButtonLink href="/account/wallet">Zum Guthaben</ButtonLink>
            <ButtonLink href="/creators" variant="outline">
              Creator entdecken
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
      {order.simulated ? <Alert tone="test">Sandbox-Kauf: Es wurde kein echtes Geld bewegt.</Alert> : null}
    </>
  );
}
