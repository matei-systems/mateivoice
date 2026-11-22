import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/config/env";
import { getDb } from "@/server/db/client";
import { adminAuditLogs, authSessions, emailOutbox, paymentOrders, users } from "@/server/db/schema";
import { createAuthSession } from "@/server/auth/session";
import { deliverQueuedEmails, queueEmail, resetEmailTransportForTests, createUnsubscribeToken, unsubscribe } from "@/server/email/service";
import { createCheckout } from "@/server/payments/service";
import { verotelSignature } from "@/server/payments/verotel";
import { closeRealtimeHub, publish, sessionTopic, subscribe } from "@/server/realtime/hub";
import { DEFAULT_SETTINGS, getSettingHistory, updateSetting } from "@/server/settings/service";
import { acceptStaffInvite, changeStaffRole, inviteStaff, setStaffActive } from "@/server/staff/service";
import { getBalance } from "@/server/ledger/service";
import { actorOf, createUser } from "../support/db-helpers";
import { createPackage, getWebhook } from "../support/payments";
import { startSmtpSink } from "../support/smtp-sink";

const ENV_KEYS = ["EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "EMAIL_FROM", "PAYMENT_PROVIDER", "VEROTEL_SHOP_ID", "VEROTEL_SIGNATURE_KEY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetEnvCacheForTests();
  resetEmailTransportForTests();
});

describe("Plattform-Einstellungen", () => {
  it("Änderungen brauchen Begründung, werden validiert, historisiert und protokolliert", async () => {
    const admin = await createUser({ role: "admin" });
    await expect(updateSetting({ actorUserId: admin.id, key: "commission", value: { platformBps: 2000 }, reason: "kurz" })).rejects.toMatchObject({ code: "validation" });
    await expect(updateSetting({ actorUserId: admin.id, key: "commission", value: { platformBps: 9000 }, reason: "Viel zu hohe Provision testen" })).rejects.toMatchObject({ code: "validation" });
    await updateSetting({ actorUserId: admin.id, key: "commission", value: { platformBps: 2000 }, reason: "Aktion für neue Creator" });
    const [entry] = await getSettingHistory("commission");
    expect(entry).toMatchObject({ value: { platformBps: 2000 }, previousValue: DEFAULT_SETTINGS.commission, reason: "Aktion für neue Creator" });
    const audit = await getDb().select().from(adminAuditLogs).where(eq(adminAuditLogs.action, "settings.update"));
    expect(audit).toHaveLength(1);
    await expect(getDb().execute(sql`UPDATE platform_settings_history SET reason = 'x'`)).rejects.toThrow();
  });
});

