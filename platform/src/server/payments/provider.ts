import "server-only";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { hmacSha256, safeEqual } from "@/server/crypto";

/**
 * Austauschbare Zahlungsanbieter-Schnittstelle.
 *
 * Es ist noch KEIN Zahlungsanbieter kontaktiert oder für das Adult-
 * Geschäftsmodell freigegeben. Der simulierte Anbieter bewegt kein Geld; er
 * erzeugt nur signierte Ereignisse, damit Idempotenz, Statusübergänge und
 * Buchungen getestet werden können.
 */

export const paymentEventSchema = z.object({
  id: z.string().min(8).max(100),
  type: z.enum(["payment.pending", "payment.confirmed", "payment.failed", "payment.charged_back"]),
  orderId: z.uuid(),
  providerReference: z.string().min(4).max(100),
  failureReason: z.string().max(200).optional(),
  createdAt: z.iso.datetime(),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export interface PaymentProvider {
  readonly name: string;
  readonly isReal: boolean;
  createCheckout(input: { orderId: string; priceCents: number; currency: string }): Promise<{
    providerReference: string;
    /** Weiterleitung zum Anbieter – beim simulierten Anbieter immer null. */
    redirectUrl: string | null;
  }>;
  /** Prüft die Signatur und liefert das Ereignis oder null (ungültig). */
  verifyWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
}

function webhookKey(): Buffer {
  return hmacSha256(getEnv().AUTH_SECRET, "simulated-payment-webhook-v1");
}

export function signSimulatedPayload(rawBody: string): string {
  return hmacSha256(webhookKey(), rawBody).toString("hex");
}

const simulatedProvider: PaymentProvider = {
  name: "simulated",
  isReal: false,
  async createCheckout({ orderId }) {
    return { providerReference: `sim_${orderId.replace(/-/g, "").slice(0, 16)}`, redirectUrl: null };
  },
  verifyWebhook(rawBody, signature) {
    if (!signature || !safeEqual(signSimulatedPayload(rawBody), signature)) return null;
    try {
      const parsed = paymentEventSchema.safeParse(JSON.parse(rawBody));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
};

export function getPaymentProvider(): PaymentProvider | null {
  return getEnv().PAYMENT_PROVIDER === "simulated" ? simulatedProvider : null;
}
