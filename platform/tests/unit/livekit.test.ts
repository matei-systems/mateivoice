import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { AccessToken } from "livekit-server-sdk";
import { resetEnvCacheForTests } from "@/config/env";
import { getVideoProvider } from "@/server/video/provider";
import { grantFor, receiveLivekitWebhook, roomNameFor, sessionIdFromRoom } from "@/server/video/livekit";

const KEY = "devkey";
const SECRET = "unit-test-livekit-secret-0123456789";

function useLivekit() {
  process.env.VIDEO_PROVIDER = "livekit";
  process.env.LIVEKIT_URL = "wss://livekit.example.test";
  process.env.LIVEKIT_API_KEY = KEY;
  process.env.LIVEKIT_API_SECRET = SECRET;
  resetEnvCacheForTests();
}

afterEach(() => {
  for (const key of ["VIDEO_PROVIDER", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) delete process.env[key];
  resetEnvCacheForTests();
});

function decodeJwt(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown> & { video: Record<string, unknown> };
}

describe("LiveKit-Adapter", () => {
  it("nur Creator senden; niemand darf aufzeichnen oder administrieren", () => {
    expect(grantFor("creator", "r")).toMatchObject({ room: "r", roomJoin: true, canPublish: true, canSubscribe: true, roomRecord: false, roomAdmin: false, recorder: false, canPublishData: false });
    expect(grantFor("viewer", "r")).toMatchObject({ canPublish: false, canSubscribe: true, roomRecord: false });
    expect(grantFor("customer", "r")).toMatchObject({ canPublish: false, roomRecord: false });
  });

  it("Raumnamen sind an die Sitzung gebunden", () => {
    const id = "6f1c2b7e-1d1a-4c2b-9a51-0f3c2a1b4d5e";
    expect(sessionIdFromRoom(roomNameFor(id))).toBe(id);
    expect(sessionIdFromRoom("fremder-raum")).toBeNull();
  });

  it("Beitritts-Token: kurzlebig, raum- und personengebunden, ohne API-Geheimnis im Browser", async () => {
    useLivekit();
    const provider = getVideoProvider()!;
    expect(provider.name).toBe("livekit");
    const sid = "6f1c2b7e-1d1a-4c2b-9a51-0f3c2a1b4d5e";
    const token = await provider.issueJoinToken({ sid, sub: "user-1", role: "viewer" }, 300);
    expect(token.serverUrl).toBe("wss://livekit.example.test");
    expect(token.token).not.toContain(SECRET);
    const claims = decodeJwt(token.token);
    expect(claims.sub).toBe("user-1");
    expect(claims.video).toMatchObject({ room: roomNameFor(sid), canPublish: false, roomRecord: false });
    expect(Number(claims.exp) - Number(claims.nbf ?? Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(301);
    expect(await provider.verifyJoinToken(token.token)).toMatchObject({ sid, sub: "user-1", role: "viewer" });
    expect(await provider.verifyJoinToken(`${token.token}x`)).toBeNull();
  });

  it("Webhooks werden nur mit gültiger Signatur (SHA-256 des Inhalts) akzeptiert", async () => {
    useLivekit();
    const body = JSON.stringify({ event: "room_finished", id: "EV_1", room: { name: roomNameFor("6f1c2b7e-1d1a-4c2b-9a51-0f3c2a1b4d5e") }, createdAt: "1" });
    const at = new AccessToken(KEY, SECRET);
    at.sha256 = createHash("sha256").update(body).digest("base64");
    const auth = await at.toJwt();
    const event = await receiveLivekitWebhook(body, auth);
    expect(event?.event).toBe("room_finished");
    expect(await receiveLivekitWebhook(`${body} `, auth)).toBeNull();
    expect(await receiveLivekitWebhook(body, null)).toBeNull();
    const forged = new AccessToken(KEY, "falsches-geheimnis-0123456789012");
    forged.sha256 = createHash("sha256").update(body).digest("base64");
    expect(await receiveLivekitWebhook(body, await forged.toJwt())).toBeNull();
  });
});
