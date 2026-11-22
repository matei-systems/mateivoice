import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { chatMessages, creatorDeclarations, creatorProfiles, legalHolds, moderationActions, payouts, privacyRequests, users, videoSessions } from "@/server/db/schema";
import { deleteAccount } from "@/server/auth/service";
import {
  deleteChatMessage,
  getChatTranscriptForStaff,
  getRoomAccess,
  listRoomMessages,
  loadSession,
  muteChatUser,
  postChatMessage,
} from "@/server/chat/service";
import { acceptDeclarations } from "@/server/compliance/declarations";
import { releaseLegalHold } from "@/server/compliance/holds";
import { runRetention } from "@/server/compliance/privacy";
import { getCreatorProfileBySlug, getPublicationChecklist, reviewProfile, searchCreators } from "@/server/creators/service";
import { grantTestCoins } from "@/server/ledger/service";
import { createReport, terminateStream } from "@/server/moderation/service";
import { blockUser } from "@/server/social/service";
import { joinPrivateSession, joinPublicStream, requestPrivateSession, respondToRequest, setAvailability } from "@/server/video/service";
import { TEST_PASSWORD, actorOf, createCreator, createUser } from "../support/db-helpers";

async function liveStream() {
  const { user: creator, profile } = await createCreator();
  await setAvailability(actorOf(creator), "live");
  const [stream] = await getDb()
    .select()
    .from(videoSessions)
    .where(and(eq(videoSessions.creatorProfileId, profile.id), eq(videoSessions.kind, "public_stream")));
  return { creator, profile, stream: stream! };
}

async function privateSession() {
  const customer = await createUser();
  await grantTestCoins(customer.id);
  const { user: creator, profile } = await createCreator();
  const session = await requestPrivateSession(actorOf(customer), profile.id);
  await respondToRequest(actorOf(creator), session.id, "accept");
  await joinPrivateSession(actorOf(customer), session.id);
  await joinPrivateSession(actorOf(creator), session.id);
  return { customer, creator, sessionId: session.id };
}

