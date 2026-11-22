import "server-only";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { hmacSha256, safeEqual } from "@/server/crypto";
import { buildVerotelPurchaseUrl, parseVerotelPostback, verifyVerotelSignature } from "./verotel";

/**
 * Austauschbare Zahlungsanbieter-Schnittstelle.
 *
 * Grundsätze:
 *  - Gutschriften erfolgen AUSSCHLIESSLICH nach einem signaturgeprüften
 *    Server-zu-Server-Ereignis (Webhook/Postback) – nie aufgrund einer
 *    Browser-Rückleitung oder einer Antwort im Frontend.
 *  - Jedes Ereignis wird über (provider, eventId) genau einmal verarbeitet.
 *  - Betrag und Währung aus dem Ereignis werden gegen die Bestellung geprüft.
 *  - Anbieter, die echtes Geld bewegen, sind gesperrt, solange
 *    realCoinsEnabled() false liefert (Freigabe des Anbieters für genau dieses
 *    Geschäftsmodell, rechtliche Prüfung und Integrationstest stehen aus).
 */

export type NormalizedPaymentEventType =
  | "payment.pending"
  | "payment.confirmed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.charged_back";

export type NormalizedPaymentEvent = {
  /** Eindeutig je Anbieter – Grundlage der Idempotenz. */
  id: string;
  type: NormalizedPaymentEventType;
  /** Unsere Bestell-ID (beim Anbieter als Referenz hinterlegt). */
  orderId: string;
  /** Vorgangsnummer beim Anbieter (z. B. saleID). */
  providerReference: string | null;
  /** Vom Anbieter gemeldeter Betrag in Cent (null = nicht übermittelt). */
  amountCents: number | null;
  currency: string | null;
  failureReason?: string;
};

export type WebhookResult = "processed" | "duplicate" | "ignored" | "invalid";

export type WebhookRequest = {
  method: string;
  headers: Headers;
  query: URLSearchParams;
  rawBody: string;
};

export interface PaymentProvider {
  readonly name: string;
  readonly label: string;
  /** true = es wird echtes Geld bewegt (nur nach Freigabe zulässig). */
  readonly movesRealMoney: boolean;
  createCheckout(input: {
    orderId: string;
    priceCents: number;
    currency: string;
    description: string;
    successUrl: string;
    declineUrl: string;
  }): { providerReference: string | null; redirectUrl: string };
  /** Prüft Herkunft/Signatur und normalisiert das Ereignis; null = ungültig. */
  parseWebhook(request: WebhookRequest): NormalizedPaymentEvent | null;
  /** Antwortformat, das der Anbieter erwartet. */
  webhookResponse(result: WebhookResult): { status: number; body: string };
  /** Kann eine Erstattung per Schnittstelle ausgelöst werden? */
  readonly supportsRefundApi: boolean;
}

// ── Sandbox (simulierter Anbieter) ─────────────────────────────────────────

export const SANDBOX_SIGNATURE_HEADER = "x-aurora-sandbox-signature";
/** Ereignisse älter als 5 Minuten werden abgewiesen (Schutz vor Wiedereinspielung). */
const SANDBOX_TOLERANCE_SECONDS = 300;

export const sandboxEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_-]{8,64}$/),
  type: z.enum(["payment.pending", "payment.confirmed", "payment.failed", "payment.refunded", "payment.charged_back"]),
  orderId: z.uuid(),
  providerReference: z.string().min(4).max(100),
  amountCents: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  failureReason: z.string().max(200).optional(),
});

export type SandboxEvent = z.infer<typeof sandboxEventSchema>;

function sandboxKey(): Buffer {
  return hmacSha256(getEnv().AUTH_SECRET, "sandbox-payment-webhook-v2");
}

