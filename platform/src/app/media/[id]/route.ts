import { getActor } from "@/server/auth/current";
import { getMediaForViewer } from "@/server/media/service";

/**
 * Auslieferung hochgeladener Bilder. Öffentliche, freigegebene Bilder sind
 * cachebar; alles andere nur für Eigentümer/Admins und nicht cachebar.
 */
export async function GET(_request: Request, context: RouteContext<"/media/[id]">) {
  const { id } = await context.params;
  const media = await getMediaForViewer(await getActor(), id);
  if (!media) return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(media.data.length),
      "Cache-Control": media.isPublic ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
    },
  });
}