describe("Chat", () => {
  it("Zuschauer und Creator schreiben; Links und Kontaktdaten werden blockiert", async () => {
    const { creator, stream } = await liveStream();
    const viewer = await createUser();
    await postChatMessage(actorOf(viewer), stream.id, "  Hallo   zusammen!  ");
    await postChatMessage(actorOf(creator), stream.id, "Willkommen!");
    const messages = await listRoomMessages(actorOf(viewer), stream);
    expect(messages.map((m) => [m.body, m.sender.role])).toEqual([
      ["Hallo zusammen!", "customer"],
      ["Willkommen!", "creator"],
    ]);
    for (const spam of ["schau auf www.beispiel.com", "schreib mir: test@example.com", "ruf an +43 660 1234567", "adde mich auf telegram"]) {
      await expect(postChatMessage(actorOf(viewer), stream.id, spam)).rejects.toMatchObject({ code: "validation" });
    }
    await expect(postChatMessage(actorOf(viewer), stream.id, "")).rejects.toMatchObject({ code: "validation" });
  });

  it("Mindestabstand und Wiederholungssperre", async () => {
    const { stream } = await liveStream();
    const viewer = await createUser();
    await postChatMessage(actorOf(viewer), stream.id, "Erste Nachricht");
    await expect(postChatMessage(actorOf(viewer), stream.id, "Zweite Nachricht")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("Zuschauer ohne Altersprüfung oder ohne bestätigte E-Mail dürfen nicht schreiben", async () => {
    const { stream } = await liveStream();
    const noAge = await createUser({ ageVerification: "none" });
    expect((await getRoomAccess(actorOf(noAge), stream)).canRead).toBe(false);
    await expect(postChatMessage(actorOf(noAge), stream.id, "Hallo")).rejects.toMatchObject({ code: "forbidden" });
    const unverified = await createUser({ emailVerified: false });
    expect((await getRoomAccess(actorOf(unverified), stream)).canWrite).toBe(false);
  });

  it("private Chats sind nur für die Beteiligten lesbar – auch nicht für Mitarbeiter im Live-Raum", async () => {
    const { customer, sessionId } = await privateSession();
    const session = (await loadSession(sessionId))!;
    await postChatMessage(actorOf(customer), sessionId, "Hallo privat");
    const outsider = await createUser();
    await expect(listRoomMessages(actorOf(outsider), session)).rejects.toMatchObject({ code: "forbidden" });
    const moderator = await createUser({ role: "moderator" });
    expect((await getRoomAccess(actorOf(moderator), session)).canRead).toBe(false);
    // Beweismittel nur über die Meldungsprüfung
    const transcript = await getChatTranscriptForStaff(actorOf(moderator), sessionId);
    expect(transcript.map((m) => m.body)).toEqual(["Hallo privat"]);
    await expect(getChatTranscriptForStaff(actorOf(await createUser({ role: "finance" })), sessionId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Blockieren blendet Nachrichten aus und verhindert das Schreiben im Raum des Creators", async () => {
    const { creator, stream } = await liveStream();
    const viewerA = await createUser();
    const viewerB = await createUser();
    await postChatMessage(actorOf(viewerA), stream.id, "Nachricht von A");
    await blockUser(actorOf(viewerB), viewerA.id);
    expect((await listRoomMessages(actorOf(viewerB), stream)).map((m) => m.body)).toEqual([]);
    expect((await listRoomMessages(actorOf(creator), stream)).map((m) => m.body)).toEqual(["Nachricht von A"]);
    await blockUser(actorOf(creator), viewerB.id);
    await expect(postChatMessage(actorOf(viewerB), stream.id, "Darf ich schreiben?")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Moderation: Creator löscht im eigenen Raum, Mitarbeiter nur mit Begründung; Stummschaltung wirkt", async () => {
    const { creator, stream } = await liveStream();
    const viewer = await createUser();
    const first = await postChatMessage(actorOf(viewer), stream.id, "Unangemessene Nachricht");
    await deleteChatMessage(actorOf(creator), first.id, "");
    expect(await listRoomMessages(actorOf(creator), stream)).toEqual([]);

    const moderator = await createUser({ role: "moderator", totpSecret: "JBSWY3DPEHPK3PXP" });
    await getDb().update(chatMessages).set({ createdAt: sql`now() - interval '1 minute'` }).where(eq(chatMessages.id, first.id));
    const second = await postChatMessage(actorOf(viewer), stream.id, "Noch eine Nachricht");
    await expect(deleteChatMessage(actorOf(moderator), second.id, "kurz")).rejects.toMatchObject({ code: "validation" });
    await deleteChatMessage(actorOf(moderator), second.id, "Verstoß gegen Community-Richtlinien 2.1");
    const [action] = await getDb().select().from(moderationActions).where(eq(moderationActions.targetId, second.id));
    expect(action).toMatchObject({ action: "message_deleted", affectedUserId: viewer.id });

    await muteChatUser(actorOf(creator), { sessionId: stream.id, userId: viewer.id, minutes: 30, reason: "" });
    await getDb().update(chatMessages).set({ createdAt: sql`now() - interval '2 minutes'` }).where(eq(chatMessages.senderUserId, viewer.id));
    await expect(postChatMessage(actorOf(viewer), stream.id, "Bin ich stumm?")).rejects.toMatchObject({ code: "forbidden" });
    const outsider = await createUser();
    await expect(deleteChatMessage(actorOf(outsider), second.id, "Ich bin nicht berechtigt")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("Veröffentlichung von Creator-Profilen", () => {
  it("ohne Pflichterklärungen nicht öffentlich und keine Live-Funktionen", async () => {
    const { user, profile } = await createCreator({ declarations: false });
    expect((await searchCreators({})).items.some((c) => c.id === profile.id)).toBe(false);
    expect(await getCreatorProfileBySlug(profile.slug, null)).toBeNull();
    await expect(setAvailability(actorOf(user), "live")).rejects.toMatchObject({ code: "invalid_state" });
    await expect(acceptDeclarations(actorOf(user), ["adult_and_identity"], null)).rejects.toMatchObject({ code: "validation" });
    await acceptDeclarations(actorOf(user), ["adult_and_identity", "sole_performer", "content_rights", "consent_and_no_coercion", "no_recording_distribution", "rules_acknowledged"], "ip-hash");
    expect((await searchCreators({})).items.some((c) => c.id === profile.id)).toBe(true);
    const stored = await getDb().select().from(creatorDeclarations).where(eq(creatorDeclarations.userId, user.id));
    expect(stored).toHaveLength(6);
    // Erklärungen sind unveränderlich
    await expect(getDb().update(creatorDeclarations).set({ version: "manipuliert" }).where(eq(creatorDeclarations.userId, user.id))).rejects.toThrow();
  });

  it("Freigabe nur mit vollständiger Checkliste; keine Selbstprüfung", async () => {
    const moderator = await createUser({ role: "moderator" });
    const { user, profile } = await createCreator({ reviewStatus: "pending_review", verification: "none" });
    await getDb().update(creatorProfiles).set({ tagline: "Kurz und gut", bio: "x".repeat(60) }).where(eq(creatorProfiles.id, profile.id));
    const checklist = await getPublicationChecklist(user.id);
    expect(checklist.readyForApproval).toBe(false);
    expect(checklist.items.find((i) => i.key === "verification")?.done).toBe(false);
    await expect(reviewProfile({ adminUserId: moderator.id, profileId: profile.id, decision: "approve", note: "" })).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("Zuschauer ohne Altersprüfung: keine privaten Anfragen und kein Stream-Beitritt", async () => {
    const { profile } = await liveStream();
    const noAge = await createUser({ ageVerification: "none" });
    await grantTestCoins(noAge.id);
    await expect(requestPrivateSession(actorOf(noAge), profile.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(joinPublicStream(actorOf(noAge), profile.id)).rejects.toMatchObject({ code: "forbidden" });
    const ok = await createUser();
    await expect(joinPublicStream(actorOf(ok), profile.id)).resolves.toBeTruthy();
  });

  it("Moderation beendet Streams mit Begründung (Statement of Reasons)", async () => {
    const moderator = await createUser({ role: "moderator" });
    const { creator, stream } = await liveStream();
    await expect(terminateStream({ staffUserId: moderator.id, sessionId: stream.id, statement: "kurz" })).rejects.toMatchObject({ code: "validation" });
    await terminateStream({ staffUserId: moderator.id, sessionId: stream.id, statement: "Inhalte verstoßen gegen Abschnitt 3 der Richtlinien", ruleReference: "Richtlinien 3" });
    const [session] = await getDb().select().from(videoSessions).where(eq(videoSessions.id, stream.id));
    expect(session?.status).toBe("ended");
    const [action] = await getDb().select().from(moderationActions).where(eq(moderationActions.affectedUserId, creator.id));
    expect(action).toMatchObject({ action: "stream_terminated", ruleReference: "Richtlinien 3" });
  });
});

describe("Beweissicherung, Löschung und Aufbewahrung", () => {
  it("kritische Meldung sichert Beweise; Löschung des Kontos wird zurückgestellt", async () => {
    const reporter = await createUser();
    const { stream } = await liveStream();
    const offender = await createUser();
    const message = await postChatMessage(actorOf(offender), stream.id, "Verdächtige Nachricht");
    await createReport(actorOf(reporter), { targetType: "chat_message", targetId: message.id, category: "minor_suspected", description: "Die Person gibt an, 15 Jahre alt zu sein." });
    const holds = await getDb().select().from(legalHolds);
    expect(holds.map((h) => h.targetType).sort()).toEqual(["chat_message", "report", "user", "video_session"]);

    await expect(deleteAccount({ userId: offender.id, password: TEST_PASSWORD, confirmation: "LÖSCHEN" })).rejects.toMatchObject({ code: "invalid_state" });
    const [request] = await getDb().select().from(privacyRequests).where(eq(privacyRequests.userId, offender.id));
    expect(request).toMatchObject({ kind: "deletion", status: "on_hold" });

    // Aufbewahrung: alte Nachrichten werden gelöscht – außer unter Beweissicherung
    const other = await createUser();
    const old = await postChatMessage(actorOf(other), stream.id, "Alte, harmlose Nachricht");
    await getDb().update(chatMessages).set({ createdAt: sql`now() - interval '400 days'` });
    const result = await runRetention();
    expect(result.chatMessages).toBe(0); // Stream steht unter Beweissicherung → nichts gelöscht
    const sessionHold = holds.find((h) => h.targetType === "video_session")!;
    const admin = await createUser({ role: "admin" });
    await releaseLegalHold({ staffUserId: admin.id, holdId: sessionHold.id, reason: "Verfahren abgeschlossen, Freigabe" });
    const second = await runRetention();
    expect(second.chatMessages).toBe(1); // nur die harmlose Nachricht; gemeldete Nachricht bleibt (Hold + offene Meldung)
    const remaining = await getDb().select({ id: chatMessages.id }).from(chatMessages);
    expect(remaining.map((r) => r.id)).toEqual([message.id]);
    expect(old.id).not.toBe(message.id);
  });

  it("offene Auszahlung verhindert die Selbstlöschung; ohne Hindernis wird pseudonymisiert", async () => {
    const { user: creator } = await createCreator();
    await getDb().insert(payouts).values({ creatorUserId: creator.id, amount: 100, currency: "TEST_COIN", status: "requested", provider: "sandbox", simulated: true });
    await expect(deleteAccount({ userId: creator.id, password: TEST_PASSWORD, confirmation: "LÖSCHEN" })).rejects.toMatchObject({ code: "invalid_state" });
    const customer = await createUser();
    await deleteAccount({ userId: customer.id, password: TEST_PASSWORD, confirmation: "LÖSCHEN" });
    const [row] = await getDb().select().from(users).where(eq(users.id, customer.id));
    expect(row?.status).toBe("deleted");
    expect(row?.email).toMatch(/@deleted\.invalid$/);
    const [request] = await getDb().select().from(privacyRequests).where(eq(privacyRequests.userId, customer.id));
    expect(request).toMatchObject({ kind: "deletion", status: "completed" });
  });
});
