import { getEnv } from "@/config/env";
import { log } from "@/server/log";
import { receiveLivekitWebhook, sessionIdFromRoom } from "@/server/video/livekit";
import { handleProviderRoomEvent } from "@/server/video/service";

/**
 * LiveKit-Webhooks (Teilnehmer beigetreten/verlassen, Raum beendet).
 * Signaturprüfung über das API-Geheimnis; Verarbeitung idempotent.
 */
export async function POST(request: Request) {
  if (getEnv().VIDEO_PROVIDER !== "livekit") return new Response("not found", { status: 404 });
  const body = await request.text();
  if (body.length > 64 * 1024) return new Response("payload too large", { status: 413 });
  const event = await receiveLivekitWebhook(body, request.headers.get("authorization"));
  if (!event) return new Response("invalid", { status: 401 });
  const sessionId = event.room?.name ? sessionIdFromRoom(event.room.name) : null;
  const type = event.event;
  if (sessionId && event.id && (type === "participant_joined" || type === "participant_left" || type === "room_finished")) {
    try {
      await handleProviderRoomEvent({ sessionId, eventId: event.id, type, identity: event.participant?.identity ?? null });
    } catch (error) {
      log.error("video.webhook_failed", { error });
      return new Response("error", { status: 500 });
    }
  }
  return new Response("ok", { status: 200 });
}