describe("Mitarbeiterverwaltung", () => {
  it("Einladung → eigenes Passwort; Rollenwechsel beendet Sitzungen; letzter Admin bleibt", async () => {
    const admin = await createUser({ role: "admin" });
    await inviteStaff({ adminUserId: admin.id, adminUsername: "admin", raw: { email: "neu.mod@example.test", username: "neu_mod", role: "moderator" } });
    await expect(inviteStaff({ adminUserId: admin.id, adminUsername: "admin", raw: { email: "neu.mod@example.test", username: "anderer", role: "moderator" } })).rejects.toMatchObject({ code: "conflict" });
    const [mail] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.template, "staff_invite"));
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail!.bodyText!)![1]!;
    await expect(acceptStaffInvite({ token, password: "Kurz", passwordConfirm: "Kurz" })).rejects.toMatchObject({ code: "validation" });
    await acceptStaffInvite({ token, password: "Ein-langes-Mod-Passwort-9", passwordConfirm: "Ein-langes-Mod-Passwort-9" });
    await expect(acceptStaffInvite({ token, password: "Ein-langes-Mod-Passwort-9", passwordConfirm: "Ein-langes-Mod-Passwort-9" })).rejects.toMatchObject({ code: "invalid_state" });
    const [mod] = await getDb().select().from(users).where(eq(users.username, "neu_mod"));
    expect(mod?.passwordHash).toBeTruthy();
    expect(mod?.totpEnabledAt).toBeNull(); // 2FA muss beim ersten Login eingerichtet werden

    await createAuthSession(getDb(), { userId: mod!.id, role: "moderator", mfaVerified: false });
    await expect(changeStaffRole({ adminUserId: admin.id, userId: mod!.id, role: "finance", reason: "kurz" })).rejects.toMatchObject({ code: "validation" });
    await changeStaffRole({ adminUserId: admin.id, userId: mod!.id, role: "finance", reason: "Wechsel ins Finanzteam" });
    expect(await getDb().select().from(authSessions).where(eq(authSessions.userId, mod!.id))).toHaveLength(0);

    await expect(changeStaffRole({ adminUserId: admin.id, userId: admin.id, role: "support", reason: "Eigene Rolle ändern" })).rejects.toMatchObject({ code: "forbidden" });
    const second = await createUser({ role: "admin" });
    await setStaffActive({ adminUserId: second.id, userId: admin.id, active: false, reason: "Urlaubsvertretung beendet" });
    await expect(setStaffActive({ adminUserId: mod!.id, userId: second.id, active: false, reason: "Letzten Admin deaktivieren" })).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("E-Mail-Versand (SMTP gegen lokalen Testempfänger)", () => {
  it("versendet eingereihte Nachrichten, löscht danach den Inhalt und respektiert Abmeldungen", async () => {
    const sink = await startSmtpSink();
    try {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_PORT = String(sink.port);
      process.env.EMAIL_FROM = "noreply@example.test";
      resetEnvCacheForTests();
      resetEmailTransportForTests();
      const user = await createUser();
      await queueEmail({ userId: user.id, template: "payment_confirmed", data: { coins: 500, price: "9,99 €", simulated: true, orderId: "00000000-0000-4000-8000-000000000000" } });
      const result = await deliverQueuedEmails();
      expect(result).toEqual({ sent: 1, failed: 0, retried: 0 });
      expect(sink.messages).toHaveLength(1);
      expect(sink.messages[0]!.from).toContain("noreply@example.test");
      expect(sink.messages[0]!.data).toMatch(/Subject: .*Kaufbest/);
      expect(sink.messages[0]!.data).toContain("text/html");
      const [row] = await getDb().select().from(emailOutbox);
      expect(row).toMatchObject({ status: "sent", bodyText: null, bodyHtml: null });

      // Abmeldung optionaler Kategorie (marketing/session_updates)
      const token = createUnsubscribeToken(user.id, "session_updates");
      expect(await unsubscribe(token)).toBe(true);
      expect(await unsubscribe(`${token}x`)).toBe(false);
    } finally {
      await sink.close();
    }
  });

  it("Zustellfehler werden mit Backoff wiederholt", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // nicht erreichbar
    process.env.EMAIL_FROM = "noreply@example.test";
    resetEnvCacheForTests();
    resetEmailTransportForTests();
    const user = await createUser();
    await queueEmail({ userId: user.id, template: "welcome", data: { username: "test", role: "customer" } });
    const result = await deliverQueuedEmails();
    expect(result.retried).toBe(1);
    const [row] = await getDb().select().from(emailOutbox);
    expect(row?.status).toBe("queued");
    expect(row?.attempts).toBe(1);
    expect(row?.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Verotel FlexPay (Adapter, ohne Händlerkonto)", () => {
  function useVerotel() {
    process.env.PAYMENT_PROVIDER = "verotel";
    process.env.VEROTEL_SHOP_ID = "123456";
    process.env.VEROTEL_SIGNATURE_KEY = "test-signature-key-only";
    resetEnvCacheForTests();
  }

  it("Echtzahlungen bleiben gesperrt – kein Checkout möglich", async () => {
    useVerotel();
    const customer = await createUser();
    const pkg = await createPackage();
    await expect(createCheckout(actorOf(customer), pkg.id)).rejects.toMatchObject({ code: "feature_unavailable" });
  });

  it("Postback: Signatur wird geprüft, Antwort ist „OK“, Betrag muss stimmen", async () => {
    // Bestellung im Sandbox-Modus anlegen, dann als Verotel-Bestellung markieren (Adapter-Test ohne Geldfluss)
    const customer = await createUser();
    const pkg = await createPackage({ priceCents: 999, coins: 500 });
    const { order } = await createCheckout(actorOf(customer), pkg.id);
    await getDb().update(paymentOrders).set({ provider: "verotel", providerReference: null }).where(eq(paymentOrders.id, order.id));
    useVerotel();
    const params: Record<string, string> = { shopID: "123456", saleID: "777001", referenceID: order.id, priceAmount: "9.99", priceCurrency: "EUR", type: "purchase", paymentMethod: "CC" };
    const unsigned = new URLSearchParams(params);
    expect((await getWebhook("verotel", unsigned)).status).toBe(400);
    const signed = new URLSearchParams({ ...params, signature: verotelSignature("test-signature-key-only", params) });
    expect(await getWebhook("verotel", signed)).toEqual({ status: 200, body: "OK" });
    expect(await getWebhook("verotel", signed)).toEqual({ status: 200, body: "OK" }); // Duplikat → trotzdem OK
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
    const [stored] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, order.id));
    expect(stored).toMatchObject({ status: "confirmed", providerReference: "777001" });
    // Fremder Shop wird abgewiesen
    const foreign = { ...params, shopID: "999999", saleID: "777002" };
    expect((await getWebhook("verotel", new URLSearchParams({ ...foreign, signature: verotelSignature("test-signature-key-only", foreign) }))).status).toBe(400);
  });
});

describe("Echtzeit-Kanal (LISTEN/NOTIFY)", () => {
  it("stellt Ereignisse erst nach dem Commit zu – zurückgerollte nie", async () => {
    const received: string[] = [];
    const topic = sessionTopic("00000000-0000-4000-8000-00000000abcd");
    const unsubscribeFn = await subscribe(topic, (event) => received.push(event.id ?? ""));
    try {
      await getDb()
        .transaction(async (tx) => {
          await publish(tx, { topic, type: "chat.message", id: "rolled-back" });
          throw new Error("Abbruch");
        })
        .catch(() => undefined);
      await getDb().transaction(async (tx) => {
        await publish(tx, { topic, type: "chat.message", id: "committed" });
      });
      const deadline = Date.now() + 3000;
      while (received.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      expect(received).toEqual(["committed"]);
    } finally {
      unsubscribeFn();
      await closeRealtimeHub();
    }
  });
});
