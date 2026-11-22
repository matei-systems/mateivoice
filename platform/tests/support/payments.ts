import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { coinPackages } from "@/server/db/schema";
import { SANDBOX_SIGNATURE_HEADER } from "@/server/payments/provider";
import type { SandboxTransport } from "@/server/payments/service";
import { GET, POST } from "@/app/api/webhooks/payments/[provider]/route";

/** Ruft die echte Webhook-Route (Route Handler) auf – wie ein Zahlungsanbieter per HTTP. */
export async function postWebhook(provider: string, rawBody: string, headers: Record<string, string> = {}) {
  const response = await POST(
    new Request(`http://localhost:3000/api/webhooks/payments/${provider}`, { method: "POST", body: rawBody, headers: { "content-type": "application/json", ...headers } }),
    { params: Promise.resolve({ provider }) },
  );
  return { status: response.status, body: await response.text() };
}

export async function getWebhook(provider: string, query: URLSearchParams) {
  const response = await GET(new Request(`http://localhost:3000/api/webhooks/payments/${provider}?${query.toString()}`, { method: "GET" }), {
    params: Promise.resolve({ provider }),
  });
  return { status: response.status, body: await response.text() };
}

/** Sandbox-Zustellung direkt an den Route Handler (statt HTTP an APP_URL). */
export const routeTransport: SandboxTransport = (rawBody, signature) => postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature });

export async function createPackage(input: { coins?: number; priceCents?: number } = {}) {
  const [pkg] = await getDb()
    .insert(coinPackages)
    .values({ code: `pkg-${Math.random().toString(36).slice(2, 10)}`, name: "Testpaket", coins: input.coins ?? 500, priceCents: input.priceCents ?? 999, currency: "EUR" })
    .returning();
  return pkg!;
}

export async function deactivatePackage(id: string) {
  await getDb().update(coinPackages).set({ active: false }).where(eq(coinPackages.id, id));
}
