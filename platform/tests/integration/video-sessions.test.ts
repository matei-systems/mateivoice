import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { creatorProfiles, videoSessionParticipants, videoSessions } from "@/server/db/schema";
import {
  cancelRequest,
  getSessionView,
  heartbeat,
  joinPrivateSession,
  joinPublicStream,
  leaveSession,
  requestPrivateSession,
  respondToRequest,
  setAvailability,
  sweepSessions,
} from "@/server/video/service";
import { getVideoProvider } from "@/server/video/provider";
import { getBalance, grantTestCoins, reconcileLedger } from "@/server/ledger/service";
import { actorOf, createCreator, createUser } from "../support/db-helpers";

async function customerWithCoins() {
  const user = await createUser({ role: "customer" });
  await grantTestCoins(user.id);
  return user;
}

async function startedSession(price = 40) {
  const customer = await customerWithCoins();
  const { user: creator, profile } = await createCreator({ coinsPerMinute: price });
  const session = await requestPrivateSession(actorOf(customer), profile.id);
  await respondToRequest(actorOf(creator), session.id, "accept");
  await joinPrivateSession(actorOf(customer), session.id);
  const joined = await joinPrivateSession(actorOf(creator), session.id);
  return { customer, creator, profile, session: joined.session };
}

describe("Private Sitzungen – Anfrage und Annahme", () => {
  it("vollständiger Ablauf: Anfrage, Annahme, Beitritt, Abrechnung, Ende", async () => {
    const { customer, creator, session } = await startedSession(40);
    expect(session.status).toBe("active");
    expect(session.chargedMinutes).toBe(1); // erste Minute bei Beginn berechnet
    expect(await getBalance(customer.id, "customer_wallet")).toBe(460);
    expect(await getBalance(creator.id, "creator_earnings")).toBe(28); // 70 % von 40

    // 2,5 Minuten später: Minuten 2 und 3 sind fällig
    const later = new Date(session.startedAt!.getTime() + 150_000);
    await getDb().update(videoSessionParticipants).set({ lastHeartbeatAt: later }).where(eq(videoSessionParticipants.sessionId, session.id));
    const ticked = await heartbeat(actorOf(customer), session.id, later);
    expect(ticked.chargedMinutes).toBe(3);
    expect(ticked.totalCoins).toBe(120);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(380);

    // Wiederholter Herzschlag zur selben Zeit erzeugt keine weitere Buchung
    await heartbeat(actorOf(customer), session.id, later);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(380);

    const ended = await leaveSession(actorOf(customer), session.id);
    expect(ended.status).toBe("ended");
    expect(ended.endReason).toBe("customer_left");
    const [profile] = await getDb().select().from(creatorProfiles).where(eq(creatorProfiles.userId, creator.id));
    expect(profile?.availability).toBe("online");
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("beendet die Sitzung, wenn das Guthaben aufgebraucht ist", async () => {
    const { customer, session } = await startedSession(200); // 500 Guthaben → 2 Minuten bezahlbar
    expect(await getBalance(customer.id, "customer_wallet")).toBe(300);
    const later = new Date(session.startedAt!.getTime() + 5 * 60_000);
    await getDb().update(videoSessionParticipants).set({ lastHeartbeatAt: later }).where(eq(videoSessionParticipants.sessionId, session.id));
    const result = await heartbeat(actorOf(customer), session.id, later);
    expect(result.status).toBe("ended");
    expect(result.endReason).toBe("insufficient_funds");
    expect(result.chargedMinutes).toBe(2);
    expect(await getBalance(customer.id, "customer_wallet")).toBe(100);
    expect((await reconcileLedger()).ok).toBe(true);
  });

  it("beendet die Sitzung bei Verbindungsverlust", async () => {
    const { customer, session } = await startedSession();
    const later = new Date(session.startedAt!.getTime() + 90_000);
    // Nur der Kunde sendet Herzschläge; der Creator ist seit > 45 s still.
    const result = await heartbeat(actorOf(customer), session.id, later);
    expect(result.status).toBe("ended");
    expect(result.endReason).toBe("connection_lost");
  });

  it("verlangt ausreichendes Guthaben für eine Anfrage", async () => {
    const customer = await createUser({ role: "customer" });
    const { profile } = await createCreator();
    await expect(requestPrivateSession(actorOf(customer), profile.id)).rejects.toMatchObject({ code: "insufficient_funds" });
  });

  it("erlaubt nur eine offene Anfrage je Kunde", async () => {
    const customer = await customerWithCoins();
    const { profile: a } = await createCreator();
    const { profile: b } = await createCreator();
    await requestPrivateSession(actorOf(customer), a.id);
    await expect(requestPrivateSession(actorOf(customer), b.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("unverifizierte Creator können keine privaten Chats anbieten", async () => {
    const customer = await customerWithCoins();
    const { profile } = await createCreator({ verification: "none" });
    await expect(requestPrivateSession(actorOf(customer), profile.id)).rejects.toMatchObject({ code: "invalid_state" });
    const { profile: pending } = await createCreator({ verification: "pending" });
    await expect(requestPrivateSession(actorOf(customer), pending.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("nicht freigegebene oder offline Profile sind nicht anfragbar", async () => {
    const customer = await customerWithCoins();
    const { profile: draft } = await createCreator({ reviewStatus: "draft" });
    await expect(requestPrivateSession(actorOf(customer), draft.id)).rejects.toMatchObject({ code: "not_found" });
    const { profile: offline } = await createCreator({ availability: "offline" });
    await expect(requestPrivateSession(actorOf(customer), offline.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("Creator und Admins können keine privaten Chats anfragen; unbestätigte E-Mail ebenfalls nicht", async () => {
    const { profile } = await createCreator();
    const creator = await createUser({ role: "creator" });
    const admin = await createUser({ role: "admin" });
    const unverified = await createUser({ role: "customer", emailVerified: false });
    await expect(requestPrivateSession(actorOf(creator), profile.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(requestPrivateSession(actorOf(admin), profile.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(requestPrivateSession(actorOf(unverified), profile.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("nur der adressierte Creator kann eine Anfrage beantworten", async () => {
    const customer = await customerWithCoins();
    const { profile } = await createCreator();
    const { user: otherCreator } = await createCreator();
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await expect(respondToRequest(actorOf(otherCreator), session.id, "accept")).rejects.toMatchObject({ code: "not_found" });
    await expect(respondToRequest(actorOf(customer), session.id, "accept")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Ablehnung und Stornierung erzeugen keine Buchungen", async () => {
    const customer = await customerWithCoins();
    const { user: creator, profile } = await createCreator();
    const first = await requestPrivateSession(actorOf(customer), profile.id);
    const declined = await respondToRequest(actorOf(creator), first.id, "decline");
    expect(declined.status).toBe("declined");
    const second = await requestPrivateSession(actorOf(customer), profile.id);
    const cancelled = await cancelRequest(actorOf(customer), second.id);
    expect(cancelled.status).toBe("cancelled");
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
  });

  it("abgelaufene Anfragen werden ohne Buchung beendet", async () => {
    const customer = await customerWithCoins();
    const { profile } = await createCreator();
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await sweepSessions(new Date(Date.now() + 10 * 60_000));
    const [row] = await getDb().select().from(videoSessions).where(eq(videoSessions.id, session.id));
    expect(row?.status).toBe("expired");
    expect(await getBalance(customer.id, "customer_wallet")).toBe(500);
  });
});

describe("Private Sitzungen – Zugriffskontrolle", () => {
  it("private Sitzungen sind für Dritte unsichtbar und nicht betretbar", async () => {
    const customer = await customerWithCoins();
    const { user: creator, profile } = await createCreator();
    const intruder = await createUser({ role: "customer" });
    const otherCreator = await createUser({ role: "creator" });
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");

    expect(await getSessionView(actorOf(intruder), session.id)).toBeNull();
    expect(await getSessionView(actorOf(otherCreator), session.id)).toBeNull();
    await expect(joinPrivateSession(actorOf(intruder), session.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(joinPrivateSession(actorOf(otherCreator), session.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(heartbeat(actorOf(intruder), session.id)).rejects.toMatchObject({ code: "not_found" });

    const view = await getSessionView(actorOf(customer), session.id);
    expect(view?.viewerRole).toBe("customer");
    expect(view?.simulatedVideo).toBe(true);
  });

  it("Admins können Sitzungen einsehen, aber nicht still beitreten", async () => {
    const customer = await customerWithCoins();
    const { user: creator, profile } = await createCreator();
    const admin = await createUser({ role: "admin" });
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    expect((await getSessionView(actorOf(admin), session.id))?.viewerRole).toBe("admin");
    await expect(joinPrivateSession(actorOf(admin), session.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("Beitritts-Token sind signiert, kurzlebig und nicht fälschbar", async () => {
    const customer = await customerWithCoins();
    const { user: creator, profile } = await createCreator();
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    const { token } = await joinPrivateSession(actorOf(customer), session.id);
    const provider = getVideoProvider()!;
    const claims = provider.verifyJoinToken(token);
    expect(claims).toMatchObject({ sid: session.id, sub: customer.id, role: "customer" });
    expect(provider.verifyJoinToken(token, new Date(Date.now() + 10 * 60_000))).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url");
    expect(provider.verifyJoinToken(`${forged}.${signature}`)).toBeNull();
    expect(provider.verifyJoinToken(`${payload}.invalid`)).toBeNull();
  });
});

describe("Öffentliche Streams", () => {
  it("Creator geht live, angemeldete Kunden können zusehen, Gäste nicht", async () => {
    const { user: creator, profile } = await createCreator({ availability: "online" });
    await setAvailability(actorOf(creator), "live");
    const viewer = await createUser({ role: "customer" });
    const result = await joinPublicStream(actorOf(viewer), profile.id);
    expect(result.token).toBeTruthy();
    const otherCreator = await createUser({ role: "creator" });
    await expect(joinPublicStream(actorOf(otherCreator), profile.id)).rejects.toMatchObject({ code: "forbidden" });
    await setAvailability(actorOf(creator), "offline");
    await expect(joinPublicStream(actorOf(viewer), profile.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("unverifizierte Creator können nicht live gehen", async () => {
    const { user: creator } = await createCreator({ verification: "none" });
    await expect(setAvailability(actorOf(creator), "live")).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("Annahme eines privaten Chats beendet den laufenden Stream", async () => {
    const customer = await customerWithCoins();
    const { user: creator, profile } = await createCreator();
    await setAvailability(actorOf(creator), "live");
    const session = await requestPrivateSession(actorOf(customer), profile.id);
    await respondToRequest(actorOf(creator), session.id, "accept");
    const active = await getDb().execute<{ count: string }>(
      sql`SELECT count(*) FROM video_sessions WHERE kind = 'public_stream' AND status = 'active'`,
    );
    expect(Number(active.rows[0]?.count)).toBe(0);
  });
});
