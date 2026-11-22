import { getActor } from "@/server/auth/current";
import { blockedSenderIds, getMessageForViewer, getRoomAccess, listRoomMessages, loadSession } from "@/server/chat/service";
import { sessionTopic, subscribe, type RealtimeEvent } from "@/server/realtime/hub";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events für den Chat einer Sitzung.
 *
 * Authentifizierung über das Sitzungs-Cookie (same-origin EventSource),
 * Autorisierung je Sitzung (getRoomAccess). Gesendet werden nur Nachrichten,
 * die die anfragende Person sehen darf (gelöschte und blockierte Absender
 * werden ausgefiltert). Verbindungen werden nach 30 Minuten beendet; der
 * Browser verbindet sich automatisch neu.
 */

const HEARTBEAT_MS = 15_000;
const MAX_CONNECTION_MS = 30 * 60_000;

export async function GET(request: Request, ctx: RouteContext<"/api/sessions/[id]/chat">) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response("unauthorized", { status: 401 });
  const session = await loadSession(id);
  if (!session) return new Response("not found", { status: 404 });
  const access = await getRoomAccess(actor, session);
  if (!access.canRead) return new Response("forbidden", { status: 403 });

  const backlog = await listRoomMessages(actor, session, { limit: 50 });
  let hidden = await blockedSenderIds(actor.id);
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup?.();
        try {
          controller.close();
        } catch {
          // bereits geschlossen
        }
      };

      send("backlog", { messages: backlog, access: { canWrite: access.canWrite, canModerate: access.canModerate, reason: access.reason ?? null } });

      // Ereignisse nacheinander verarbeiten (Reihenfolge erhalten).
      let queue = Promise.resolve();
      const onEvent = (event: RealtimeEvent) => {
        queue = queue
          .then(async () => {
            if (event.type === "chat.deleted" && event.id) {
              send("deleted", { id: event.id });
            } else if (event.type === "chat.message" && event.id) {
              const message = await getMessageForViewer(actor, session, event.id, hidden);
              if (message) send("message", message);
            } else if (event.type === "session.updated") {
              send("session", { id: session.id });
            }
          })
          .catch((error: unknown) => log.error("chat.stream_event_failed", { error }));
      };

      let unsubscribe: () => void = () => undefined;
      try {
        unsubscribe = await subscribe(sessionTopic(session.id), onEvent);
      } catch (error) {
        log.error("chat.stream_subscribe_failed", { error });
        send("error", { message: "Echtzeitverbindung nicht verfügbar." });
        close();
        return;
      }
      const heartbeat = setInterval(async () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
          hidden = await blockedSenderIds(actor.id);
        } catch {
          close();
        }
      }, HEARTBEAT_MS);
      const maxAge = setTimeout(close, MAX_CONNECTION_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(maxAge);
        unsubscribe();
      };
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
