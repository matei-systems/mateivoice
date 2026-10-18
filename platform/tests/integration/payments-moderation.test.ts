import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { coinPackages, creatorProfiles, notifications, paymentOrders, users } from "@/server/db/schema";
import { buildSimulatedEvent, createSimulatedOrder, handlePaymentWebhook } from "@/server/payments/service";
import { getBalance, grantTestCoins, reconcileLedger } from "@/server/ledger/service";
import { requestPayout } from "@/server/payouts/service";
import {
  createAppeal,
  createReport,
  createSanction,
  decideAppeal,
  liftSanction,
  updateReport,
} from "@/server/moderation/service";
import { addUserMessage, createSupportTicket, getTicketForUser } from "@/server/support/service";
import { requestPrivateSession, respondToRequest } from "@/server/video/service";
import { validateSessionToken } from "@/server/auth/session";
import { actorOf, createCreator, createSessionFor, createUser } from "../support/db-helpers";

async function examplePackage() {
  const [pkg] = await getDb()
    .insert(coinPackages)
    .values({ code: `pkg-${Math.random()}`, name: "Beispiel 500", coins: 500, priceCents: 999, currency: "EUR" })
    .returning();
  return pkg!;
}

describe("Simulierter Zahlungsfluss", () => {
  it("Bestätigung schreibt Testmünzen einmalig gut – auch bei doppeltem Webhook", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const pkg = await examplePackage();
    const order = await createSimulatedOrder({ adminUserId: admin.id, customerUserId: customer.id, packageId: pkg.id });
    expect(order.status).toBe("pending");
    expect(order.simulated).toBe(true);

    const { rawBody, signature } = buildSimulatedEvent(order, "payment.confirmed");
    expect(await handlePaymentWebhook(rawBody, signature)).toBe("processed");
    expect(await handlePaymentWebhook(rawBody, signature)).toBe("duplicate");
    // Neues Ereignis gleichen Typs für bereits bestätigte Bestellung → ignoriert
    const second = buildSimulatedEvent(order, "payment.confirmed");
    expect(await handlePaymentWebhook(second.rawBody, second.signature)).toBe("ignored");

    expect(await getBalance(customer.id, "customer_wallet", "TEST_COIN")).toBe(500);
    expect(await getBalance(customer.id, "customer_wallet", "COIN")).toBe(0);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored?.status).toBe("confirmed");
  });

  it("parallele identische Webhooks erzeugen genau eine Gutschrift", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const order = await createSimulatedOrder({ adminUserId: admin.id, customerUserId: customer.id, packageId: (await examplePackage()).id });
    const { rawBody, signature } = buildSimulatedEvent(order, "payment.confirmed");
    const results = await Promise.all(Array.from({ length: 6 }, () => handlePaymentWebhook(rawBody, signature)));
    expect(results.filter((r) => r === "processed")).toHaveLength(1);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
  });

  it("lehnt unsignierte oder manipulierte Webhooks ab", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const order = await createSimulatedOrder({ adminUserId: admin.id, customerUserId: customer.id, packageId: (await examplePackage()).id });
    const { rawBody, signature } = buildSimulatedEvent(order, "payment.confirmed");
    expect(await handlePaymentWebhook(rawBody, null)).toBe("invalid");
    expect(await handlePaymentWebhook(rawBody.replace("payment.confirmed", "payment.failed"), signature)).toBe("invalid");
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
  });

  it("fehlgeschlagene Zahlung schreibt nichts gut; Rückbuchung macht Gutschrift rückgängig", async () => {
    const admin = await createUser({ role: "admin" });
    const customer = await createUser();
    const pkg = await examplePackage();
    const failed = await createSimulatedOrder({ adminUserId: admin.id, customerUserId: customer.id, packageId: pkg.id });
    const failEvent = buildSimulatedEvent(failed, "payment.failed", "Karte abgelehnt (simuliert)");
    await handlePaymentWebhook(failEvent.rawBody, failEvent.signature);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);

    const ok = await createSimulatedOrder({ adminUserId: admin.id, customerUserId: customer.id, packageId: pkg.id });
    const confirm = buildSimulatedEvent(ok, "payment.confirmed");
    await handlePaymentWebhook(confirm.rawBody, confirm.signature);
    const chargeback = buildSimulatedEvent(ok, "payment.charged_back");
    await handlePaymentWebhook(chargeback.rawBody, chargeback.signature);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(0);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("Auszahlungen sind nicht verfügbar", async () => {
    const creator = await createUser({ role: "creator" });
    await expect(requestPayout(creator.id, 100)).rejects.toMatchObject({ code: "feature_unavailable" });
  });
});

