import { expect, test } from "@playwright/test";
import { acknowledgeAge, db, formAlert, latestMailLink, login } from "./helpers";

test.describe("Kunde", () => {
  test("Registrierung, E-Mail-Bestätigung, Anmeldung und Testguthaben", async ({ page, context }) => {
    await acknowledgeAge(context);
    const email = `neu-${Date.now()}@example.test`;
    await page.goto("/register");
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page.getByLabel("Nutzername").fill(`neu_${Date.now().toString().slice(-8)}`);
    await page.getByLabel("Passwort").fill("Ein-sehr-sicheres-Passwort-7");
    await page.getByLabel(/mindestens 18 Jahre/).check();
    await page.getByLabel(/Nutzungsbedingungen/).check();
    await page.getByLabel(/Datenschutzinformation/).check();
    await page.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(page).toHaveURL(/\/verify-email\/sent/);
    await expect(page.getByText("Testmodus: Es werden keine echten E-Mails versendet")).toBeVisible();

    await page.goto(await latestMailLink(email, "email_verification"));
    await page.getByRole("button", { name: "E-Mail-Adresse bestätigen" }).click();
    await expect(page.getByRole("heading", { name: "E-Mail bestätigt" })).toBeVisible();

    await login(page, email, "Ein-sehr-sicheres-Passwort-7");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hallo");

    await page.getByRole("button", { name: "Testguthaben anfordern" }).click();
    await expect(page.getByText("500 Testmünzen gutgeschrieben")).toBeVisible();
    await page.goto("/account/wallet");
    await expect(page.getByText("Testguthaben erstellt").first()).toBeVisible();
    await page.getByRole("button", { name: /Testmünzen anfordern/ }).click();
    await expect(formAlert(page)).toContainText("heute bereits Testguthaben erhalten");
    // Münzpakete sind nur Beispiele und nicht kaufbar
    await expect(page.getByRole("button", { name: /Noch nicht verfügbar/ }).first()).toBeDisabled();
  });

  test("falsches Passwort zeigt neutrale Fehlermeldung", async ({ page }) => {
    await login(page, "kunde@aurora.test", "falsches-passwort-123", { expectSuccess: false });
    await expect(formAlert(page)).toContainText("E-Mail-Adresse oder Passwort ist nicht korrekt.");
  });

  test("Kunden haben keinen Zugriff auf Admin- und Creator-Bereich", async ({ page }) => {
    await login(page, "kunde@aurora.test");
    await expect(page).toHaveURL(/\/account/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/forbidden/);
  });

  test("fremde Sitzungen sind nicht einsehbar", async ({ page }) => {
    await login(page, "kunde.unbestaetigt@aurora.test");
    const result = await db().query<{ id: string }>("SELECT id FROM video_sessions WHERE kind = 'private_chat' LIMIT 1");
    const sessionId = result.rows[0]!.id;
    const response = await page.goto(`/sessions/${sessionId}`);
    expect(response?.status()).toBe(404);
  });

  test("Datenexport liefert nur eigene Daten", async ({ page }) => {
    await login(page, "kunde@aurora.test");
    const response = await page.request.get("/account/export");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.account.email).toBe("kunde@aurora.test");
    expect(JSON.stringify(data)).not.toContain("passwordHash");
    expect(JSON.stringify(data)).not.toContain("scrypt$");
  });
});
