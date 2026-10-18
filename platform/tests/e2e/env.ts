/** Feste, ungefährliche Werte für die E2E-Umgebung (eigene Datenbank *_e2e). */
export const E2E_PORT = 3100;
export const E2E_PASSWORD = "E2E-Test-Passwort-2026";
export const E2E_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const e2eEnv: Record<string, string> = {
  APP_ENV: "test",
  APP_URL: `http://localhost:${E2E_PORT}`,
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://aurora:aurora_dev_only@localhost:5432/aurora_e2e",
  AUTH_SECRET: "e2e-only-secret-not-for-production-000000",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
  TEST_MODE: "true",
  EMAIL_PROVIDER: "dev-outbox",
  PAYMENT_PROVIDER: "simulated",
  VIDEO_PROVIDER: "mock",
  IDENTITY_PROVIDER: "mock",
  STORAGE_LOCAL_DIR: "./storage/e2e",
  SEED_DEFAULT_PASSWORD: E2E_PASSWORD,
  SEED_ADMIN_TOTP_SECRET: E2E_ADMIN_TOTP_SECRET,
  NEXT_TELEMETRY_DISABLED: "1",
};
