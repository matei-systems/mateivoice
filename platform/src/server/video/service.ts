import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { isTestMode } from "@/config/env";
import { videoSessions as videoConfig } from "@/config/platform";
import { getDb, type Transaction } from "@/server/db/client";
import {
  creatorOffers,
  creatorProfiles,
  creatorVerifications,
  users,
  videoSessionEvents,
  videoSessionParticipants,
  videoSessions,
} from "@/server/db/schema";
import { canJoinSession, canViewSession, hasPermission, type Actor } from "@/server/auth/permissions";
import { randomToken } from "@/server/crypto";
import {
  AppError,
  PG_UNIQUE_VIOLATION,
  featureUnavailable,
  forbidden,
  invalidState,
  notFound,
  pgConstraint,
  pgErrorCode,
} from "@/server/errors";
import { splitCommission } from "@/server/ledger/commission";
import {
  InsufficientFundsError,
  currentCommissionBps,
  getOrCreateAccount,
  postTransaction,
} from "@/server/ledger/service";
import { notify } from "@/server/notifications/service";
import { RATE_LIMITS, enforceRateLimit } from "@/server/rate-limit";
import { creatorCanOperate, type VerificationStatus } from "@/lib/verification";
import { getVideoProvider } from "./provider";
import { dueMinutes, isTerminal, nextStatus, type SessionStatus } from "./state-machine";

/**
 * Verwaltung von Video-Sitzungen.
 *
 * Abrechnung: ausschließlich auf Basis serverseitiger Zeitstempel und
 * Ereignisse. Der Browser liefert nur Herzschläge; Beträge werden nie im
 * Client berechnet. Jede begonnene Minute wird zu ihrem Beginn berechnet –
 * pro Minute genau einmal (Idempotenzschlüssel session:<id>:minute:<n>).
 */

type SessionRow = typeof videoSessions.$inferSelect;
type EndReason = NonNullable<SessionRow["endReason"]>;

function requireProvider() {
  const provider = getVideoProvider();
  if (!provider) throw featureUnavailable("Es ist noch kein Videoanbieter angebunden.");
  return provider;
}

async function lockSession(tx: Transaction, sessionId: string): Promise<SessionRow | null> {
  const [row] = await tx.select().from(videoSessions).where(eq(videoSessions.id, sessionId)).for("update");
  return row ?? null;
}

async function recordEvent(
  tx: Transaction,
  sessionId: string,
  type: string,
  source: "server" | "provider" | "client",
  actorUserId: string | null,
  payload: Record<string, unknown> = {},
  providerEventId?: string,
) {
  await tx.insert(videoSessionEvents).values({
    sessionId,
    type,
    source,
    actorUserId,
    payload,
    providerEventId: providerEventId ?? null,
  });
}

