import { expect, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { generateTotp } from "../../src/server/auth/totp";
import { E2E_ADMIN_TOTP_SECRET, E2E_FINANCE_TOTP_SECRET, E2E_MODERATOR_TOTP_SECRET, E2E_PASSWORD, E2E_SUPPORT_TOTP_SECRET, e2eEnv } from "./env";

let pool: Pool | undefined;
export function db() {
  pool ??= new Pool({ connectionString: e2eEnv.DATABASE_URL, max: 2 });
  return pool;
}

/** Altershinweis vorab bestätigen (Cookie), damit Tests direkt Inhalte sehen. */
export async function acknowledgeAge(context: BrowserContext) {
  await context.addCookies([{ name: "aurora_age_ack", value: "1", url: e2eEnv.APP_URL }]);
}

export async function login(page: Page, email: string, password = E2E_PASSWORD, options: { expectSuccess?: boolean } = {}) {
  // Alle Tests kommen von derselben IP (localhost): Login-Zähler zurücksetzen, damit das
  // (separat getestete) Rate-Limit nicht zwischen unabhängigen Testfällen greift.
  await db().query("DELETE FROM rate_limit_buckets WHERE key LIKE 'login:%' OR key LIKE 'mfa:%'");
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  if (options.expectSuccess !== false) {
    // Erfolgreich, sobald die Anmeldeseite verlassen wurde (oder die 2FA-Abfrage erscheint).
    await page.waitForURL((url) => url.pathname !== "/login");
  }
}

/** Fehlermeldung eines Formulars (ohne den Routen-Ansager von Next.js). */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

// Der Server verhindert die Wiederverwendung eines TOTP-Codes (Replay-Schutz).
// Wird dasselbe Konto im selben 30-s-Fenster erneut angemeldet, warten wir auf das nächste Fenster.
const lastStep = new Map<string, number>();

async function freshTotp(secret: string) {
  let step = Math.floor(Date.now() / 30_000);
  if (lastStep.get(secret) === step) {
    await new Promise((resolve) => setTimeout(resolve, (step + 1) * 30_000 - Date.now() + 250));
    step = Math.floor(Date.now() / 30_000);
  }
  lastStep.set(secret, step);
  return generateTotp(secret);
}

const STAFF_SECRETS: Record<string, string> = {
  "admin@aurora.test": E2E_ADMIN_TOTP_SECRET,
  "moderation@aurora.test": E2E_MODERATOR_TOTP_SECRET,
  "support@aurora.test": E2E_SUPPORT_TOTP_SECRET,
  "finanzen@aurora.test": E2E_FINANCE_TOTP_SECRET,
};

export async function loginStaff(page: Page, email: keyof typeof STAFF_SECRETS | string) {
  await login(page, email);
  await expect(page).toHaveURL(/\/login\/mfa/);
  await page.getByLabel("Code").fill(await freshTotp(STAFF_SECRETS[email]!));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

export async function loginAdmin(page: Page) {
  await loginStaff(page, "admin@aurora.test");
}

export async function latestMailLink(to: string, template: string): Promise<string> {
  const result = await db().query<{ body_text: string }>(
    "SELECT body_text FROM email_outbox WHERE to_address = $1 AND template = $2 ORDER BY created_at DESC LIMIT 1",
    [to, template],
  );
  const body = result.rows[0]?.body_text ?? "";
  const match = body.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`Keine Mail für ${to} (${template}) gefunden`);
  return new URL(match[0]).pathname + new URL(match[0]).search;
}
