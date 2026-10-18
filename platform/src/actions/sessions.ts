"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, assertSession, toActor } from "@/server/auth/current";
import { AppError } from "@/server/errors";
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
} from "@/server/video/service";
import { formString, runAction } from "./helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(value: string, label = "Sitzung") {
  if (!UUID.test(value)) throw new AppError("validation", `${label} ungültig.`);
  return value;
}

export async function requestPrivateSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const state = await runAction(async () => {
    const { actor } = await assertPermission("sessions.request_private");
    const session = await requestPrivateSession(actor, requireId(formString(formData, "creatorProfileId"), "Profil"));
    target = `/sessions/${session.id}`;
  });
  if (target) redirect(target);
  return state;
}

export async function respondToRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const decision = formString(formData, "decision") === "accept" ? "accept" : "decline";
  let target: string | null = null;
  const state = await runAction(async () => {
    const { actor } = await assertPermission("studio.sessions.manage");
    const session = await respondToRequest(actor, requireId(formString(formData, "sessionId")), decision);
    if (decision === "accept") target = `/sessions/${session.id}`;
    else refresh();
  }, "Anfrage abgelehnt. Es wurden keine Münzen berechnet.");
  if (target) redirect(target);
  return state;
}

export async function cancelRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await cancelRequest(toActor(session)!, requireId(formString(formData, "sessionId")));
    refresh();
  }, "Anfrage storniert. Es wurden keine Münzen berechnet.");
}

export async function setAvailabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const value = formString(formData, "availability");
  const availability = value === "live" ? "live" : value === "online" ? "online" : "offline";
  return runAction(async () => {
    const { actor } = await assertPermission("studio.availability.set");
    await setAvailability(actor, availability);
    refresh();
  }, availability === "live" ? "Du bist jetzt live (simuliert)." : availability === "online" ? "Du bist jetzt online." : "Du bist jetzt offline.");
}

/** Client-Aufrufe aus dem Sitzungsraum (Beitritt, Herzschlag, Verlassen). */
export type SessionClientState = {
  ok: boolean;
  message?: string;
  status?: string;
  chargedMinutes?: number;
  totalCoins?: number;
  startedAt?: string | null;
  endReason?: string | null;
  counterpartConnected?: boolean;
  joined?: boolean;
  tokenExpiresAt?: string;
};

async function snapshot(sessionId: string): Promise<SessionClientState> {
  const session = await assertSession();
  const view = await getSessionView(toActor(session)!, sessionId);
  if (!view) return { ok: false, message: "Sitzung nicht gefunden." };
  return {
    ok: true,
    status: view.status,
    chargedMinutes: view.chargedMinutes,
    totalCoins: view.totalCoins,
    startedAt: view.startedAt?.toISOString() ?? null,
    endReason: view.endReason,
    counterpartConnected: view.counterpartConnected,
    joined: view.joined,
  };
}

async function guard(fn: () => Promise<SessionClientState>): Promise<SessionClientState> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.userMessage };
    return { ok: false, message: "Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut." };
  }
}

export async function joinSessionAction(sessionId: string): Promise<SessionClientState> {
  return guard(async () => {
    const session = await assertSession();
    const result = await joinPrivateSession(toActor(session)!, requireId(sessionId));
    // Das Beitritts-Token würde an das Video-SDK übergeben. Im Mock-Modus wird
    // es nicht an den Browser ausgeliefert, da es keinen Videodienst gibt.
    return { ...(await snapshot(sessionId)), tokenExpiresAt: result.tokenExpiresAt.toISOString() };
  });
}

export async function heartbeatAction(sessionId: string): Promise<SessionClientState> {
  return guard(async () => {
    const session = await assertSession();
    await heartbeat(toActor(session)!, requireId(sessionId));
    return snapshot(sessionId);
  });
}

export async function sessionStateAction(sessionId: string): Promise<SessionClientState> {
  return guard(() => snapshot(requireId(sessionId)));
}

export async function leaveSessionAction(sessionId: string): Promise<SessionClientState> {
  return guard(async () => {
    const session = await assertSession();
    await leaveSession(toActor(session)!, requireId(sessionId));
    return snapshot(sessionId);
  });
}

export async function joinPublicStreamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    const result = await joinPublicStream(toActor(session)!, requireId(formString(formData, "creatorProfileId"), "Profil"));
    return {
      status: "success",
      message: "Verbunden (Simulation). Es wird kein echtes Video übertragen.",
      data: { sessionId: result.sessionId, tokenExpiresAt: result.tokenExpiresAt.toISOString() },
    };
  });
}
