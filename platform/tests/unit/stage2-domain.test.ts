import { describe, expect, it } from "vitest";
import { buildVerotelPurchaseUrl, formatVerotelAmount, parseVerotelAmount, parseVerotelPostback, verifyVerotelSignature, verotelSignature } from "@/server/payments/verotel";
import { signSandboxPayload, verifySandboxSignature } from "@/server/payments/provider";
import { maskIban, validateIban } from "@/lib/iban";
import { escapeHtml, renderEmail, templateCategory, type EmailTemplateKey } from "@/server/email/templates";
import { parseSettingForm } from "@/lib/settings-fields";
import { containsContactInfo, sanitizeChatBody } from "@/server/chat/service";
import { csvCell, monthPeriod } from "@/server/finance/reports";
import { hasPermission, permissionsFor, type Actor, type Role } from "@/server/auth/permissions";
import { evaluateAgeAccess } from "@/server/age/service";
import { settingsSchemas, DEFAULT_SETTINGS } from "@/server/settings/service";

describe("Verotel FlexPay – offizielles Signaturbeispiel", () => {
  // Quelle: controlcenter.verotel.com/flexpay-doc/purchase.html („Signature calculation“, Beispiel)
  const key = "BddJxtUBkDgFB9kj7Zwguxde4gAqha";
  const params = { custom1: "xxyyzz", description: "Super video download", priceAmount: "9.99", priceCurrency: "USD", shopID: "64233", type: "purchase", version: "4" };

  it("berechnet exakt die dokumentierte SHA-256-Signatur", () => {
    expect(verotelSignature(key, params)).toBe("ccaf2357fe330654322a1b0f3f92984b3fe2a1462d6fc5082650a00c5ada2f2a");
  });

  it("ignoriert leere Werte sowie email/oneClickToken; Reihenfolge der Eingabe egal", () => {
    const shuffled = { version: "4", type: "purchase", shopID: "64233", priceCurrency: "USD", priceAmount: "9.99", description: "Super video download", custom1: "xxyyzz", custom2: "", email: "a@b.c", oneClickToken: "x" };
    expect(verotelSignature(key, shuffled)).toBe(verotelSignature(key, params));
  });

  it("prüft Postback-Signaturen und lehnt Manipulation ab", () => {
    const query = new URLSearchParams({ ...params, saleID: "1", referenceID: "ref" });
    query.set("signature", verotelSignature(key, Object.fromEntries(query)));
    expect(verifyVerotelSignature(key, query)).toBe(true);
    query.set("priceAmount", "0.01");
    expect(verifyVerotelSignature(key, query)).toBe(false);
    expect(verifyVerotelSignature(key, new URLSearchParams({ shopID: "1" }))).toBe(false);
  });

  it("baut die Start-URL mit Version 4 und gültiger Signatur", () => {
    const url = new URL(buildVerotelPurchaseUrl({ startUrl: "https://secure.verotel.com/startorder", shopId: "64233", signatureKey: key, priceCents: 999, currency: "EUR", description: "500 Münzen", referenceId: "abc" }));
    expect(url.origin + url.pathname).toBe("https://secure.verotel.com/startorder");
    expect(url.searchParams.get("version")).toBe("4");
    expect(url.searchParams.get("priceAmount")).toBe("9.99");
    const signature = url.searchParams.get("signature");
    url.searchParams.delete("signature");
    expect(signature).toBe(verotelSignature(key, Object.fromEntries(url.searchParams)));
  });

  it("Betragsformat ohne Gleitkomma", () => {
    expect(formatVerotelAmount(999)).toBe("9.99");
    expect(formatVerotelAmount(100000)).toBe("1000.00");
    expect(parseVerotelAmount("9.99")).toBe(999);
    expect(parseVerotelAmount("10")).toBe(1000);
    expect(parseVerotelAmount("10.5")).toBe(1050);
    expect(parseVerotelAmount("1e3")).toBeNull();
    expect(() => formatVerotelAmount(0)).toThrow();
  });

  it("wertet Kauf-, Gutschrift- und Chargeback-Postbacks aus", () => {
    expect(parseVerotelPostback(new URLSearchParams({ shopID: "1", saleID: "2", referenceID: "r", type: "purchase", priceAmount: "9.99", priceCurrency: "EUR" }))).toMatchObject({ kind: "purchase", amountCents: 999 });
    expect(parseVerotelPostback(new URLSearchParams({ shopID: "1", saleID: "2", referenceID: "r", event: "credit", transactionID: "9" }))).toMatchObject({ kind: "credit", transactionId: "9" });
    expect(parseVerotelPostback(new URLSearchParams({ shopID: "1", saleID: "2", referenceID: "r", event: "chargeback" }))).toBeNull(); // ohne transactionID
    expect(parseVerotelPostback(new URLSearchParams({ shopID: "1", saleID: "2", referenceID: "r", event: "unknown", transactionID: "9" }))).toBeNull();
  });
});

