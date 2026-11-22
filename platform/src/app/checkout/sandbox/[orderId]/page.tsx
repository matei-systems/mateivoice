import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlaskConical, Lock } from "lucide-react";
import { isTestMode } from "@/config/env";
import { completeSandboxCheckoutAction } from "@/actions/finance";
import { requireSession, toActor } from "@/server/auth/current";
import { getOrderForUser } from "@/server/payments/service";
import { getPaymentProvider, sandboxCheckoutToken } from "@/server/payments/provider";
import { safeEqual } from "@/server/crypto";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Sandbox-Kasse", robots: { index: false, follow: false } };

/**
 * Simulierte „gehostete Kasse“ des Sandbox-Anbieters. Die Auswahl erzeugt ein
 * signiertes Server-zu-Server-Ereignis an die Webhook-Route – die Gutschrift
 * erfolgt erst dort. Nur im Testmodus erreichbar.
 */
export default async function SandboxCheckoutPage({ params, searchParams }: PageProps<"/checkout/sandbox/[orderId]">) {
  const { orderId } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const provider = getPaymentProvider();
  if (!isTestMode() || provider?.name !== "simulated") notFound();
  if (!token || !safeEqual(sandboxCheckoutToken(orderId), token)) notFound();
  const session = await requireSession(`/checkout/sandbox/${orderId}?token=${token}`);
  const row = await getOrderForUser(toActor(session)!, orderId);
  if (!row) notFound();
  const { order, packageName } = row;
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-test-200 bg-test-50 px-4 py-3 text-sm text-test-700">
        <FlaskConical className="size-5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Sandbox-Zahlungsanbieter.</strong> Hier wird kein Geld belastet. Es werden keine Kartendaten abgefragt oder gespeichert.
        </span>
      </div>
      <Card>
        <CardHeader title="Zahlung simulieren" description={`Bestellung ${order.id.slice(0, 8)} · ${packageName}`} action={<Lock className="size-5 text-ink-500" aria-hidden="true" />} />
        <CardBody className="space-y-6">
          <div className="flex items-baseline justify-between">
            <CoinAmount amount={order.coins} size="lg" test={order.simulated} />
            <span className="text-xl font-semibold text-ink-950">{formatEuroCents(order.priceCents)}</span>
          </div>
          {order.status !== "pending" ? (
            <p className="text-sm text-ink-600">Diese Bestellung ist bereits abgeschlossen.</p>
          ) : (
            <div className="grid gap-3">
              <ActionForm action={completeSandboxCheckoutAction} submitLabel="Zahlung erfolgreich simulieren" fullWidthSubmit className="space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="outcome" value="success" />
              </ActionForm>
              <ActionForm action={completeSandboxCheckoutAction} submitLabel="Ablehnung simulieren" submitVariant="outline" fullWidthSubmit className="space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="outcome" value="failure" />
              </ActionForm>
              <ActionForm action={completeSandboxCheckoutAction} submitLabel="Abbrechen" submitVariant="ghost" fullWidthSubmit className="space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="outcome" value="cancel" />
              </ActionForm>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-500">
            Ablauf wie bei einem echten Anbieter: Nach deiner Auswahl sendet die Sandbox ein signiertes Ereignis an unseren Server. Erst nach dessen Prüfung (Signatur, Betrag, Idempotenz) wird gutgeschrieben.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
