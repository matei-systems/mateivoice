import "server-only";
import { AccessToken, RoomServiceClient, TokenVerifier, WebhookReceiver, type VideoGrant } from "livekit-server-sdk";
import { getEnv } from "@/config/env";
import type { JoinClaims, VideoProvider } from "./provider";

/**
 * LiveKit-Adapter (selbst gehostet oder LiveKit Cloud).
 *
 * Sicherheit:
 *  - API-Schlüssel/-Geheimnis bleiben auf dem Server; der Browser erhält nur ein
 *    kurzlebiges Beitritts-Token, beschränkt auf genau einen Raum und eine Identität.
 *  - Nur Creator dürfen senden (Kamera/Mikrofon); Zuschauer und Kunden empfangen nur.
 *  - Keine Aufzeichnung: Es werden keine Egress-/Recording-Rechte vergeben und
 *    keine Aufnahmen gestartet (roomRecord = false).
 *  - Beenden durch Moderation löscht den Raum serverseitig (alle Verbindungen getrennt).
 *  - Webhooks werden mit dem API-Geheimnis verifiziert (WebhookReceiver).
 *
 * Hinweis: Nutzungsbedingungen des gewählten Hosters (Adult-Inhalte!) sind vor
 * dem Einsatz schriftlich zu prüfen – siehe docs/STREAMING.md.
 */

export function roomNameFor(sessionId: string) {
  return `aurora-${sessionId}`;
}

export function sessionIdFromRoom(roomName: string): string | null {
  const match = /^aurora-([0-9a-f-]{36})$/i.exec(roomName);
  return match ? match[1]! : null;
}

/** Rechte je Rolle – reine Funktion (getestet). */
export function grantFor(role: JoinClaims["role"], room: string): VideoGrant {
  return {
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "creator",
    canPublishData: false,
    canUpdateOwnMetadata: false,
    roomRecord: false,
    roomAdmin: false,
    roomCreate: false,
    hidden: false,
    recorder: false,
  };
}

function config() {
  const env = getEnv();
  return { url: env.LIVEKIT_URL!, apiKey: env.LIVEKIT_API_KEY!, apiSecret: env.LIVEKIT_API_SECRET! };
}

function httpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function livekitProvider(): VideoProvider {
  const { url, apiKey, apiSecret } = config();
  const rooms = () => new RoomServiceClient(httpUrl(url), apiKey, apiSecret);
  return {
    name: "livekit",
    isReal: true,
    async createRoom({ sessionId, kind, maxParticipants }) {
      const name = roomNameFor(sessionId);
      await rooms().createRoom({
        name,
        emptyTimeout: 120,
        maxParticipants: kind === "private_chat" ? 2 : Math.max(2, (maxParticipants ?? 500) + 1),
        metadata: JSON.stringify({ kind }),
      });
      return { roomId: name };
    },
    async issueJoinToken({ sid, sub, role, roomId, displayName }, ttlSeconds) {
      const room = roomId ?? roomNameFor(sid);
      const token = new AccessToken(apiKey, apiSecret, {
        identity: sub,
        name: displayName,
        ttl: ttlSeconds,
        metadata: JSON.stringify({ role }),
      });
      token.addGrant(grantFor(role, room));
      return { token: await token.toJwt(), expiresAt: new Date(Date.now() + ttlSeconds * 1000), serverUrl: url };
    },
    async verifyJoinToken(jwt) {
      try {
        const claims = await new TokenVerifier(apiKey, apiSecret).verify(jwt);
        const room = claims.video?.room;
        const sid = room ? sessionIdFromRoom(room) : null;
        const role = (JSON.parse(claims.metadata ?? "{}") as { role?: JoinClaims["role"] }).role;
        if (!sid || !claims.sub || !role) return null;
        return { sid, sub: claims.sub, role, exp: Number((claims as { exp?: number }).exp ?? 0) };
      } catch {
        return null;
      }
    },
    async closeRoom(roomId) {
      try {
        await rooms().deleteRoom(roomId);
      } catch {
        // Raum existiert nicht mehr – nichts zu tun.
      }
    },
  };
}

/** Prüft einen LiveKit-Webhook (Authorization-Header = signiertes JWT mit SHA-256 des Körpers). */
export async function receiveLivekitWebhook(body: string, authHeader: string | null) {
  const { apiKey, apiSecret } = config();
  if (!authHeader) return null;
  try {
    return await new WebhookReceiver(apiKey, apiSecret).receive(body, authHeader);
  } catch {
    return null;
  }
}