describe("Sandbox-Signaturen", () => {
  it("akzeptiert frische, gültige Signaturen und lehnt alte oder fremde ab", () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ a: 1 });
    expect(verifySandboxSignature(body, signSandboxPayload(body, now), now)).toBe(true);
    expect(verifySandboxSignature(body, signSandboxPayload(body, now - 301), now)).toBe(false);
    expect(verifySandboxSignature(`${body} `, signSandboxPayload(body, now), now)).toBe(false);
    expect(verifySandboxSignature(body, null, now)).toBe(false);
    expect(verifySandboxSignature(body, "t=123,v1=abc", now)).toBe(false);
  });
});

describe("IBAN", () => {
  it("prüft Länge und Prüfziffer (Mod 97)", () => {
    expect(validateIban("AT61 1904 3002 3457 3201")).toEqual({ valid: true, iban: "AT611904300234573201", country: "AT" });
    expect(validateIban("de89 3704 0044 0532 0130 00")).toMatchObject({ valid: true, country: "DE" });
    expect(validateIban("CH93 0076 2011 6238 5295 7")).toMatchObject({ valid: true, country: "CH" });
    expect(validateIban("AT61 1904 3002 3457 3202")).toMatchObject({ valid: false });
    expect(validateIban("AT61 1904 3002 3457 320")).toMatchObject({ valid: false });
    expect(validateIban("US12 3456 7890 1234 5678 90")).toMatchObject({ valid: false });
    expect(maskIban("AT611904300234573201")).toBe("AT61 •••• •••• •••• 3201");
  });
});