async function latestVerification(tx: Transaction, userId: string) {
  const [row] = await tx
    .select({ status: creatorVerifications.status, provider: creatorVerifications.provider })
    .from(creatorVerifications)
    .where(eq(creatorVerifications.userId, userId))
    .orderBy(desc(creatorVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

async function creatorMayOperate(tx: Transaction, userId: string) {
  const verification = await latestVerification(tx, userId);
  return creatorCanOperate(verification?.status as VerificationStatus | undefined, verification?.provider, isTestMode());
}

async function setAvailabilityIf(
  tx: Transaction,
  profileId: string,
  from: (typeof creatorProfiles.$inferSelect)["availability"][],
  to: (typeof creatorProfiles.$inferSelect)["availability"],
) {
  await tx
    .update(creatorProfiles)
    .set({ availability: to, lastOnlineAt: new Date() })
    .where(and(eq(creatorProfiles.id, profileId), inArray(creatorProfiles.availability, from)));
}

// ── Abrechnung ──────────────────────────────────────────────────────────────

async function chargeMinute(tx: Transaction, session: SessionRow, minuteIndex: number) {
  if (!session.customerUserId || session.coinsPerMinute == null || session.commissionBps == null) {
    throw new Error("Sitzung ohne Abrechnungsdaten");
  }
  const split = splitCommission(session.coinsPerMinute, session.commissionBps);
  const wallet = await getOrCreateAccount(tx, {
    kind: "customer_wallet",
    ownerUserId: session.customerUserId,
    currency: session.currency,
  });
  const creator = await getOrCreateAccount(tx, {
    kind: "creator_earnings",
    ownerUserId: session.creatorUserId,
    currency: session.currency,
  });
  const platform = await getOrCreateAccount(tx, { kind: "platform_revenue", currency: session.currency });
  const entries = [
    { accountId: wallet.id, amount: -split.gross },
    { accountId: creator.id, amount: split.creatorShare },
    { accountId: platform.id, amount: split.platformShare },
  ].filter((entry) => entry.amount !== 0);
  return postTransaction(tx, {
    idempotencyKey: `session:${session.id}:minute:${minuteIndex}`,
    kind: "session_charge",
    currency: session.currency,
    description: `Privater Chat – Minute ${minuteIndex + 1}${session.currency === "TEST_COIN" ? " (simuliert)" : ""}`,
    referenceType: "video_session",
    referenceId: session.id,
    actorUserId: session.customerUserId,
    commissionBps: session.commissionBps,
    entries,
  });
}

/** Berechnet alle fälligen Minuten einer aktiven Sitzung. Beendet sie bei fehlendem Guthaben. */
async function settleBilling(tx: Transaction, session: SessionRow, now: Date): Promise<SessionRow> {
  if (session.kind !== "private_chat" || session.status !== "active" || !session.startedAt) return session;
  const due = dueMinutes(session.startedAt, now, videoConfig.billingIntervalSeconds);
  let charged = session.chargedMinutes;
  let total = session.totalCoins;
  let insufficient = false;
  while (charged < due) {
    try {
      // Savepoint: ein fehlgeschlagener Versuch hinterlässt keine Teilbuchung.
      const result = await tx.transaction((sp) => chargeMinute(sp, session, charged));
      if (!result.duplicate) total += session.coinsPerMinute ?? 0;
      charged += 1;
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        insufficient = true;
        break;
      }
      throw error;
    }
  }
  let updated = session;
  if (charged !== session.chargedMinutes) {
    const [row] = await tx
      .update(videoSessions)
      .set({ chargedMinutes: charged, totalCoins: total })
      .where(eq(videoSessions.id, session.id))
      .returning();
    updated = row!;
  }
  if (insufficient) updated = await finishSession(tx, updated, "insufficient_funds", now);
  return updated;
}

// ── Beenden ─────────────────────────────────────────────────────────────────

async function finishSession(tx: Transaction, session: SessionRow, reason: EndReason, now: Date): Promise<SessionRow> {
  let status: SessionStatus | null;
  if (session.status === "active") status = nextStatus("active", "end");
  else if (session.status === "requested" || session.status === "accepted") status = nextStatus(session.status, "cancel");
  else return session;
  const [row] = await tx
    .update(videoSessions)
    .set({ status: status!, endedAt: now, endReason: session.status === "active" ? reason : null })
    .where(eq(videoSessions.id, session.id))
    .returning();
  await tx
    .update(videoSessionParticipants)
    .set({ leftAt: now })
    .where(and(eq(videoSessionParticipants.sessionId, session.id), isNull(videoSessionParticipants.leftAt)));
  if (session.kind === "private_chat") {
    await setAvailabilityIf(tx, session.creatorProfileId, ["in_private"], "online");
  } else {
    await setAvailabilityIf(tx, session.creatorProfileId, ["live"], "online");
  }
  await recordEvent(tx, session.id, "ended", "server", null, { reason, status });
  if (session.providerRoomId) await getVideoProvider()?.closeRoom(session.providerRoomId);

  if (session.kind === "private_chat" && session.customerUserId && session.status === "active") {
    const text =
      reason === "insufficient_funds"
        ? "Der private Chat wurde beendet, weil das Testguthaben aufgebraucht war."
        : reason === "connection_lost"
          ? "Der private Chat wurde wegen Verbindungsverlust beendet."
          : "Der private Chat wurde beendet.";
    for (const userId of [session.customerUserId, session.creatorUserId]) {
      await notify(tx, { userId, type: "session.ended", title: "Sitzung beendet", body: text, linkPath: `/sessions/${session.id}` });
    }
  }
  return row!;
}

/** Abgelaufene Anfragen und verlorene Verbindungen bereinigen (lazy und per Job aufrufbar). */
export async function sweepSessions(now = new Date()) {
  const db = getDb();
  const stale = await db
    .select({ id: videoSessions.id })
    .from(videoSessions)
    .where(and(inArray(videoSessions.status, ["requested", "accepted"]), lt(videoSessions.expiresAt, now)));
  for (const { id } of stale) {
    await db.transaction(async (tx) => {
      const session = await lockSession(tx, id);
      if (!session || !session.expiresAt || session.expiresAt >= now) return;
      if (session.status !== "requested" && session.status !== "accepted") return;
      const [row] = await tx
        .update(videoSessions)
        .set({ status: nextStatus(session.status, "expire")!, endedAt: now })
        .where(eq(videoSessions.id, id))
        .returning();
      if (session.status === "accepted") await setAvailabilityIf(tx, session.creatorProfileId, ["in_private"], "online");
      await recordEvent(tx, id, "expired", "server", null);
      if (row?.customerUserId) {
        await notify(tx, {
          userId: row.customerUserId,
          type: "session.expired",
          title: "Anfrage abgelaufen",
          body: "Deine Anfrage für einen privaten Chat ist abgelaufen. Es wurden keine Münzen berechnet.",
          linkPath: `/sessions/${id}`,
        });
      }
    });
  }
  const cutoff = new Date(now.getTime() - videoConfig.heartbeatTimeoutSeconds * 1000);
  const dead = await db
    .selectDistinct({ id: videoSessions.id })
    .from(videoSessions)
    .innerJoin(videoSessionParticipants, eq(videoSessionParticipants.sessionId, videoSessions.id))
    .where(
      and(
        eq(videoSessions.status, "active"),
        eq(videoSessions.kind, "private_chat"),
        isNull(videoSessionParticipants.leftAt),
        lt(videoSessionParticipants.lastHeartbeatAt, cutoff),
      ),
    );
  for (const { id } of dead) {
    await db.transaction(async (tx) => {
      const session = await lockSession(tx, id);
      if (session?.status !== "active") return;
      const settled = await settleBilling(tx, session, now);
      if (settled.status === "active") await finishSession(tx, settled, "connection_lost", now);
    });
  }
  return { expired: stale.length, connectionLost: dead.length };
}

// ── Private Chats ───────────────────────────────────────────────────────────

export async function requestPrivateSession(actor: Actor, creatorProfileId: string) {
  if (!hasPermission(actor, "sessions.request_private")) {
    throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  const provider = requireProvider();
  await enforceRateLimit(`session-request:${actor.id}`, RATE_LIMITS.sessionRequestsPerUser);
  await sweepSessions();
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ profile: creatorProfiles, creatorStatus: users.status })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(eq(creatorProfiles.id, creatorProfileId))
        .limit(1);
      if (!row || row.profile.reviewStatus !== "approved" || row.creatorStatus !== "active") {
        throw notFound("Dieser Creator ist nicht verfügbar.");
      }
      const profile = row.profile;
      if (!(await creatorMayOperate(tx, profile.userId))) {
        throw invalidState("Dieser Creator kann derzeit keine privaten Chats anbieten.");
      }
      if (profile.availability !== "online" && profile.availability !== "live") {
        throw invalidState("Der Creator ist gerade nicht für private Chats verfügbar.");
      }
      const [offer] = await tx
        .select()
        .from(creatorOffers)
        .where(and(eq(creatorOffers.creatorProfileId, profile.id), eq(creatorOffers.kind, "private_chat")))
        .limit(1);
      if (!offer?.enabled) throw invalidState("Private Chats werden von diesem Creator derzeit nicht angeboten.");

      const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: actor.id, currency: "TEST_COIN" });
      const minimum = offer.coinsPerMinute * videoConfig.minimumBalanceMinutes;
      if (wallet.balance < minimum) {
        throw new AppError("insufficient_funds", `Für diesen privaten Chat brauchst du mindestens ${minimum} Testmünzen.`);
      }
      const now = new Date();
      const [session] = await tx
        .insert(videoSessions)
        .values({
          kind: "private_chat",
          creatorProfileId: profile.id,
          creatorUserId: profile.userId,
          customerUserId: actor.id,
          status: "requested",
          coinsPerMinute: offer.coinsPerMinute,
          commissionBps: currentCommissionBps(),
          currency: "TEST_COIN",
          provider: provider.name,
          requestedAt: now,
          expiresAt: new Date(now.getTime() + videoConfig.requestTtlSeconds * 1000),
        })
        .returning();
      await recordEvent(tx, session!.id, "requested", "server", actor.id);
      await notify(tx, {
        userId: profile.userId,
        type: "session.requested",
        title: "Neue Anfrage für einen privaten Chat",
        body: `Eine Anfrage wartet auf deine Antwort (${offer.coinsPerMinute} Testmünzen/Min.).`,
        linkPath: "/studio/live",
      });
      return session!;
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === "video_sessions_one_open_per_customer") {
      throw new AppError("conflict", "Du hast bereits eine offene Anfrage oder Sitzung.");
    }
    throw error;
  }
}

