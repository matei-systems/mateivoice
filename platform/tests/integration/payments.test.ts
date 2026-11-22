import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { emailOutbox, paymentEvents, paymentOrders, riskEvents } from "@/server/db/schema";
import { getBalance, reconcileLedger } from "@/server/ledger/service";
import {
  buildSandboxEvent,
  completeSandboxCheckout,
  createCheckout,
  getOrderForUser,
  requestOrderRefund,
  simulateChargeback,
} from "@/server/payments/service";
import { SANDBOX_SIGNATURE_HEADER, signSandboxPayload } from "@/server/payments/provider";
import { updateSetting } from "@/server/settings/service";
import { requestPrivateSession, respondToRequest, joinPrivateSession, heartbeat } from "@/server/video/service";
import { videoSessionParticipants } from "@/server/db/schema";
import { actorOf, createCreator, createUser } from "../support/db-helpers";
import { createPackage, postWebhook, routeTransport } from "../support/payments";

async function customerWithOrder(priceCents = 999, coins = 500) {
  const customer = await createUser();
  const pkg = await createPackage({ coins, priceCents });
  const checkout = await createCheckout(actorOf(customer), pkg.id);
  return { customer, pkg, order: checkout.order, redirectUrl: checkout.redirectUrl };
}

describe("Sandbox-Checkout und signierte Webhooks", () => {
  it("Gutschrift erst nach signiertem Webhook – genau einmal, auch bei Wiederholung", async () => {
    const { customer, order, redirectUrl } = await customerWithOrder();
    expect(order.status).toBe("pending");
    expect(order.simulated).toBe(true);
    expect(redirectUrl).toMatch(new RegExp(`^/checkout/sandbox/${order.id}\\?token=[0-9a-f]{32}$`));
    // Rückkehr in den Browser allein ändert nichts
    expect((await getOrderForUser(actorOf(customer), order.id))?.order.status).toBe("pending");
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);

    const { rawBody, signature } = buildSandboxEvent(order, "payment.confirmed");
    const first = await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature });
    expect(first).toEqual({ status: 200, body: "processed" });
    const again = await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature });
    expect(again).toEqual({ status: 200, body: "duplicate" });
    // Neues Ereignis für bereits bestätigte Bestellung → ignoriert
    const second = buildSandboxEvent(order, "payment.confirmed");
    expect((await postWebhook("simulated", second.rawBody, { [SANDBOX_SIGNATURE_HEADER]: second.signature })).body).toBe("ignored");

    expect(await getBalance(customer.id, "customer_wallet", "TEST_COIN")).toBe(500);
    expect(await getBalance(customer.id, "customer_wallet", "COIN")).toBe(0);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored?.status).toBe("confirmed");
    const mails = await getDb().select().from(emailOutbox).where(eq(emailOutbox.template, "payment_confirmed"));
    expect(mails).toHaveLength(1);
    expect(mails[0]?.bodyText).toContain("KEIN echtes Geld");
  });

  it("Sandbox-Kasse stellt das Ergebnis über die Webhook-Route zu", async () => {
    const { customer, order, redirectUrl } = await customerWithOrder();
    const token = new URL(redirectUrl, "http://x").searchParams.get("token")!;
    await expect(completeSandboxCheckout(actorOf(customer), { orderId: order.id, token: "falsch", outcome: "success" }, routeTransport)).rejects.toMatchObject({ code: "not_found" });
    const stranger = await createUser();
    await expect(completeSandboxCheckout(actorOf(stranger), { orderId: order.id, token, outcome: "success" }, routeTransport)).rejects.toMatchObject({ code: "not_found" });
    await completeSandboxCheckout(actorOf(customer), { orderId: order.id, token, outcome: "success" }, routeTransport);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
    await expect(completeSandboxCheckout(actorOf(customer), { orderId: order.id, token, outcome: "success" }, routeTransport)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("parallele identische Webhooks erzeugen genau eine Gutschrift", async () => {
    const { customer, order } = await customerWithOrder();
    const { rawBody, signature } = buildSandboxEvent(order, "payment.confirmed");
    const results = await Promise.all(Array.from({ length: 6 }, () => postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature })));
    expect(results.filter((r) => r.body === "processed")).toHaveLength(1);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("lehnt unsignierte, manipulierte und veraltete Webhooks ab und meldet ein Risikosignal", async () => {
    const { customer, order } = await customerWithOrder();
    const { rawBody, signature } = buildSandboxEvent(order, "payment.confirmed");
    expect((await postWebhook("simulated", rawBody)).status).toBe(400);
    const tampered = rawBody.replace('"amountCents":999', '"amountCents":1');
    expect((await postWebhook("simulated", tampered, { [SANDBOX_SIGNATURE_HEADER]: signature })).status).toBe(400);
    const old = signSandboxPayload(rawBody, Math.floor(Date.now() / 1000) - 3600);
    expect((await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: old })).status).toBe(400);
    expect((await postWebhook("verotel", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature })).status).toBe(404);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    const risks = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "webhook_invalid_signature"));
    expect(risks).toHaveLength(1); // gedrosselt: höchstens ein Signal je 10 Minuten
  });

  it("abweichender Betrag wird nicht gutgeschrieben (Schutz vor Manipulation)", async () => {
    const { customer, order } = await customerWithOrder();
    const { rawBody, signature } = buildSandboxEvent(order, "payment.confirmed", { amountCents: 1 });
    expect((await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature })).body).toBe("ignored");
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored?.status).toBe("failed");
    const [risk] = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "payment_amount_mismatch"));
    expect(risk?.severity).toBe("high");
  });

  it("Ereignis zu unbekannter Bestellung wird protokolliert und ignoriert", async () => {
    const { order } = await customerWithOrder();
    const { rawBody, signature } = buildSandboxEvent({ ...order, id: "00000000-0000-4000-8000-000000000000" }, "payment.confirmed");
    expect((await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature })).body).toBe("ignored");
    const events = await getDb().select().from(paymentEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.orderId).toBeNull();
  });

  it("fehlgeschlagene Zahlungen schreiben nichts gut; Häufung erzeugt Risikosignal", async () => {
    const customer = await createUser();
    const pkg = await createPackage();
    for (let i = 0; i < 3; i += 1) {
      const { order } = await createCheckout(actorOf(customer), pkg.id);
      const { rawBody, signature } = buildSandboxEvent(order, "payment.failed", { failureReason: "Karte abgelehnt (Sandbox)" });
      await postWebhook("simulated", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signature });
    }
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    const risks = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "payment_failures"));
    expect(risks).toHaveLength(1);
  });

  it("Erstattung nach teilweisem Verbrauch: Rest vom Guthaben, Fehlbetrag trägt die Plattform", async () => {
    const admin = await createUser({ role: "admin" });
    const { customer, order } = await customerWithOrder(999, 500);
    const confirm = buildSandboxEvent(order, "payment.confirmed");
    await postWebhook("simulated", confirm.rawBody, { [SANDBOX_SIGNATURE_HEADER]: confirm.signature });
    // 200 Münzen in einem privaten Chat verbrauchen (5 Minuten à 40)
    const { user: creator, profile } = await createCreator({ coinsPerMinute: 40 });
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    await joinPrivateSession(actorOf(customer), session.id);
    const joined = await joinPrivateSession(actorOf(creator), session.id);
    const later = new Date(joined.session.startedAt!.getTime() + 4 * 60_000 + 1000);
    await getDb().update(videoSessionParticipants).set({ lastHeartbeatAt: later }).where(eq(videoSessionParticipants.sessionId, session.id));
    await heartbeat(actorOf(customer), session.id, later);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(300);

    await expect(requestOrderRefund({ staffUserId: admin.id, orderId: order.id, reason: "kurz" }, routeTransport)).rejects.toMatchObject({ code: "validation" });
    const result = await requestOrderRefund({ staffUserId: admin.id, orderId: order.id, reason: "Kulanz nach Kundenbeschwerde" }, routeTransport);
    expect(result.delivered).toBe(true);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored?.status).toBe("refunded");
    // Creator-Einnahmen bleiben unberührt
    expect(await getBalance(creator.id, "creator_earnings")).toBe(150);
    const [risk] = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "refund_after_consumption"));
    expect(risk?.details).toMatchObject({ shortfall: 200 });
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("Chargeback kehrt den Kauf um und erzeugt ein Risikosignal mit hoher Priorität", async () => {
    const admin = await createUser({ role: "admin" });
    const { customer, order } = await customerWithOrder();
    const confirm = buildSandboxEvent(order, "payment.confirmed");
    await postWebhook("simulated", confirm.rawBody, { [SANDBOX_SIGNATURE_HEADER]: confirm.signature });
    await simulateChargeback({ staffUserId: admin.id, orderId: order.id }, routeTransport);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored?.status).toBe("charged_back");
    const [risk] = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "chargeback"));
    expect(risk?.severity).toBe("high");
    expect((await reconcileLedger()).ok).toBe(true);
  });
});

