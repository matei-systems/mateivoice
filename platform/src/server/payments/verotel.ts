import { createHash } from "node:crypto";
import { safeEqual } from "@/server/crypto";

/**
 * Verotel FlexPay (Version 4) – reine Hilfsfunktionen ohne I/O.
 *
 * Grundlage: offizielle Dokumentation „FlexPay – Create a purchase order“
 * (controlcenter.verotel.com/flexpay-doc/purchase.html, abgerufen 2026-11).
 *  - Start einer Zahlung: GET {startUrl}?…&signature=…
 *  - Signatur: SHA-256 (hex, Kleinbuchstaben) über
 *      signatureKey + ":" + name=value (alphabetisch nach Name, nur belegte Werte), mit ":" verbunden
 *    Werte in UTF-8. email, oneClickToken und signature sind ausgenommen.
 *  - Postbacks kommen als GET; Signatur über alle übermittelten Parameter außer „signature“;
 *    erwartete Antwort: HTTP 200 mit Klartext „OK“ (innerhalb von 30 s), sonst
 *    löst Verotel bei Kartenzahlungen automatisch eine Erstattung aus.
 *
 * WICHTIG: Es besteht KEIN Händlervertrag und KEINE Freigabe durch Verotel. Der
 * Adapter ist implementiert und gegen das offizielle Signaturbeispiel getestet,
 * Echtzahlungen bleiben gesperrt (realCoinsEnabled() === false).
 */

export const VEROTEL_PROTOCOL_VERSION = "4";

/** Parameter, die nie in die Signatur einfließen. */
const EXCLUDED_FROM_SIGNATURE = new Set(["signature", "email", "oneClickToken"]);

export function verotelSignature(signatureKey: string, params: Record<string, string | number | null | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([name, value]) => !EXCLUDED_FROM_SIGNATURE.has(name) && value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`);
  const input = [signatureKey, ...pairs].join(":");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Prüft die Signatur eines Postbacks (alle Parameter außer „signature“). */
export function verifyVerotelSignature(signatureKey: string, params: URLSearchParams): boolean {
  const received = params.get("signature");
  if (!received || !/^[0-9a-fA-F]{64}$/.test(received)) return false;
  const values: Record<string, string> = {};
  for (const [name, value] of params.entries()) {
    if (name in values) return false; // doppelte Parameter sind unzulässig
    values[name] = value;
  }
  return safeEqual(verotelSignature(signatureKey, values), received.toLowerCase());
}

/** Cent-Betrag → „nnn.nn“ (Verotel-Format). */
export function formatVerotelAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError("Betrag muss eine positive Ganzzahl (Cent) sein");
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** „nnn.nn“ → Cent; null bei ungültigem Format (keine Gleitkommarechnung). */
export function parseVerotelAmount(value: string | null): number | null {
  if (!value || !/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export type VerotelPurchaseInput = {
  startUrl: string;
  shopId: string;
  signatureKey: string;
  priceCents: number;
  currency: string;
  description: string;
  referenceId: string;
  successUrl?: string;
  declineUrl?: string;
  email?: string;
};

/** Baut die signierte Start-URL für einen Einmalkauf (type=purchase). */
export function buildVerotelPurchaseUrl(input: VerotelPurchaseInput): string {
  const description = input.description.replace(/[^\x20-\x7E -ÿ]/g, "").slice(0, 100);
  const params: Record<string, string> = {
    version: VEROTEL_PROTOCOL_VERSION,
    shopID: input.shopId,
    type: "purchase",
    priceAmount: formatVerotelAmount(input.priceCents),
    priceCurrency: input.currency,
    description,
    referenceID: input.referenceId,
  };
  if (input.successUrl) params.successURL = input.successUrl.slice(0, 255);
  if (input.declineUrl) params.declineURL = input.declineUrl.slice(0, 255);
  const signature = verotelSignature(input.signatureKey, params);
  const query = new URLSearchParams();
  for (const name of Object.keys(params).sort()) query.set(name, params[name]!);
  if (input.email) query.set("email", input.email.slice(0, 100));
  query.set("signature", signature);
  return `${input.startUrl}?${query.toString()}`;
}

export type VerotelPostback =
  | {
      kind: "purchase";
      shopId: string;
      saleId: string;
      referenceId: string;
      amountCents: number | null;
      currency: string | null;
      transactionId: string | null;
    }
  | {
      kind: "credit" | "chargeback";
      shopId: string;
      saleId: string;
      referenceId: string;
      amountCents: number | null;
      currency: string | null;
      transactionId: string;
    };

/** Wertet einen bereits signaturgeprüften Postback aus. Unbekannte Ereignisse → null. */
export function parseVerotelPostback(params: URLSearchParams): VerotelPostback | null {
  const shopId = params.get("shopID");
  const saleId = params.get("saleID");
  const referenceId = params.get("referenceID");
  if (!shopId || !saleId || !referenceId) return null;
  const amountCents = parseVerotelAmount(params.get("priceAmount"));
  const currency = params.get("priceCurrency");
  const event = params.get("event");
  if (!event && params.get("type") === "purchase") {
    return { kind: "purchase", shopId, saleId, referenceId, amountCents, currency, transactionId: params.get("transactionID") };
  }
  if (event === "credit" || event === "chargeback") {
    const transactionId = params.get("transactionID");
    if (!transactionId) return null;
    return { kind: event, shopId, saleId, referenceId, amountCents, currency, transactionId };
  }
  return null;
}
