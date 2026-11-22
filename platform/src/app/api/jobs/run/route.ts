import { getEnv } from "@/config/env";
import { runRetention } from "@/server/compliance/privacy";
import { safeEqual } from "@/server/crypto";
import { deliverQueuedEmails } from "@/server/email/service";
import { log } from "@/server/log";
import { sweepSessions } from "@/server/video/service";

export const dynamic = "force-dynamic";

/**
 * Wiederkehrende Hintergrundaufgaben (z. B. minütlich per Cron-Dienst aufrufen):
 * Sitzungen aufräumen, E-Mail-Warteschlange abarbeiten, Aufbewahrungsfristen.
 *
 * Schutz: Authorization: Bearer <JOBS_SECRET>. Ohne konfiguriertes Geheimnis
 * ist der Endpunkt deaktiviert (404).
 */
export async function POST(request: Request) {
  const secret = getEnv().JOBS_SECRET;
  if (!secret) return new Response("not found", { status: 404 });
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, secret)) return new Response("unauthorized", { status: 401 });
  const tasks = new URL(request.url).searchParams.get("tasks")?.split(",") ?? ["sessions", "email", "retention"];
  const result: Record<string, unknown> = {};
  try {
    if (tasks.includes("sessions")) result.sessions = await sweepSessions();
    if (tasks.includes("email")) result.email = await deliverQueuedEmails(50);
    if (tasks.includes("retention")) result.retention = await runRetention();
    return Response.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    log.error("jobs.failed", { error });
    return Response.json({ ok: false }, { status: 500 });
  }
}