describe("E-Mail-Vorlagen", () => {
  const ctx = { appUrl: "https://example.test", brandName: "Project Aurora" };
  const samples: { [K in EmailTemplateKey]: Parameters<typeof renderEmail<K>>[1] } = {
    email_verification: { token: "abc" },
    password_reset: { token: "abc" },
    registration_attempt_existing: {},
    password_changed: {},
    welcome: { username: "anna", role: "customer" },
    security_notice: { kind: "mfa_enabled" },
    creator_application_received: { displayName: "Anna" },
    creator_review_result: { decision: "request_changes", note: "Bitte Bio ergänzen" },
    creator_verification_status: { status: "test_passed" },
    payment_confirmed: { coins: 500, price: "9,99 €", simulated: true, orderId: "o1" },
    payment_refunded: { coins: 500, price: "9,99 €", simulated: false, orderId: "o1" },
    payout_requested: { coins: 1000, amount: "10,00 €", simulated: true },
    payout_completed: { coins: 1000, amount: "10,00 €", simulated: true, reference: "r1" },
    payout_rejected: { coins: 1000, reason: "Konto ungültig", simulated: true },
    support_ticket_received: { subject: "Hilfe", ticketId: "12345678-aaaa" },
    account_suspended: { statement: "Verstoß gegen Regel 2", until: null },
    staff_invite: { token: "t", roleLabel: "Moderation", invitedBy: "admin" },
  };

  it("alle Vorlagen liefern Betreff, Text und HTML mit absoluten Links", () => {
    for (const key of Object.keys(samples) as EmailTemplateKey[]) {
      const mail = renderEmail(key, samples[key] as never, ctx);
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.text).toContain("Hallo");
      expect(mail.html).toContain("<!doctype html>");
      expect(mail.html).not.toContain("undefined");
      for (const match of mail.html.matchAll(/href="([^"]+)"/g)) expect(match[1]).toMatch(/^https:\/\/example\.test\//);
    }
  });

  it("maskiert eingesetzte Werte im HTML und kennzeichnet Testvorgänge", () => {
    const mail = renderEmail("creator_review_result", { decision: "suspend", note: '<script>alert("x")</script>' }, ctx);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(renderEmail("payment_confirmed", samples.payment_confirmed, ctx).text).toContain("KEIN echtes Geld");
    expect(escapeHtml(`a&"'<>`)).toBe("a&amp;&quot;&#39;&lt;&gt;");
  });

  it("Abmeldelink nur bei optionalen Kategorien", () => {
    expect(templateCategory("password_reset")).toBe("security");
    const withLink = renderEmail("welcome", samples.welcome, { ...ctx, unsubscribePath: "/unsubscribe?token=x" });
    expect(withLink.text).toContain("Abmelden: https://example.test/unsubscribe?token=x");
    expect(renderEmail("welcome", samples.welcome, ctx).text).not.toContain("Abmelden");
  });
});

describe("Einstellungsformular", () => {
  it("baut Werte aus Formularfeldern, die das Schema validiert", () => {
    const form = new Map<string, string>([
      ["allowedCountries", "at, de;ch"],
      ["policy.AT", "verified"],
      ["policy.DE", "verified"],
      ["policy.CH", "self_declaration"],
      ["defaultPolicy", "verified"],
    ]);
    const value = parseSettingForm("ageAssurance", { get: (name: string) => form.get(name) ?? null });
    expect(value).toEqual({ allowedCountries: ["AT", "DE", "CH"], policy: { AT: "verified", DE: "verified", CH: "self_declaration" }, defaultPolicy: "verified" });
    expect(settingsSchemas.ageAssurance.safeParse(value).success).toBe(true);
    const bad = parseSettingForm("commission", { get: () => "25%" });
    expect(settingsSchemas.commission.safeParse(bad).success).toBe(false);
  });

  it("Standardwerte erfüllen alle Schemas (25 % Plattform / 75 % Model)", () => {
    for (const [key, schema] of Object.entries(settingsSchemas)) {
      expect(schema.safeParse(DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS]).success, key).toBe(true);
    }
    expect(DEFAULT_SETTINGS.commission.platformBps).toBe(2500);
  });
});

describe("Chat-Filter", () => {
  it("erkennt Links und Kontaktdaten, lässt normale Sätze zu", () => {
    for (const text of ["www.test.at", "https://x.y", "mail@test.de", "+43 660 1234567", "meine nummer 0660/1234567", "insta: anna", "kontakt via WhatsApp"]) {
      expect(containsContactInfo(text), text).toBe(true);
    }
    for (const text of ["Hallo, wie geht's?", "Ich bin 25 und mag Musik", "Danke für den Stream!"]) {
      expect(containsContactInfo(text), text).toBe(false);
    }
  });

  it("entfernt Steuer- und Richtungszeichen und begrenzt die Länge", () => {
    expect(sanitizeChatBody("a‮b\u0007c", 100)).toBe("a b c");
    expect(() => sanitizeChatBody("   ", 100)).toThrow();
    expect(() => sanitizeChatBody("x".repeat(101), 100)).toThrow();
  });
});

describe("Finanzberichte", () => {
  it("CSV-Zellen sind gegen Formel-Injektion geschützt", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(-50)).toBe("-50");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell(null)).toBe("");
  });

  it("Monatszeiträume", () => {
    const period = monthPeriod("2026-02");
    expect(period.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(monthPeriod("kaputt", new Date("2026-11-22T10:00:00Z")).month).toBe("2026-11");
  });
});