export async function respondToRequest(actor: Actor, sessionId: string, decision: "accept" | "decline") {
  if (!hasPermission(actor, "studio.sessions.manage")) throw forbidden();
  const provider = requireProvider();
  await sweepSessions();
  try {
    return await getDb().transaction(async (tx) => {
      const session = await lockSession(tx, sessionId);
      if (!session || session.creatorUserId !== actor.id || session.kind !== "private_chat") throw notFound("Anfrage nicht gefunden.");
      const target = nextStatus(session.status, decision);
      if (!target) throw invalidState("Diese Anfrage kann nicht mehr beantwortet werden.");
      const now = new Date();
      if (decision === "decline") {
        const [row] = await tx
          .update(videoSessions)
          .set({ status: target, endedAt: now })
          .where(eq(videoSessions.id, sessionId))
          .returning();
        await recordEvent(tx, sessionId, "declined", "server", actor.id);
        await notify(tx, {
          userId: session.customerUserId!,
          type: "session.declined",
          title: "Anfrage abgelehnt",
          body: "Der Creator hat deine Anfrage abgelehnt. Es wurden keine Münzen berechnet.",
          linkPath: `/sessions/${sessionId}`,
        });
        return row!;
      }
      if (!(await creatorMayOperate(tx, actor.id))) throw invalidState("Dein Konto ist für private Chats nicht freigeschaltet.");
      // Laufenden öffentlichen Stream beenden – der Creator wechselt in den privaten Chat.
      const [stream] = await tx
        .select()
        .from(videoSessions)
        .where(
          and(eq(videoSessions.creatorUserId, actor.id), eq(videoSessions.kind, "public_stream"), eq(videoSessions.status, "active")),
        )
        .for("update");
      if (stream) await finishSession(tx, stream, "stream_ended", now);
      const room = await provider.createRoom({ sessionId, kind: "private_chat" });
      const [row] = await tx
        .update(videoSessions)
        .set({
          status: target,
          acceptedAt: now,
          providerRoomId: room.roomId,
          expiresAt: new Date(now.getTime() + videoConfig.requestTtlSeconds * 1000),
        })
        .where(eq(videoSessions.id, sessionId))
        .returning();
      await tx
        .update(creatorProfiles)
        .set({ availability: "in_private" })
        .where(eq(creatorProfiles.id, session.creatorProfileId));
      await recordEvent(tx, sessionId, "accepted", "server", actor.id);
      await notify(tx, {
        userId: session.customerUserId!,
        type: "session.accepted",
        title: "Anfrage angenommen",
        body: "Der Creator hat angenommen. Tritt jetzt der Sitzung bei.",
        linkPath: `/sessions/${sessionId}`,
      });
      return row!;
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === "video_sessions_one_private_per_creator") {
      throw new AppError("conflict", "Du befindest dich bereits in einem privaten Chat.");
    }
    throw error;
  }
}

export async function cancelRequest(actor: Actor, sessionId: string) {
  return getDb().transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.customerUserId !== actor.id) throw notFound("Anfrage nicht gefunden.");
    if (session.status !== "requested" && session.status !== "accepted") {
      throw invalidState("Diese Anfrage kann nicht mehr storniert werden.");
    }
    const updated = await finishSession(tx, session, "customer_left", new Date());
    await recordEvent(tx, sessionId, "cancelled", "server", actor.id);
    return updated;
  });
}

