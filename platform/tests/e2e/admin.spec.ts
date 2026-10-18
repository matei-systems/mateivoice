import { expect, test } from "@playwright/test";
import { login, loginAdmin } from "./helpers";

test.describe("Administration", () => {
  test("Admin-Login erfordert 2FA; Profilprüfung wird protokolliert", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Alle Salden stimmen")).toBeVisible();

    await page.goto("/admin/creators");
    await page.getByRole("link", { name: "Kira" }).click();
    await page.getByRole("button", { name: "Änderungen anfordern" }).click();
    await page.getByLabel("Was muss geändert werden?").fill("Bitte Profiltext ergänzen und präzisieren.");
    await page.getByRole("dialog").getByRole("button", { name: "Anfordern" }).click();
    await expect(page.getByText("Änderungen nötig").first()).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByText("creator.request_changes")).toBeVisible();

    await page.goto("/admin/users");
    await expect(page.getByText("k•••@a•••.test").first()).toBeVisible();
  });

  test("Creator haben keinen Zugriff auf den Adminbereich", async ({ page }) => {
    await login(page, "creator@aurora.test");
    await expect(page).toHaveURL(/\/studio/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