describe("Moderation", () => {
  it("Meldung zu möglichen Minderjährigen ist kritisch und benachrichtigt Admins", async () => {
    const admin = await createUser({ role: "admin" });
    const reporter = await createUser();
    const { profile } = await createCreator();
    const report = await createReport(actorOf(reporter), {
      targetType: "creator_profile",
      targetId: profile.id,
      category: "minor_suspected",
      description: "Die Person wirkt deutlich minderjährig.",
    });
    expect(report.priority).toBe("critical");
    const adminNotifications = await getDb().select().from(notifications).where(eq(notifications.userId, admin.id));
    expect(adminNotifications[0]?.title).toContain("KRITISCHE");
  });

  it("fremde private Sitzungen können nicht über Meldungen ausgespäht werden", async () => {
    const customer = await createUser();
    await grantTestCoins(customer.id);
    const { user: creator, profile } = await createCreator();
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    const outsider = await createUser();
    await expect(
      createReport(actorOf(outsider), { targetType: "video_session", targetId: session.id, category: "other", description: "Ich rate eine ID." }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      createReport(actorOf(customer), { targetType: "video_session", targetId: session.id, category: "harassment", description: "Unangemessenes Verhalten." }),
    ).resolves.toBeTruthy();
  });

  it("Sperre: Konto gesperrt, Anmeldungen beendet, Einspruch möglich, Aufhebung stellt wieder her", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    const session = await createSessionFor(target);
    await expect(createSanction(admin.id, { userId: target.id, kind: "suspension", reason: "kurz" })).rejects.toMatchObject({ code: "validation" });
    const sanction = await createSanction(admin.id, { userId: target.id, kind: "suspension", reason: "Wiederholte Belästigung anderer Nutzer" });
    const [suspended] = await getDb().select().from(users).where(eq(users.id, target.id));
    expect(suspended?.status).toBe("suspended");
    expect(await validateSessionToken(session.token)).toBeNull();

    const suspendedActor = { ...actorOf(target), status: "suspended" as const };
    await createAppeal(suspendedActor, { sanctionId: sanction.id, message: "Ich bitte um erneute Prüfung, das war ein Missverständnis." });
    await expect(
      createAppeal(suspendedActor, { sanctionId: sanction.id, message: "Noch ein Einspruch zur selben Maßnahme bitte." }),
    ).rejects.toMatchObject({ code: "conflict" });

    const [appeal] = (await getDb().execute<{ id: string }>(sql`SELECT id FROM appeals`)).rows;
    await decideAppeal({ adminUserId: admin.id, appealId: appeal!.id, decision: "overturned", note: "Missverständnis bestätigt, Sperre aufgehoben" });
    const [restored] = await getDb().select().from(users).where(eq(users.id, target.id));
    expect(restored?.status).toBe("active");
    await expect(liftSanction({ adminUserId: admin.id, sanctionId: sanction.id, reason: "Doppelte Aufhebung testen" })).rejects.toMatchObject({
      code: "conflict",
    });
    const audit = await getDb().execute<{ action: string }>(sql`SELECT action FROM admin_audit_logs ORDER BY id`);
    expect(audit.rows.map((r) => r.action)).toEqual(["sanction.suspension", "appeal.overturned"]);
  });

  it("Admins können nicht sanktioniert werden; Einsprüche nur für eigene Maßnahmen", async () => {
    const admin = await createUser({ role: "admin" });
    const otherAdmin = await createUser({ role: "admin" });
    await expect(createSanction(admin.id, { userId: otherAdmin.id, kind: "suspension", reason: "Admin sperren geht nicht" })).rejects.toMatchObject({
      code: "forbidden",
    });
    const target = await createUser();
    const sanction = await createSanction(admin.id, { userId: target.id, kind: "warning", reason: "Hinweis auf Community-Regeln" });
    const stranger = await createUser();
    await expect(
      createAppeal(actorOf(stranger), { sanctionId: sanction.id, message: "Ich lege für jemand anderen Einspruch ein." }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("Profil ausblenden entfernt es aus der öffentlichen Ansicht", async () => {
    const admin = await createUser({ role: "admin" });
    const { user, profile } = await createCreator();
    await createSanction(admin.id, { userId: user.id, kind: "profile_hidden", reason: "Profiltext verstößt gegen Richtlinien" });
    const [row] = await getDb().select().from(creatorProfiles).where(eq(creatorProfiles.id, profile.id));
    expect(row?.reviewStatus).toBe("suspended");
  });

  it("Abschluss einer Meldung verlangt dokumentierte Begründung", async () => {
    const admin = await createUser({ role: "admin" });
    const reporter = await createUser();
    const { profile } = await createCreator();
    const report = await createReport(actorOf(reporter), { targetType: "creator_profile", targetId: profile.id, category: "spam", description: "Wirbt für externe Seiten." });
    await expect(updateReport({ adminUserId: admin.id, reportId: report.id, status: "no_action", note: "" })).rejects.toMatchObject({ code: "validation" });
    await updateReport({ adminUserId: admin.id, reportId: report.id, status: "no_action", note: "Kein Verstoß gegen die Richtlinien festgestellt" });
  });
});

describe("Support", () => {
  it("Gäste brauchen eine E-Mail; Tickets sind nur für den Inhaber sichtbar", async () => {
    const ctx = { ipHash: "support-ip", userAgent: null };
    await expect(createSupportTicket(null, { category: "account", subject: "Hilfe", message: "Ich komme nicht in mein Konto." }, ctx)).rejects.toMatchObject({
      code: "validation",
    });
    await createSupportTicket(null, { category: "account", subject: "Hilfe", message: "Ich komme nicht in mein Konto.", email: "gast@example.test" }, ctx);

    const owner = await createUser();
    const other = await createUser();
    const ticket = await createSupportTicket(actorOf(owner), { category: "technical", subject: "Fehler", message: "Die Seite lädt nicht richtig." }, ctx);
    expect(await getTicketForUser(owner.id, ticket.id)).not.toBeNull();
    expect(await getTicketForUser(other.id, ticket.id)).toBeNull();
    await expect(addUserMessage(other.id, ticket.id, "Fremde Nachricht")).rejects.toMatchObject({ code: "not_found" });
  });
});
