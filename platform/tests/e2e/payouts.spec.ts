import { expect, test } from "@playwright/test";
import { db, login, loginStaff } from "./helpers";

test("Auszahlung: Regeln anpassen → Antrag → Freigabe (Finanzen) → Ausführung (zweite Person)", async ({ browser }) => {
  // 1) Admin passt die Auszahlungsregeln an (Mindestbetrag, keine Haltefrist für den Test)
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await loginStaff(admin, "admin@aurora.test");
  await admin.goto("/admin/settings");
  const payoutCard = admin.locator("#payout");
  await payoutCard.getByLabel("Mindestbetrag (Münzen)").fill("10");
  await payoutCard.getByLabel("Haltefrist (Tage)").fill("0");
  await payoutCard.getByLabel("Begründung der Änderung").fill("E2E: Auszahlung ohne Haltefrist testen");
  await payoutCard.getByRole("button", { name: "Speichern" }).click();
  await expect(admin.getByText("Einstellung gespeichert").first()).toBeVisible();

  // 2) Creator hinterlegt ein Konto und beantragt eine Auszahlung
  const creatorContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  await login(creator, "creator@aurora.test");
  await creator.goto("/studio/payouts");
  await creator.getByLabel("Kontoinhaber/in").fill("Aria Test");
  await creator.getByLabel("IBAN").fill("AT61 1904 3002 3457 3201");
  await creator.getByRole("button", { name: "Konto speichern" }).click();
  await expect(creator.getByText("AT•• •••• •••• 3201")).toBeVisible();
  await creator.getByRole("button", { name: "Auszahlung beantragen" }).click();
  await expect(creator.getByText("Offener Antrag")).toBeVisible();
  const payout = await db().query<{ id: string; amount: string }>(
    "SELECT p.id, p.amount FROM payouts p JOIN users u ON u.id = p.creator_user_id WHERE u.email = 'creator@aurora.test' ORDER BY p.created_at DESC LIMIT 1",
  );
  const payoutId = payout.rows[0]!.id;

  // 3) Finanzen gibt frei
  const financeContext = await browser.newContext();
  const finance = await financeContext.newPage();
  await loginStaff(finance, "finanzen@aurora.test");
  await finance.goto(`/admin/payouts/${payoutId}`);
  await finance.getByRole("button", { name: "Freigeben" }).click();
  await expect(finance.getByText("Vier-Augen-Prinzip")).toBeVisible(); // Freigebende Person darf nicht ausführen

  // 4) Eine zweite Person (Admin) führt in der Sandbox aus
  await admin.goto(`/admin/payouts/${payoutId}`);
  await admin.getByRole("button", { name: "Sandbox: erfolgreich ausführen" }).click();
  await expect(admin.getByText("Ausgeführt", { exact: true }).first()).toBeVisible();

  await creator.goto("/studio/payouts");
  await expect(creator.getByText("Ausgeführt", { exact: true }).first()).toBeVisible();
  await expect(creator.getByText(/sandbox_po_/)).toBeVisible();

  const balances = await db().query<{ kind: string; balance: string }>(
    "SELECT kind, balance FROM ledger_accounts WHERE kind IN ('system_payout_clearing', 'system_payout_settled') ORDER BY kind",
  );
  expect(balances.rows.map((r) => [r.kind, Number(r.balance)])).toEqual([
    ["system_payout_clearing", 0],
    ["system_payout_settled", Number(payout.rows[0]!.amount)],
  ]);
  await adminContext.close();
  await creatorContext.close();
  await financeContext.close();
});
