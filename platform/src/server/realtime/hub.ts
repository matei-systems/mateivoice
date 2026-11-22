import "server-only";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { getEnv } from "@/config/env";
import type { Executor } from "@/server/db/client";
import { log } from "@/server/log";

/**
 * Echtzeit-Verteilung über PostgreSQL LISTEN/NOTIFY.
 *
 * - Schreibende Vorgänge rufen publish() INNERHALB ihrer Transaktion auf; NOTIFY
 *   wird erst beim COMMIT zugestellt (keine Ereignisse für zurückgerollte Vorgänge).
 * - Jede Server-Instanz hält genau EINE Listener-Verbindung und verteilt
 *   Ereignisse prozessintern an ihre Abonnenten (Server-Sent Events).
 * - Horizontal skalierbar ohne zusätzliche Infrastruktur; bei sehr hoher Last
 *   kann der Hub gegen Redis/NATS o. Ä. getauscht werden (gleiche Schnittstelle).
 *
 * Nutzlasten enthalten nur IDs und Ereignistypen – Inhalte werden je Empfänger
 * mit Berechtigungsprüfung nachgeladen.
 */

export const REALTIME_CHANNEL = "aurora_realtime";

export type RealtimeEvent = {
  /** Thema, z. B. "session:<uuid>". */
  topic: string;
  type: "chat.message" | "chat.deleted" | "session.updated" | "tip";
  id?: string;
};

type Listener = (event: RealtimeEvent) => void;

type HubState = {
  client: Client | null;
  connecting: Promise<void> | null;
  listeners: Map<string, Set<Listener>>;
  retryTimer: NodeJS.Timeout | null;
};

const globalForHub = globalThis as typeof globalThis & { __auroraRealtime?: HubState };

function state(): HubState {
  globalForHub.__auroraRealtime ??= { client: null, connecting: null, listeners: new Map(), retryTimer: null };
  return globalForHub.__auroraRealtime;
}

/** Ereignis veröffentlichen (transaktional, wenn innerhalb einer Transaktion aufgerufen). */
export async function publish(executor: Executor, event: RealtimeEvent) {
  const payload = JSON.stringify(event);
  if (payload.length > 7000) throw new Error("Realtime-Nutzlast zu groß");
  await executor.execute(sql`SELECT pg_notify(${REALTIME_CHANNEL}, ${payload})`);
}

function dispatch(raw: string | undefined) {
  if (!raw) return;
  let event: RealtimeEvent;
  try {
    event = JSON.parse(raw) as RealtimeEvent;
  } catch {
    return;
  }
  const subscribers = state().listeners.get(event.topic);
  if (!subscribers) return;
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch (error) {
      log.error("realtime.listener_failed", { error });
    }
  }
}

async function connect() {
  const hub = state();
  if (hub.client) return;
  hub.connecting ??= (async () => {
    const client = new Client({ connectionString: getEnv().DATABASE_URL });
    client.on("notification", (message) => {
      if (message.channel === REALTIME_CHANNEL) dispatch(message.payload);
    });
    client.on("error", (error) => {
      log.error("realtime.connection_error", { error });
      scheduleReconnect();
    });
    client.on("end", () => scheduleReconnect());
    await client.connect();
    await client.query(`LISTEN ${REALTIME_CHANNEL}`);
    hub.client = client;
  })().finally(() => {
    hub.connecting = null;
  });
  await hub.connecting;
}

function scheduleReconnect() {
  const hub = state();
  const old = hub.client;
  hub.client = null;
  old?.removeAllListeners();
  old?.end().catch(() => undefined);
  if (hub.retryTimer || hub.listeners.size === 0) return;
  hub.retryTimer = setTimeout(() => {
    hub.retryTimer = null;
    connect().catch(() => scheduleReconnect());
  }, 2000);
}

/** Abonniert ein Thema; liefert eine Abmeldefunktion. */
export async function subscribe(topic: string, listener: Listener): Promise<() => void> {
  const hub = state();
  let set = hub.listeners.get(topic);
  if (!set) {
    set = new Set();
    hub.listeners.set(topic, set);
  }
  set.add(listener);
  await connect();
  return () => {
    const current = hub.listeners.get(topic);
    current?.delete(listener);
    if (current && current.size === 0) hub.listeners.delete(topic);
  };
}

/** Nur für Tests/Shutdown. */
export async function closeRealtimeHub() {
  const hub = state();
  hub.listeners.clear();
  if (hub.retryTimer) clearTimeout(hub.retryTimer);
  hub.retryTimer = null;
  const client = hub.client;
  hub.client = null;
  client?.removeAllListeners();
  await client?.end().catch(() => undefined);
}

export const sessionTopic = (sessionId: string) => `session:${sessionId}`;
