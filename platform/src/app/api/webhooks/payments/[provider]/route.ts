import { handlePaymentWebhook } from "@/server/payments/service";
import { log } from "@/server/log";

/**
 * Eingang für Zahlungsanbieter-Benachrichtigungen (Webhooks/Postbacks).
 *
 * - Nur der konfigurierte Anbieter wird akzeptiert (sonst 404).
 * - Signatur/Herkunft wird im Anbieter-Adapter geprüft; ungültig → 400.
 * - Verarbeitung idempotent (Ereignis-ID je Anbieter); Gutschrift nur nach Prüfung
 *   von Bestellung, Betrag und Währung.
 * - Keine Sitzung/Cookies nötig; Wartungsmodus blockiert Webhooks bewusst nicht.
 */

const MAX_BODY_BYTES = 64 * 1024;

async function handle(request: Request, ctx: RouteContext<"/api/webhooks/payments/[provider]">) {
  const { provider } = await ctx.params;
  if (!/^[a-z0-9-]{2,32}$/.test(provider)) return new Response("not found", { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return new Response("payload too large", { status: 413 });
  const rawBody = request.method === "POST" ? await request.text() : "";
  if (rawBody.length > MAX_BODY_BYTES) return new Response("payload too large", { status: 413 });
  try {
    const { response } = await handlePaymentWebhook(provider, {
      method: request.method,
      headers: request.headers,
      query: new URL(request.url).searchParams,
      rawBody,
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    // 500 → Anbieter wiederholt die Zustellung später (Verarbeitung ist idempotent).
    log.error("payment.webhook_error", { provider, error });
    return new Response("error", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