/**
 * Beitritt: prüft serverseitig die Berechtigung und gibt ein kurzlebiges,
 * an Nutzer und Sitzung gebundenes Token aus. Sobald beide Teilnehmer
 * verbunden sind, beginnt die Sitzung und die erste Minute wird berechnet.
 */
export async function joinPrivateSession(actor: Actor, sessionId: string) {
  const provider = requireProvider();
  await sweepSessions();
  return getDb().transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.kind !== "private_chat" || !canJoinSession(actor, session)) throw notFound("Sitzung nicht gefunden.");
    if (session.status !== "accepted" && session.status !== "active") throw invalidState("Dieser Sitzung kann nicht beigetreten werden.");
    const role = actor.id === session.creatorUserId ? "creator" : "customer";
    const now = new Date();
    await tx
      .insert(videoSessionParticipants)
      .values({ sessionId, userId: actor.id, role, joinedAt: now, lastHeartbeatAt: now })
      .onConflictDoUpdate({
        target: [videoSessionParticipants.sessionId, videoSessionParticipants.userId],
        set: { leftAt: null, lastHeartbeatAt: now },
      });
    // Im Mock-Modus simuliert der Server das Anbieter-Ereignis „Teilnehmer verbunden“.
    await recordEvent(tx, sessionId, "participant_joined", "provider", actor.id, { simulated: !provider.isReal, role }, `${provider.name}:${randomToken(12)}`);

    let current = session;
    if (session.status === "accepted") {
      const connected = await tx
        .select({ userId: videoSessionParticipants.userId })
        .from(videoSessionParticipants)
        .where(and(eq(videoSessionParticipants.sessionId, sessionId), isNull(videoSessionParticipants.leftAt)));
      const ids = new Set(connected.map((p) => p.userId));
      if (ids.has(session.creatorUserId) && session.customerUserId && ids.has(session.customerUserId)) {
        const [started] = await tx
          .update(videoSessions)
          .set({ status: nextStatus("accepted", "start")!, startedAt: now, expiresAt: null })
          .where(eq(videoSessions.id, sessionId))
          .returning();
        await recordEvent(tx, sessionId, "started", "server", null);
        current = await settleBilling(tx, started!, now);
      }
    } else {
      current = await settleBilling(tx, session, now);
    }
    const token = provider.issueJoinToken({ sid: sessionId, sub: actor.id, role }, videoConfig.joinTokenTtlSeconds);
    return { session: current, token: token.token, tokenExpiresAt: token.expiresAt, role };
  });
}

