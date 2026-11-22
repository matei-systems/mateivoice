import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { chatMessages, creatorPayoutProfiles, emailOutbox, ledgerTransactions, payouts, riskEvents, videoSessions } from "@/server/db/schema";
import { getBalance, reconcileLedger } from "@/server/ledger/service";
import {
  approvePayout,
  cancelPayout,
  getPayoutSummary,
  processPayout,
  rejectPayout,
  requestPayout,
  savePayoutProfile,
} from "@/server/payouts/service";
import { updateSetting } from "@/server/settings/service";
import { blockUser } from "@/server/social/service";
import { sendTip } from "@/server/tips/service";
import { joinPrivateSession, requestPrivateSession, respondToRequest, setAvailability } from "@/server/video/service";
import { grantTestCoins } from "@/server/ledger/service";
import { actorOf, createCreator, createUser } from "../support/db-helpers";

const VALID_IBAN = "AT61 1904 3002 3457 3201";

async function activeSession(price = 40) {
  const customer = await createUser();
  await grantTestCoins(customer.id);
  const { user: creator, profile } = await createCreator({ coinsPerMinute: price });
  const session = await requestPrivateSession(actorOf(customer), profile.id);
  await respondToRequest(actorOf(creator), session.id, "accept");
  await joinPrivateSession(actorOf(customer), session.id);
  await joinPrivateSession(actorOf(creator), session.id);
  return { customer, creator, profile, sessionId: session.id };
}

/** Creator mit genau 75 % von `tipCoins` als Einnahmen (Trinkgeld im öffentlichen Stream, ohne Minutenabrechnung). */
async function creatorWithEarnings(tipCoins: number) {
  const admin = await createUser({ role: "admin" });
  await updateSetting({ actorUserId: admin.id, key: "payout", value: { minimumCoins: 100, holdDays: 0, centsPer100Coins: 100, requireFourEyes: true }, reason: "Testkonfiguration Auszahlungen" });
  const customer = await createUser();
  await grantTestCoins(customer.id);
  const { user: creator, profile } = await createCreator();
  await setAvailability(actorOf(creator), "live");
  const [stream] = await getDb()
    .select({ id: videoSessions.id })
    .from(videoSessions)
    .where(and(eq(videoSessions.creatorProfileId, profile.id), eq(videoSessions.kind, "public_stream")));
  await sendTip(actorOf(customer), { sessionId: stream!.id, amount: tipCoins, requestId: crypto.randomUUID() });
  return { admin, creator, customer, streamId: stream!.id };
}

