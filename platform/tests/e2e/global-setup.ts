import { execFileSync } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrate";
import { e2eEnv } from "./env";

/** Setzt die E2E-Datenbank zurück und spielt Migrationen und Testdaten ein. */
export default async function globalSetup() {
  const url = e2eEnv.DATABASE_URL!;
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error(`E2E-Datenbank muss auf _e2e enden (gefunden: ${name})`);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  const root = path.resolve(import.meta.dirname, "../..");
  execFileSync("node_modules/.bin/tsx", ["--conditions=react-server", "scripts/seed.ts"], {
    cwd: root,
    env: { ...process.env, ...e2eEnv },
    stdio: "inherit",
  });
}