describe("Voraussetzungen für Käufe", () => {
  it("verlangt bestätigte E-Mail, Altersprüfung, aktives Paket und Kundenkonto", async () => {
    const pkg = await createPackage();
    const unverified = await createUser({ emailVerified: false });
    await expect(createCheckout(actorOf(unverified), pkg.id)).rejects.toMatchObject({ code: "forbidden" });
    const noAge = await createUser({ ageVerification: "none" });
    await expect(createCheckout(actorOf(noAge), pkg.id)).rejects.toMatchObject({ code: "forbidden" });
    const creator = await createUser({ role: "creator" });
    await expect(createCheckout(actorOf(creator), pkg.id)).rejects.toMatchObject({ code: "forbidden" });
    const customer = await createUser();
    await expect(createCheckout(actorOf(customer), "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("Kauflimits und Feature-Flag werden serverseitig durchgesetzt", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const pkg = await createPackage({ priceCents: 9_000 });
    await updateSetting({ actorUserId: admin.id, key: "payments", value: { dailyLimitCents: 10_000, monthlyLimitCents: 50_000 }, reason: "Test der Tageslimits" });
    await createCheckout(actorOf(customer), pkg.id);
    await expect(createCheckout(actorOf(customer), pkg.id)).rejects.toMatchObject({ code: "invalid_state" });
    const flags = { registrations: true, creatorApplications: true, publicStreams: true, privateChat: true, chat: true, tips: true, favorites: true, purchases: false, payouts: true };
    await updateSetting({ actorUserId: admin.id, key: "featureFlags", value: flags, reason: "Käufe vorübergehend aus" });
    const other = await createUser();
    await expect(createCheckout(actorOf(other), pkg.id)).rejects.toMatchObject({ code: "feature_unavailable" });
    const count = await getDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform_settings_history`);
    expect(count.rows[0]?.n).toBe(2);
  });
});