/** Herzschlag eines Teilnehmers. Löst serverseitige Abrechnung und Timeout-Prüfung aus. */
export async function heartbeat(actor: Actor, sessionId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || !canViewSession(actor, session) || actor.role === "admin") throw notFound("Sitzung nicht gefunden.");
    const updated = await tx
      .update(videoSessionParticipants)
      .set({ lastHeartbeatAt: now })
      .where(
        and(
          eq(videoSessionParticipants.sessionId, sessionId),
          eq(videoSessionParticipants.userId, actor.id),
          isNull(videoSessionParticipants.leftAt),
        ),
      )
      .returning({ id: videoSessionParticipants.id });
    if (updated.length === 0) return session;
    let current = await settleBilling(tx, session, now);
    if (current.status === "active") {
      const cutoff = new Date(now.getTime() - videoConfig.heartbeatTimeoutSeconds * 1000);
      const [lost] = await tx
        .select({ id: videoSessionParticipants.id })
        .from(videoSessionParticipants)
        .where(
          and(
            eq(videoSessionParticipants.sessionId, sessionId),
            isNull(videoSessionParticipants.leftAt),
            lt(videoSessionParticipants.lastHeartbeatAt, cutoff),
          ),
        )
        .limit(1);
      if (lost) current = await finishSession(tx, current, "connection_lost", now);
    }
    return current;
  });
}

