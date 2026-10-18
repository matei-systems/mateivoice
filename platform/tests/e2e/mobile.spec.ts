import { expect, test } from "@playwright/test";
import { acknowledgeAge, login } from "./helpers";

test.describe("Mobile Darstellung", () => {
  for (const path of ["/", "/creators", "/creators/aria", "/register", "/support"]) {
    test(`kein horizontales Scrollen auf ${path}`, async ({ page, context }) => {
      await acknowledgeAge(context);
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("eigenständige mobile Navigation (Tab-Leiste und Menü)", async ({ page, context }) => {
    await acknowledgeAge(context);
    await page.goto("/");
    const tabBar = page.getByRole("navigation", { name: "Schnellnavigation" });
    await expect(tabBar).toBeVisible();
    await tabBar.getByRole("link", { name: "Live" }).click();
    await expect(page).toHaveURL(/availability=live/);
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile Navigation" })).toBeVisible();
  });

  test("eingeloggte Bereiche ohne horizontales Scrollen", async ({ page, context }) => {
    await acknowledgeAge(context);
    await login(page, "kunde@aurora.test");
    for (const path of ["/account", "/account/wallet", "/account/sessions", "/account/settings", "/account/security"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
