import { expect, test } from "@playwright/test";
import { acknowledgeAge, db, login } from "./helpers";

test("privater Chat: Anfrage, Annahme, Beitritt, Abrechnung und Ende", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const creatorContext = await browser.newContext();
  await acknowledgeAge(customerContext);
  const customer = await customerContext.newPage();
  const creator = await creatorContext.newPage();

  const before = await db().query<{ balance: string }>(
    "SELECT a.balance FROM ledger_accounts a JOIN users u ON u.id = a.owner_user_id WHERE u.email = 'kunde@aurora.test' AND a.kind = 'customer_wallet'",
  );
  const startBalance = Number(before.rows[0]!.balance);

  // Kunde fragt an
  await login(customer, "kunde@aurora.test");
  await customer.goto("/creators/aria");
  await customer.getByRole("button", { name: "Privaten Chat anfragen" }).click();
  await expect(customer).toHaveURL(/\/sessions\//);
  await expect(customer.getByText("Warte auf Antwort des Creators")).toBeVisible();
  const sessionUrl = customer.url();

  // Creator nimmt an
  await login(creator, "creator@aurora.test");
  await expect(creator).toHaveURL(/\/studio/);
  await creator.goto("/studio/live");
  await creator.getByRole("button", { name: "Annehmen" }).click();
  await expect(creator).toHaveURL(sessionUrl);
  await creator.getByRole("button", { name: "Beitreten (Simulation)" }).click();
  await expect(creator.getByText(/Warte auf/)).toBeVisible();

  // Kunde tritt bei → Sitzung startet, erste Minute wird berechnet
  await customer.reload();
  await customer.getByRole("button", { name: "Beitreten (Simulation)" }).click();
  await expect(customer.getByText("Verbunden mit Aria")).toBeVisible();
  await expect(customer.getByText("Es wird kein Bild oder Ton übertragen")).toBeVisible();

  const after = await db().query<{ balance: string }>(
    "SELECT a.balance FROM ledger_accounts a JOIN users u ON u.id = a.owner_user_id WHERE u.email = 'kunde@aurora.test' AND a.kind = 'customer_wallet'",
  );
  expect(Number(after.rows[0]!.balance)).toBe(startBalance - 40);

  // Kunde beendet
  await customer.getByRole("button", { name: "Sitzung beenden" }).click();
  await expect(customer.getByText("Diese Sitzung ist beendet.")).toBeVisible();
  await expect(customer.getByText("vom Kunden beendet")).toBeVisible();

  // Creator sieht Einnahmen mit Provisionsaufschlüsselung
  await creator.goto("/studio/earnings");
  await expect(creator.getByText("Privater Chat").first()).toBeVisible();
  await expect(creator.getByText("(30 %)").first()).toBeVisible();

  await customerContext.close();
  await creatorContext.close();
});