export async function leaveSession(actor: Actor, sessionId: string) {
  return getDb().transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.kind !== "private_chat" || !canJoinSession(actor, session)) throw notFound("Sitzung nicht gefunden.");
    if (isTerminal(session.status)) return session;
    const now = new Date();
    const settled = await settleBilling(tx, session, now);
    if (isTerminal(settled.status)) return settled;
    const reason: EndReason = actor.id === session.creatorUserId ? "creator_left" : "customer_left";
    await recordEvent(tx, sessionId, "participant_left", "server", actor.id);
    return finishSession(tx, settled, reason, now);
  });
}

/** Moderation: Admin beendet eine laufende Sitzung (ohne ihr beizutreten). */
export async function endSessionByModeration(adminId: string, sessionId: string, tx: Transaction) {
  const session = await lockSession(tx, sessionId);
  if (!session || isTerminal(session.status)) return session;
  await recordEvent(tx, sessionId, "moderation_end", "server", adminId);
  return finishSession(tx, session, "moderation", new Date());
}

// ── Öffentliche Streams ─────────────────────────────────────────────────────

async function ownProfile(tx: Transaction, actor: Actor) {
  const [profile] = await tx.select().from(creatorProfiles).where(eq(creatorProfiles.userId, actor.id)).for("update");
  if (!profile) throw notFound("Kein Creator-Profil vorhanden.");
  return profile;
}

