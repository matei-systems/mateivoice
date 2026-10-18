import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/config/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Datenbank oder laufende Transaktion – Services akzeptieren beides. */
export type Executor = Database | Transaction;

type DbState = { pool: Pool; db: Database };

const globalForDb = globalThis as typeof globalThis & { __auroraDb?: DbState };

function create(): DbState {
  const pool = new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Verhindert hängende Anfragen bei Verbindungsproblemen.
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", () => {
    // Fehler einzelner Leerlaufverbindungen nicht als unbehandelte Ausnahme werfen.
  });
  return { pool, db: drizzle(pool, { schema, casing: "snake_case" }) };
}

/** Liefert die (lazy initialisierte) Datenbankverbindung. */
export function getDb(): Database {
  globalForDb.__auroraDb ??= create();
  return globalForDb.__auroraDb.db;
}

export async function closeDb() {
  const state = globalForDb.__auroraDb;
  globalForDb.__auroraDb = undefined;
  await state?.pool.end();
}

export { schema };
