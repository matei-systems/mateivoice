import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/** Health-Check für Monitoring/Uptime-Checks. Gibt keine internen Details preis. */
export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.error("health.db_unreachable", { error });
    return Response.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
