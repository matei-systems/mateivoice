/**
 * Führt alle ausstehenden Datenbankmigrationen aus.
 * Migrationen sind additiv; dieses Skript löscht niemals Daten.
 *
 * Jede Migration läuft in einer EIGENEN Transaktion (statt alle zusammen wie beim
 * Standard-Migrator von Drizzle). Grund: PostgreSQL erlaubt neu hinzugefügte
 * Enum-Werte (ALTER TYPE … ADD VALUE) erst nach dem Commit zu verwenden – eine
 * spätere Migration, die solche Werte nutzt (z. B. in einem Index), würde bei einer
 * frischen Installation sonst fehlschlagen. Das Protokoll in
 * drizzle.__drizzle_migrations bleibt vollständig kompatibel zu drizzle-kit.
 */
import "dotenv/config";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool } from "pg";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../drizzle");

export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    // Parallele Migrationsläufe (mehrere Instanzen beim Deploy) gegenseitig ausschließen.
    await client.query("SELECT pg_advisory_lock(727274)");
    try {
      const last = await client.query<{ created_at: string }>('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1');
      const lastApplied = last.rows[0] ? Number(last.rows[0].created_at) : -1;
      for (const migration of migrations) {
        if (migration.folderMillis <= lastApplied) continue;
        await client.query("BEGIN");
        try {
          for (const statement of migration.sql) {
            if (statement.trim()) await client.query(statement);
          }
          await client.query('INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)', [migration.hash, migration.folderMillis]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(727274)");
    }
  } finally {
    client.release();
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
