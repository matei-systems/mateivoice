/**
 * Führt alle ausstehenden Datenbankmigrationen aus.
 * Migrationen sind additiv; dieses Skript löscht niemals Daten.
 */
import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isDirectRun) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("Migrationen erfolgreich ausgeführt."))
    .catch((error: unknown) => {
      console.error("Migration fehlgeschlagen:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