describe("Rollenmodell (minimale Rechte)", () => {
  const actor = (role: Role, overrides: Partial<Actor> = {}): Actor => ({ id: "u", role, status: "active", emailVerified: true, ...overrides });

  it("Moderation, Support und Finanzen haben nur ihre Bereiche", () => {
    expect(hasPermission(actor("moderator"), "admin.reports.manage")).toBe(true);
    expect(hasPermission(actor("moderator"), "admin.payouts.manage")).toBe(false);
    expect(hasPermission(actor("moderator"), "admin.users.reveal_pii")).toBe(false);
    expect(hasPermission(actor("support"), "admin.users.reveal_pii")).toBe(true);
    expect(hasPermission(actor("support"), "admin.ledger.view")).toBe(false);
    expect(hasPermission(actor("finance"), "admin.payouts.manage")).toBe(true);
    expect(hasPermission(actor("finance"), "admin.reports.manage")).toBe(false);
    expect(hasPermission(actor("finance"), "admin.settings.manage")).toBe(false);
    expect(hasPermission(actor("admin"), "admin.staff.manage")).toBe(true);
    for (const role of ["moderator", "support", "finance"] as const) {
      expect(hasPermission(actor(role), "admin.staff.manage"), role).toBe(false);
      expect(hasPermission(actor(role), "admin.settings.manage"), role).toBe(false);
    }
  });

  it("Mitarbeiter kaufen, chatten oder geben kein Trinkgeld; Kunden brauchen bestätigte E-Mail", () => {
    for (const role of ["admin", "moderator", "support", "finance"] as const) {
      expect(hasPermission(actor(role), "wallet.purchase")).toBe(false);
      expect(hasPermission(actor(role), "tips.send")).toBe(false);
      expect(hasPermission(actor(role), "chat.participate")).toBe(false);
    }
    expect(hasPermission(actor("customer"), "wallet.purchase")).toBe(true);
    expect(hasPermission(actor("customer", { emailVerified: false }), "wallet.purchase")).toBe(false);
    expect(hasPermission(actor("customer", { emailVerified: false }), "tips.send")).toBe(false);
    expect(hasPermission(actor("customer", { status: "suspended" }), "chat.participate")).toBe(false);
    expect(hasPermission(actor("creator"), "studio.payouts.manage")).toBe(true);
    expect(hasPermission(actor("creator"), "tips.send")).toBe(false);
    expect(permissionsFor(actor("customer")).some((p) => p.startsWith("admin."))).toBe(false);
  });
});

describe("Altersprüfung (Entscheidungslogik)", () => {
  it("nur echte Verifizierung bzw. Mock-Ergebnis im Testmodus", () => {
    const base = { policy: "verified" as const, expiresAt: null };
    expect(evaluateAgeAccess({ ...base, status: "verified", provider: "provider-x", testMode: false }).allowed).toBe(true);
    expect(evaluateAgeAccess({ ...base, status: "test_passed", provider: "mock", testMode: false }).allowed).toBe(false);
    expect(evaluateAgeAccess({ ...base, status: "test_passed", provider: "mock", testMode: true })).toMatchObject({ allowed: true, simulated: true });
    expect(evaluateAgeAccess({ ...base, status: "verified", provider: "mock", testMode: true }).allowed).toBe(false);
    expect(evaluateAgeAccess({ ...base, status: "pending", provider: "provider-x", testMode: false }).allowed).toBe(false);
    expect(evaluateAgeAccess({ policy: "verified", status: "verified", provider: "x", expiresAt: new Date(Date.now() - 1000), testMode: false }).allowed).toBe(false);
    expect(evaluateAgeAccess({ policy: "self_declaration", status: null, provider: null, expiresAt: null, testMode: false }).allowed).toBe(true);
  });
});
