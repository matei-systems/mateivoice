import { expect, test } from "@playwright/test";
import { acknowledgeAge, db, latestMailLink, login, loginStaff } from "./helpers";

test.describe("Mitarbeiterbereich: Rollen, Einladung, Wartungsmodus", () => {
  test("Moderation sieht nur ihre Bereiche (minimale Rechte)", async ({ page }) => {
    await loginStaff(page, "moderation@aurora.test");
    const nav = page.getByRole("navigation", { name: "Mitarbeiterbereich – Navigation" });
    await expect(nav.getByRole("link", { name: "Meldungen" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Auszahlungen" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Einstellungen" })).toHaveCount(0);
    await page.goto("/admin/payouts");
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto("/admin/streams");
    await expect(page.getByRole("heading", { name: "Live & Sitzungen" })).toBeVisible();
  });

  test("Support: Datenschutzanfragen ja, Finanzen nein", async ({ page }) => {
    await loginStaff(page, "support@aurora.test");
    await page.goto("/admin/privacy");
    await expect(page.getByRole("heading", { name: "Datenschutzanfragen" })).toBeVisible();
    await page.goto("/admin/finance");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("Einladung: eigenes Passwort, danach ist 2FA verpflichtend", async ({ page, browser }) => {
    await loginStaff(page, "admin@aurora.test");
    await page.goto("/admin/staff");
    const email = `mod-${Date.now()}@example.test`;
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page.getByLabel("Nutzername").fill(`mod_${Date.now().toString().slice(-6)}`);
    await page.getByLabel("Rolle", { exact: true }).selectOption("moderator");
    await page.getByRole("button", { name: "Einladung senden" }).click();
    await expect(page.getByText("Einladung offen").first()).toBeVisible();

    const invited = await browser.newContext();
    const invitePage = await invited.newPage();
    await invitePage.goto(await latestMailLink(email, "staff_invite"));
    await invitePage.getByLabel("Neues Passwort").fill("Ein-langes-Einladungs-Passwort-1");
    await invitePage.getByLabel("Passwort wiederholen").fill("Ein-langes-Einladungs-Passwort-1");
    await invitePage.getByRole("button", { name: "Passwort festlegen" }).click();
    await expect(invitePage).toHaveURL(/\/login\?invited=1/);
    await login(invitePage, email, "Ein-langes-Einladungs-Passwort-1");
    await expect(invitePage).toHaveURL(/\/account\/security\?mfa=required/);
    await invited.close();
  });

  test("Wartungsmodus sperrt Gäste und Kunden, Mitarbeiter arbeiten weiter", async ({ page, browser }) => {
    await loginStaff(page, "admin@aurora.test");
    await page.goto("/admin/settings");
    const card = page.locator("#maintenance");
    await card.getByLabel("Wartungsmodus aktiv").check();
    await card.getByLabel("Hinweistext").fill("E2E-Wartungsfenster");
    await card.getByLabel("Begründung der Änderung").fill("E2E-Test des Wartungsmodus");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Einstellung gespeichert").first()).toBeVisible();

    const guest = await browser.newContext();
    await acknowledgeAge(guest);
    const guestPage = await guest.newPage();
    await guestPage.goto("/creators");
    await expect(guestPage.getByRole("heading", { name: "Wartungsarbeiten" })).toBeVisible();
    await expect(guestPage.getByText("E2E-Wartungsfenster")).toBeVisible();
    await guest.close();

    await page.goto("/admin");
    await expect(page.getByText("Wartungsmodus aktiv").first()).toBeVisible();
    await page.goto("/admin/settings");
    await card.getByLabel("Wartungsmodus aktiv").uncheck();
    await card.getByLabel("Begründung der Änderung").fill("Wartung beendet (E2E-Test)");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Einstellung gespeichert").first()).toBeVisible();
    const history = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM platform_settings_history WHERE key = 'maintenance'");
    expect(history.rows[0]?.n).toBe(2);
  });
});