describe("Trinkgelder", () => {
  it("teilt 75/25, ist idempotent und erscheint im Chat", async () => {
    const { customer, creator, sessionId } = await activeSession();
    const before = await getBalance(customer.id, "customer_wallet");
    const requestId = crypto.randomUUID();
    const tip = await sendTip(actorOf(customer), { sessionId, amount: 41, requestId, message: "Danke!" });
    expect(tip).toMatchObject({ gross: 41, creatorShare: 30, platformShare: 11, duplicate: false });
    const again = await sendTip(actorOf(customer), { sessionId, amount: 41, requestId });
    expect(again.duplicate).toBe(true);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(before - 41);
    const [message] = await getDb().select().from(chatMessages).where(eq(chatMessages.kind, "tip"));
    expect(message).toMatchObject({ tipAmount: 41, body: "Danke!", senderUserId: customer.id });
    const [tx] = await getDb().select().from(ledgerTransactions).where(eq(ledgerTransactions.kind, "tip"));
    expect(tx?.commissionBps).toBe(2500);
    expect(await getBalance(creator.id, "creator_earnings")).toBeGreaterThanOrEqual(30);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("prüft Grenzen, Guthaben, Blockierung und Sitzungszugehörigkeit", async () => {
    const { customer, creator, sessionId } = await activeSession();
    await expect(sendTip(actorOf(customer), { sessionId, amount: 1, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "validation" });
    await expect(sendTip(actorOf(customer), { sessionId, amount: 5000, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "insufficient_funds" });
    const outsider = await createUser();
    await expect(sendTip(actorOf(outsider), { sessionId, amount: 10, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "not_found" });
    await expect(sendTip(actorOf(creator), { sessionId, amount: 10, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
    await blockUser(actorOf(creator), customer.id);
    await expect(sendTip(actorOf(customer), { sessionId, amount: 10, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Häufung von Trinkgeldern erzeugt ein Risikosignal", async () => {
    const { customer, sessionId } = await activeSession();
    for (let i = 0; i < 15; i += 1) await sendTip(actorOf(customer), { sessionId, amount: 5, requestId: crypto.randomUUID() });
    const risks = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "tip_velocity"));
    expect(risks).toHaveLength(1);
  });

  it("Trinkgelder in öffentlichen Streams", async () => {
    const { creator } = await creatorWithEarnings(100);
    expect(await getBalance(creator.id, "creator_earnings")).toBe(75);
  });
});

describe("Auszahlungen", () => {
  it("Auszahlungskonto: IBAN wird geprüft und nur verschlüsselt gespeichert", async () => {
    const { user: creator } = await createCreator();
    await expect(savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: "AT61 1904 3002 3457 3202" })).rejects.toMatchObject({ code: "validation" });
    await expect(savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: "US12 3456 7890 1234 5678" })).rejects.toMatchObject({ code: "validation" });
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: VALID_IBAN });
    const [row] = await getDb().select().from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, creator.id));
    expect(row?.ibanLast4).toBe("3201");
    expect(row?.ibanEncrypted).not.toContain("1904");
    // Änderung → Sicherheits-E-Mail und Risikosignal
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: "DE89 3704 0044 0532 0130 00" });
    const mails = await getDb().select().from(emailOutbox).where(eq(emailOutbox.template, "security_notice"));
    expect(mails).toHaveLength(1);
    const [risk] = await getDb().select().from(riskEvents).where(eq(riskEvents.kind, "payout_destination_changed"));
    expect(risk).toBeTruthy();
  });

  it("vollständiger Ablauf: Antrag reserviert, Vier-Augen-Prinzip, Ausführung bucht aus", async () => {
    const { admin, creator } = await creatorWithEarnings(400); // 300 Münzen Creator-Anteil
    const finance = await createUser({ role: "finance" });
    await expect(requestPayout(actorOf(creator), 200)).rejects.toMatchObject({ code: "invalid_state" }); // kein Konto
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: VALID_IBAN });
    await expect(requestPayout(actorOf(creator), 50)).rejects.toMatchObject({ code: "validation" }); // unter Minimum
    await expect(requestPayout(actorOf(creator), 10_000)).rejects.toMatchObject({ code: "validation" }); // über Guthaben

    const payout = await requestPayout(actorOf(creator), 200);
    expect(payout).toMatchObject({ status: "requested", currency: "TEST_COIN", simulated: true, provider: "sandbox", fiatAmountCents: 200 });
    expect(await getBalance(creator.id, "creator_earnings")).toBe(100);
    await expect(requestPayout(actorOf(creator), 100)).rejects.toMatchObject({ code: "conflict" });

    await approvePayout({ staffUserId: admin.id, payoutId: payout.id, note: "" });
    await expect(processPayout({ staffUserId: admin.id, payoutId: payout.id, outcome: "success", note: "" })).rejects.toMatchObject({ code: "forbidden" });
    await processPayout({ staffUserId: finance.id, payoutId: payout.id, outcome: "success", note: "" });
    const [done] = await getDb().select().from(payouts).where(eq(payouts.id, payout.id));
    expect(done?.status).toBe("completed");
    expect(done?.providerReference).toMatch(/^sandbox_po_/);
    expect(await getBalance(creator.id, "creator_earnings")).toBe(100);
    const mails = await getDb().select({ template: emailOutbox.template }).from(emailOutbox);
    expect(mails.map((m) => m.template)).toEqual(expect.arrayContaining(["payout_requested", "payout_completed"]));
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("Ablehnung und Fehlschlag geben die Reservierung frei; Creator kann zurückziehen", async () => {
    const { admin, creator } = await creatorWithEarnings(400);
    const finance = await createUser({ role: "finance" });
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: VALID_IBAN });
    const first = await requestPayout(actorOf(creator), 150);
    await expect(rejectPayout({ staffUserId: admin.id, payoutId: first.id, reason: "kurz" })).rejects.toMatchObject({ code: "validation" });
    await rejectPayout({ staffUserId: admin.id, payoutId: first.id, reason: "Kontoinhaber stimmt nicht mit Verifizierung überein" });
    expect(await getBalance(creator.id, "creator_earnings")).toBe(300);

    const second = await requestPayout(actorOf(creator), 150);
    await approvePayout({ staffUserId: admin.id, payoutId: second.id, note: "" });
    await processPayout({ staffUserId: finance.id, payoutId: second.id, outcome: "failure", note: "Bank meldet ungültiges Konto (Sandbox)" });
    expect(await getBalance(creator.id, "creator_earnings")).toBe(300);

    const third = await requestPayout(actorOf(creator), 120);
    await cancelPayout(actorOf(creator), third.id);
    expect(await getBalance(creator.id, "creator_earnings")).toBe(300);
    const summary = await getPayoutSummary(creator.id);
    expect(summary.openPayout).toBeNull();
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("parallele Doppelanträge: genau einer wird angenommen (kein negatives Guthaben)", async () => {
    const { creator } = await creatorWithEarnings(400);
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: VALID_IBAN });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => requestPayout(actorOf(creator), 300)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: expect.stringMatching(/conflict|validation|rate_limited/) });
    }
    expect(await getBalance(creator.id, "creator_earnings")).toBe(0);
    const open = await getDb().select().from(payouts).where(eq(payouts.creatorUserId, creator.id));
    expect(open).toHaveLength(1);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("Haltefrist: frische Einnahmen sind noch nicht auszahlbar", async () => {
    const { admin, creator } = await creatorWithEarnings(400);
    await updateSetting({ actorUserId: admin.id, key: "payout", value: { minimumCoins: 100, holdDays: 14, centsPer100Coins: 100, requireFourEyes: true }, reason: "Haltefrist wieder aktivieren" });
    const summary = await getPayoutSummary(creator.id);
    expect(summary.balance).toBe(300);
    expect(summary.available).toBe(0);
    await savePayoutProfile(actorOf(creator), { accountHolder: "Test Creator", iban: VALID_IBAN });
    await expect(requestPayout(actorOf(creator), 150)).rejects.toMatchObject({ code: "validation" });
  });
});
