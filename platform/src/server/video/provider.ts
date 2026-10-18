import "server-only";
import { getEnv } from "@/config/env";
import { hmacSha256, safeEqual } from "@/server/crypto";

/**
 * Austauschbare Video-Anbieter-Schnittstelle.
 *
 * Es ist noch KEIN Videoanbieter ausgewählt oder schriftlich für das
 * Geschäftsmodell freigegeben. Der Mock-Anbieter erzeugt keine Streams und
 * keine öffentlichen URLs – nur kurzlebige, signierte Beitritts-Token und
 * Sitzungsereignisse, damit Zugriffskontrolle und Abrechnung entwickelt und
 * getestet werden können. Es werden keine Aufnahmen gespeichert.
 */

export type JoinClaims = {
  sid: string; // Sitzung
  sub: string; // Nutzer
  role: "customer" | "creator" | "viewer";
  exp: number; // Unix-Sekunden
};

export interface VideoProvider {
  readonly name: string;
  readonly isReal: boolean;
  createRoom(input: { sessionId: string; kind: "public_stream" | "private_chat" }): Promise<{ roomId: string }>;
  issueJoinToken(claims: Omit<JoinClaims, "exp">, ttlSeconds: number): { token: string; expiresAt: Date };
  verifyJoinToken(token: string, now?: Date): JoinClaims | null;
  closeRoom(roomId: string): Promise<void>;
}

function tokenKey(): Buffer {
  return hmacSha256(getEnv().AUTH_SECRET, "video-join-token-key-v1");
}

const mockProvider: VideoProvider = {
  name: "mock",
  isReal: false,
  async createRoom({ sessionId }) {
    return { roomId: `mock-room-${sessionId}` };
  },
  issueJoinToken(claims, ttlSeconds) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = Buffer.from(JSON.stringify({ ...claims, exp })).toString("base64url");
    const signature = hmacSha256(tokenKey(), payload).toString("base64url");
    return { token: `${payload}.${signature}`, expiresAt: new Date(exp * 1000) };
  },
  verifyJoinToken(token, now = new Date()) {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = hmacSha256(tokenKey(), payload).toString("base64url");
    if (!safeEqual(expected, signature)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JoinClaims;
      if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) return null;
      if (typeof claims.sid !== "string" || typeof claims.sub !== "string") return null;
      return claims;
    } catch {
      return null;
    }
  },
  async closeRoom() {
    // Mock: nichts zu tun.
  },
};

export function getVideoProvider(): VideoProvider | null {
  return getEnv().VIDEO_PROVIDER === "mock" ? mockProvider : null;
}