/** Signatur im Format „t=<unix>,v1=<hex>“ über „<t>.<rawBody>“. */
export function signSandboxPayload(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = hmacSha256(sandboxKey(), `${timestamp}.${rawBody}`).toString("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifySandboxSignature(rawBody: string, header: string | null, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const match = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec(header.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (Math.abs(nowSeconds - timestamp) > SANDBOX_TOLERANCE_SECONDS) return false;
  const expected = hmacSha256(sandboxKey(), `${timestamp}.${rawBody}`).toString("hex");
  return safeEqual(expected, match[2]!);
}

/** Signierte Rücksprung-URL zur Sandbox-Kasse (nur Testmodus). */
export function sandboxCheckoutToken(orderId: string): string {
  return hmacSha256(sandboxKey(), `checkout:${orderId}`).toString("hex").slice(0, 32);
}

const sandboxProvider: PaymentProvider = {
  name: "simulated",
  label: "Sandbox (simuliert, kein echtes Geld)",
  movesRealMoney: false,
  supportsRefundApi: true,
  createCheckout({ orderId }) {
    return {
      providerReference: `sim_${orderId.replace(/-/g, "").slice(0, 20)}`,
      redirectUrl: `/checkout/sandbox/${orderId}?token=${sandboxCheckoutToken(orderId)}`,
    };
  },
  parseWebhook({ method, headers, rawBody }) {
    if (method !== "POST" || rawBody.length > 16_384) return null;
    if (!verifySandboxSignature(rawBody, headers.get(SANDBOX_SIGNATURE_HEADER))) return null;
    try {
      const parsed = sandboxEventSchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) return null;
      return { ...parsed.data };
    } catch {
      return null;
    }
  },
  webhookResponse(result) {
    return result === "invalid" ? { status: 400, body: "invalid" } : { status: 200, body: result };
  },
};

// ── Verotel FlexPay ─────────────────────────────────────────────────────────

function verotelProvider(): PaymentProvider {
  const env = getEnv();
  const shopId = env.VEROTEL_SHOP_ID!;
  const signatureKey = env.VEROTEL_SIGNATURE_KEY!;
  return {
    name: "verotel",
    label: "Verotel FlexPay",
    movesRealMoney: true,
    // Laut Dokumentation keine Erstattungs-Schnittstelle: Gutschriften im Verotel Control Center auslösen.
    supportsRefundApi: false,
    createCheckout({ orderId, priceCents, currency, description, successUrl, declineUrl }) {
      return {
        providerReference: null, // saleID wird von Verotel vergeben und kommt mit dem Postback
        redirectUrl: buildVerotelPurchaseUrl({
          startUrl: env.VEROTEL_START_URL,
          shopId,
          signatureKey,
          priceCents,
          currency,
          description,
          referenceId: orderId,
          successUrl,
          declineUrl,
        }),
      };
    },
    parseWebhook({ method, query }) {
      if (method !== "GET") return null;
      if (!verifyVerotelSignature(signatureKey, query)) return null;
      const postback = parseVerotelPostback(query);
      if (!postback || postback.shopId !== shopId) return null;
      if (!z.uuid().safeParse(postback.referenceId).success) return null;
      if (postback.kind === "purchase") {
        return {
          id: `sale:${postback.saleId}:purchase`,
          type: "payment.confirmed",
          orderId: postback.referenceId,
          providerReference: postback.saleId,
          amountCents: postback.amountCents,
          currency: postback.currency,
        };
      }
      return {
        id: `tx:${postback.transactionId}:${postback.kind}`,
        type: postback.kind === "credit" ? "payment.refunded" : "payment.charged_back",
        orderId: postback.referenceId,
        providerReference: postback.saleId,
        amountCents: postback.amountCents,
        currency: postback.currency,
      };
    },
    webhookResponse(result) {
      // Verotel erwartet „OK“ – auch bei Duplikaten, damit keine Wiederholungen ausgelöst werden.
      return result === "invalid" ? { status: 400, body: "ERROR - Invalid signature!" } : { status: 200, body: "OK" };
    },
  };
}

export function getPaymentProvider(): PaymentProvider | null {
  const env = getEnv();
  if (env.PAYMENT_PROVIDER === "simulated") return sandboxProvider;
  if (env.PAYMENT_PROVIDER === "verotel") return verotelProvider();
  return null;
}

/** Anbieter anhand des Routen-Parameters (nur der konfigurierte Anbieter wird akzeptiert). */
export function getPaymentProviderByName(name: string): PaymentProvider | null {
  const provider = getPaymentProvider();
  return provider && provider.name === name ? provider : null;
}