export async function setAvailability(actor: Actor, availability: "online" | "offline" | "live") {
  if (!hasPermission(actor, "studio.availability.set")) {
    throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  try {
    return await getDb().transaction(async (tx) => {
      const profile = await ownProfile(tx, actor);
      if (profile.availability === "in_private") throw invalidState("Beende zuerst deinen laufenden privaten Chat.");
      const now = new Date();
      const [stream] = await tx
        .select()
        .from(videoSessions)
        .where(and(eq(videoSessions.creatorUserId, actor.id), eq(videoSessions.kind, "public_stream"), eq(videoSessions.status, "active")))
        .for("update");

      if (availability === "offline" || availability === "online") {
        if (stream) await finishSession(tx, stream, "stream_ended", now);
        await tx.update(creatorProfiles).set({ availability, lastOnlineAt: now }).where(eq(creatorProfiles.id, profile.id));
        return { availability };
      }

      // availability === "live"
      if (profile.reviewStatus !== "approved") throw invalidState("Dein Profil muss zuerst freigegeben werden.");
      if (!(await creatorMayOperate(tx, actor.id))) {
        throw invalidState("Live-Funktionen sind erst nach erfolgreicher Alters- und Identitätsprüfung verfügbar.");
      }
      const provider = requireProvider();
      if (!stream) {
        const [created] = await tx
          .insert(videoSessions)
          .values({
            kind: "public_stream",
            creatorProfileId: profile.id,
            creatorUserId: actor.id,
            status: "active",
            provider: provider.name,
            startedAt: now,
            currency: "TEST_COIN",
          })
          .returning();
        const room = await provider.createRoom({ sessionId: created!.id, kind: "public_stream" });
        await tx.update(videoSessions).set({ providerRoomId: room.roomId }).where(eq(videoSessions.id, created!.id));
        await recordEvent(tx, created!.id, "stream_started", "server", actor.id, { simulated: !provider.isReal });
      }
      await tx.update(creatorProfiles).set({ availability: "live", lastOnlineAt: now }).where(eq(creatorProfiles.id, profile.id));
      return { availability };
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new AppError("conflict", "Es läuft bereits ein Stream.");
    throw error;
  }
}

export async function joinPublicStream(actor: Actor, creatorProfileId: string) {
  const provider = requireProvider();
  return getDb().transaction(async (tx) => {
    const [stream] = await tx
      .select()
      .from(videoSessions)
      .where(
        and(
          eq(videoSessions.creatorProfileId, creatorProfileId),
          eq(videoSessions.kind, "public_stream"),
          eq(videoSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!stream) throw invalidState("Derzeit läuft kein öffentlicher Stream.");
    if (!canJoinSession(actor, stream)) throw forbidden("Bitte melde dich mit einem Kundenkonto an, um Streams anzusehen.");
    const role = actor.id === stream.creatorUserId ? "creator" : "viewer";
    const now = new Date();
    await tx
      .insert(videoSessionParticipants)
      .values({ sessionId: stream.id, userId: actor.id, role, joinedAt: now, lastHeartbeatAt: now })
      .onConflictDoUpdate({
        target: [videoSessionParticipants.sessionId, videoSessionParticipants.userId],
        set: { leftAt: null, lastHeartbeatAt: now },
      });
    const token = provider.issueJoinToken({ sid: stream.id, sub: actor.id, role }, videoConfig.joinTokenTtlSeconds);
    return { sessionId: stream.id, startedAt: stream.startedAt, token: token.token, tokenExpiresAt: token.expiresAt };
  });
}

export async function getActiveStream(creatorProfileId: string) {
  const db = getDb();
  const [stream] = await db
    .select({ id: videoSessions.id, startedAt: videoSessions.startedAt })
    .from(videoSessions)
    .where(
      and(
        eq(videoSessions.creatorProfileId, creatorProfileId),
        eq(videoSessions.kind, "public_stream"),
        eq(videoSessions.status, "active"),
      ),
    )
    .limit(1);
  if (!stream) return null;
  const cutoff = new Date(Date.now() - videoConfig.heartbeatTimeoutSeconds * 1000);
  const [viewers] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(videoSessionParticipants)
    .where(
      and(
        eq(videoSessionParticipants.sessionId, stream.id),
        eq(videoSessionParticipants.role, "viewer"),
        isNull(videoSessionParticipants.leftAt),
        gt(videoSessionParticipants.lastHeartbeatAt, cutoff),
      ),
    );
  return { ...stream, viewerCount: viewers?.value ?? 0 };
}

// ── Ansichten ───────────────────────────────────────────────────────────────

export type SessionView = {
  id: string;
  kind: SessionRow["kind"];
  status: SessionStatus;
  viewerRole: "customer" | "creator" | "admin";
  creator: { displayName: string; slug: string };
  customerName: string | null;
  coinsPerMinute: number | null;
  commissionBps: number | null;
  currency: SessionRow["currency"];
  requestedAt: Date;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: SessionRow["endReason"];
  chargedMinutes: number;
  totalCoins: number;
  joined: boolean;
  counterpartConnected: boolean;
  simulatedVideo: boolean;
};

/** Sitzungsdetails – nur für Teilnehmer und Admins (sonst null → 404). */
export async function getSessionView(actor: Actor, sessionId: string): Promise<SessionView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  await sweepSessions();
  const db = getDb();
  const [row] = await db
    .select({ session: videoSessions, displayName: creatorProfiles.displayName, slug: creatorProfiles.slug })
    .from(videoSessions)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, videoSessions.creatorProfileId))
    .where(eq(videoSessions.id, sessionId))
    .limit(1);
  if (!row || !canViewSession(actor, row.session)) return null;
  const session = row.session;
  let customerName: string | null = null;
  if (session.customerUserId) {
    const [customer] = await db.select({ username: users.username }).from(users).where(eq(users.id, session.customerUserId)).limit(1);
    customerName = customer?.username ?? null;
  }
  const participants = await db
    .select()
    .from(videoSessionParticipants)
    .where(and(eq(videoSessionParticipants.sessionId, sessionId), isNull(videoSessionParticipants.leftAt)));
  const cutoff = Date.now() - videoConfig.heartbeatTimeoutSeconds * 1000;
  const me = participants.find((p) => p.userId === actor.id);
  const counterpart = participants.find((p) => p.userId !== actor.id && p.lastHeartbeatAt.getTime() > cutoff);
  const viewerRole = actor.role === "admin" ? "admin" : actor.id === session.creatorUserId ? "creator" : "customer";
  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    viewerRole,
    creator: { displayName: row.displayName, slug: row.slug },
    customerName,
    coinsPerMinute: session.coinsPerMinute,
    commissionBps: session.commissionBps,
    currency: session.currency,
    requestedAt: session.requestedAt,
    expiresAt: session.expiresAt,
    acceptedAt: session.acceptedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    chargedMinutes: session.chargedMinutes,
    totalCoins: session.totalCoins,
    joined: !!me,
    counterpartConnected: !!counterpart,
    simulatedVideo: !getVideoProvider()?.isReal,
  };
}

export async function listSessionsForUser(actor: Actor, limit = 50) {
  await sweepSessions();
  const column = actor.role === "creator" ? videoSessions.creatorUserId : videoSessions.customerUserId;
  return getDb()
    .select({
      id: videoSessions.id,
      kind: videoSessions.kind,
      status: videoSessions.status,
      requestedAt: videoSessions.requestedAt,
      startedAt: videoSessions.startedAt,
      endedAt: videoSessions.endedAt,
      endReason: videoSessions.endReason,
      chargedMinutes: videoSessions.chargedMinutes,
      totalCoins: videoSessions.totalCoins,
      coinsPerMinute: videoSessions.coinsPerMinute,
      commissionBps: videoSessions.commissionBps,
      creatorName: creatorProfiles.displayName,
      creatorSlug: creatorProfiles.slug,
      customerName: users.username,
    })
    .from(videoSessions)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, videoSessions.creatorProfileId))
    .leftJoin(users, eq(users.id, videoSessions.customerUserId))
    .where(and(eq(column, actor.id), eq(videoSessions.kind, "private_chat")))
    .orderBy(desc(videoSessions.requestedAt))
    .limit(limit);
}

