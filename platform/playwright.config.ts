import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, e2eEnv } from "./tests/e2e/env";

/**
 * End-to-End-Tests gegen den Produktions-Build (`pnpm build` vorab) mit eigener
 * Datenbank (aurora_e2e). Die Datenbank wird vor jedem Lauf neu aufgesetzt.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node_modules/.bin/next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/robots.txt`,
    env: e2eEnv,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
