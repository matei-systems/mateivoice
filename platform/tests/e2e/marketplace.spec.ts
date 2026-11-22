import { expect, test } from "@playwright/test";
import { acknowledgeAge, db, login } from "./helpers";

test.describe("Marktplatz: Altersprüfung, Kauf, Chat, Trinkgeld, Favoriten", () => {
  test("Altersprüfung (Mock) → Sandbox-Kauf über signierten Webhook → Kaufhistorie", async ({ page, context }) => {
    await acknowledgeAge(context);
    await login(page, "kunde.neu@aurora.test");
    await page.goto("/account/wallet");
    await expect(page.getByText("Altersprüfung erforderlich").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Kaufen (Sandbox)" }).first()).toBeDisabled();

    await page.goto("/account/age-verification");
    await page.getByRole("button", { name: "Altersprüfung starten" }).click();
    await page.getByRole("button", { name: "Bestanden simulieren" }).click();
    await expect(page.getByText("Zugang (Testmodus)")).toBeVisible();
    await expect(page.getByText("KEINE echte Altersprüfung")).toBeVisible();

    await page.goto("/account/wallet");
    await page.getByRole("button", { name: "Kaufen (Sandbox)" }).first().click();
    await expect(page).toHaveURL(/\/checkout\/sandbox\/[0-9a-f-]+\?token=/);
    await expect(page.getByText("Sandbox-Zahlungsanbieter.")).toBeVisible();
    const orderId = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByRole("button", { name: "Zahlung erfolgreich simulieren" }).click();
    await expect(page).toHaveURL(/\/account\/wallet\/return\?order=/);
    await expect(page.getByText("Zahlung bestätigt")).toBeVisible();

    // Gutschrift kam über die Webhook-Route (signiertes Ereignis), nicht über die Browser-Rückleitung
    const events = await db().query<{ provider: string; type: string }>("SELECT provider, type FROM payment_events WHERE order_id = $1", [orderId]);
    expect(events.rows).toEqual([{ provider: "simulated", type: "payment.confirmed" }]);

    await page.goto("/account/purchases");
    await expect(page.getByText("Bestätigt").first()).toBeVisible();
    await expect(page.getByText("Sandbox").first()).toBeVisible();
  });

  test("Webhook-Route lehnt unsignierte Anfragen und fremde Anbieter ab", async ({ request }) => {
    const body = JSON.stringify({ id: "evt_aaaaaaaaaaaa", type: "payment.confirmed", orderId: "00000000-0000-4000-8000-000000000000", providerReference: "sim_x", amountCents: 999, currency: "EUR" });
    expect((await request.post("/api/webhooks/payments/simulated", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/webhooks/payments/simulated", { data: body, headers: { "x-aurora-sandbox-signature": "t=1,v1=00" } })).status()).toBe(400);
    expect((await request.post("/api/webhooks/payments/verotel", { data: body })).status()).toBe(404);
    expect((await request.post("/api/jobs/run")).status()).toBe(404); // ohne JOBS_SECRET deaktiviert
  });

  test("Live-Stream: Chat in Echtzeit und Trinkgeld mit 75/25-Aufteilung", async ({ page, context }) => {
    await acknowledgeAge(context);
    await login(page, "kunde@aurora.test");
    await page.goto("/creators/bella/live");
    await expect(page.getByText("verbunden", { exact: true })).toBeVisible();
    const text = `Hallo aus dem E2E-Test ${Date.now() % 10000}`;
    await page.getByLabel("Nachricht", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByText(text)).toBeVisible(); // per Server-Sent Events zugestellt

    await page.getByText("Trinkgeld senden").click();
    await page.getByRole("radio", { name: "25", exact: true }).click();
    await page.getByRole("button", { name: "25 Testmünzen senden" }).click();
    await expect(page.getByText("25 Münzen Trinkgeld").first()).toBeVisible();

    const split = await db().query<{ kind: string; amount: string }>(
      `SELECT a.kind, e.amount FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
        JOIN ledger_transactions t ON t.id = e.transaction_id WHERE t.kind = 'tip' ORDER BY t.created_at DESC, a.kind LIMIT 3`,
    );
    expect(split.rows.map((r) => [r.kind, Number(r.amount)]).sort()).toEqual([
      ["creator_earnings", 18],
      ["customer_wallet", -25],
      ["platform_revenue", 7],
    ]);
  });

  test("Favoriten merken und wieder entfernen", async ({ page, context }) => {
    await acknowledgeAge(context);
    await login(page, "kunde@aurora.test");
    await page.goto("/creators/aria");
    await page.getByRole("button", { name: "Merken" }).click();
    await expect(page.getByRole("button", { name: "Gemerkt" })).toBeVisible();
    await page.goto("/account/favorites");
    await expect(page.getByRole("heading", { name: "Aria" })).toBeVisible();
    await page.goto("/creators/aria");
    await page.getByRole("button", { name: "Gemerkt" }).click();
    await expect(page.getByRole("button", { name: "Merken" })).toBeVisible();
  });

  test("Preise, Hilfe-Center und Kontakt sind ohne Anmeldung erreichbar", async ({ page, context }) => {
    await acknowledgeAge(context);
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Münzpakete" })).toBeVisible();
    await expect(page.getByText("75 %").first()).toBeVisible();
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Hilfe-Center" })).toBeVisible();
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "So erreichst du uns" })).toBeVisible();
  });
});
