import { expect, test } from "@playwright/test";
import { acknowledgeAge } from "./helpers";

test.describe("Öffentliche Seiten", () => {
  test("Gäste sehen den Altershinweis; nach Bestätigung ist die Startseite bedienbar", async ({ page }) => {
    await page.goto("/");
    const gate = page.getByRole("dialog", { name: "Nur für Erwachsene" });
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("keine Altersverifikation");
    await page.getByRole("button", { name: "Ich bin 18 oder älter" }).click();
    await expect(gate).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Echte Begegnungen");
  });

  test("Startseite zeigt Testmodus, Live-Bereich und Creator-Karten", async ({ page, context }) => {
    await acknowledgeAge(context);
    await page.goto("/");
    await expect(page.getByText("Testmodus: keine echten Zahlungen")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jetzt live dabei sein" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Profil von .* ansehen/ }).first()).toBeVisible();
    // Testprofile sind gekennzeichnet; nichts erscheint fälschlich als „Verifiziert“.
    await expect(page.getByText("Testprofil").first()).toBeVisible();
    await expect(page.getByText("Verifiziert", { exact: true })).toHaveCount(0);
  });

  test("Suche, Filter und leerer Zustand", async ({ page, context }) => {
    await acknowledgeAge(context);
    await page.goto("/creators");
    await page.getByPlaceholder("Name oder Thema suchen …").fill("Bella");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(/q=Bella/);
    await expect(page.getByText("1 Creator gefunden")).toBeVisible();
    await page.goto("/creators?q=gibtesnicht");
    await expect(page.getByRole("heading", { name: "Keine passenden Creator gefunden" })).toBeVisible();
    await page.getByRole("link", { name: "Filter zurücksetzen" }).first().click();
    await expect(page).toHaveURL(/\/creators$/);
    await page.getByRole("tab", { name: "Live" }).click();
    await expect(page.getByRole("heading", { name: "Jetzt live" })).toBeVisible();
  });

  test("Profilseite zeigt Preis, ehrlichen Verifizierungsstatus und Melden", async ({ page, context }) => {
    await acknowledgeAge(context);
    await page.goto("/creators/aria");
    await expect(page.getByRole("heading", { level: 1, name: "Aria" })).toBeVisible();
    await expect(page.getByText("Nicht verifiziert (Testmodus)").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Anmelden, um anzufragen" })).toBeVisible();
    await page.getByRole("button", { name: "Melden" }).click();
    await expect(page.getByRole("dialog")).toContainText("Zum Melden ist eine Anmeldung erforderlich");
  });

  test("nicht freigegebene Profile sind für Gäste nicht erreichbar", async ({ page, context }) => {
    await acknowledgeAge(context);
    const response = await page.goto("/creators/lea-entwurf");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Profil nicht gefunden" })).toBeVisible();
  });

  test("Rechtstexte sind deutlich als Entwurf gekennzeichnet", async ({ page }) => {
    for (const path of ["/legal/terms", "/legal/privacy", "/legal/imprint", "/legal/creator-agreement"]) {
      await page.goto(path);
      await expect(page.getByText("ENTWURF – rechtlich nicht geprüft")).toBeVisible();
    }
  });

  test("Sicherheitsheader und Indexierungsschutz", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
    const account = await request.get("/login");
    expect(account.headers()["x-robots-tag"]).toContain("noindex");
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");
  });

  test("geschützte Bereiche leiten Gäste zur Anmeldung", async ({ page }) => {
    for (const path of ["/account", "/studio", "/admin", "/account/wallet"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("Support-Formular speichert Anfragen ehrlich", async ({ page }) => {
    await page.goto("/support");
    await page.getByLabel("E-Mail-Adresse für Rückfragen").fill("gast@example.test");
    await page.getByLabel("Thema").selectOption("technical");
    await page.getByLabel("Betreff").fill("Testanfrage");
    await page.getByLabel("Nachricht").fill("Die Seite lädt bei mir sehr langsam.");
    await page.getByRole("button", { name: "Anfrage senden" }).click();
    await expect(page.getByRole("status")).toContainText("E-Mail-Benachrichtigungen sind noch nicht aktiv");
  });
});
