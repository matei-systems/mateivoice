import { getCurrentSession } from "@/server/auth/current";
import { exportUserData } from "@/server/privacy/export";
import { RATE_LIMITS, consumeRateLimit } from "@/server/rate-limit";

/** Download der eigenen Daten als JSON (nur für die angemeldete Person). */
export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.mfaPending) return new Response("Bitte melde dich an.", { status: 401 });
  const limit = await consumeRateLimit(`export:${session.user.id}`, RATE_LIMITS.sensitiveActionPerUser);
  if (!limit.allowed) return new Response("Zu viele Anfragen. Bitte später erneut versuchen.", { status: 429 });
  const data = await exportUserData(session.user.id);
  if (!data) return new Response("Nicht gefunden", { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meine-daten-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
