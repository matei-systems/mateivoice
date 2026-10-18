/**
 * Setzt die ENTWICKLUNGSdatenbank zurück (löscht alle Daten).
 * Mehrfach abgesichert: nur APP_ENV=development, nur Datenbanken mit Suffix
 * _dev und nur mit ausdrücklichem --yes.
 */
import "dotenv/config";
import { Pool } from "pg";
import { assertDevelopmentDatabase } from "./guards";
import { runMigrations } from "./migrate";

async function main() {
  const name = assertDevelopmentDatabase();
  if (!process.argv.includes("--yes")) {
    console.error(`Dies löscht ALLE Daten in "${name}". Zum Bestätigen: pnpm db:reset-dev --yes`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  console.log(`Datenbank "${name}" wurde zurückgesetzt und migriert. Jetzt: pnpm db:seed`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
