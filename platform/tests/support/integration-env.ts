import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./test-database";

process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET = "integration-test-secret-0000000000000000";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.TEST_MODE = "true";
process.env.EMAIL_PROVIDER = "dev-outbox";
process.env.PAYMENT_PROVIDER = "simulated";
process.env.VIDEO_PROVIDER = "mock";
process.env.IDENTITY_PROVIDER = "mock";
process.env.STORAGE_LOCAL_DIR = "./storage/test";

const { resetDatabase } = await import("./db-helpers");
const { closeDb } = await import("@/server/db/client");

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDb();
});