export async function listOpenRequestsForCreator(actor: Actor) {
  await sweepSessions();
  return getDb()
    .select({
      id: videoSessions.id,
      status: videoSessions.status,
      requestedAt: videoSessions.requestedAt,
      expiresAt: videoSessions.expiresAt,
      coinsPerMinute: videoSessions.coinsPerMinute,
      customerName: users.username,
    })
    .from(videoSessions)
    .innerJoin(users, eq(users.id, videoSessions.customerUserId))
    .where(
      and(
        eq(videoSessions.creatorUserId, actor.id),
        eq(videoSessions.kind, "private_chat"),
        inArray(videoSessions.status, ["requested", "accepted", "active"]),
      ),
    )
    .orderBy(desc(videoSessions.requestedAt));
}

/** Offene/aktive Sitzung eines Kunden (für Hinweise im UI). */
export async function getOpenSessionForCustomer(customerUserId: string) {
  const [row] = await getDb()
    .select({ id: videoSessions.id, status: videoSessions.status })
    .from(videoSessions)
    .where(
      and(
        eq(videoSessions.customerUserId, customerUserId),
        eq(videoSessions.kind, "private_chat"),
        inArray(videoSessions.status, ["requested", "accepted", "active"]),
      ),
    )
    .limit(1);
  return row ?? null;
}
