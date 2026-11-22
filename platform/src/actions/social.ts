"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, assertSession, getRequestContext, toActor } from "@/server/auth/current";
import { deleteChatMessage, muteChatUser, postChatMessage } from "@/server/chat/service";
import { acceptDeclarations } from "@/server/compliance/declarations";
import { simulateAgeVerification, startAgeVerification } from "@/server/age/service";
import { AppError } from "@/server/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { addFavorite, blockUser, removeFavorite, unblockUser } from "@/server/social/service";
import { formBool, formString, runAction } from "./helpers";

// ── Chat ────────────────────────────────────────────────────────────────────

export async function sendChatMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("chat.participate");
    await postChatMessage(actor, formString(formData, "sessionId"), formString(formData, "body"));
    // Zustellung erfolgt über den Echtzeit-Kanal (kein Neuladen der Seite).
    return { status: "success", message: "" };
  });
}

export async function deleteChatMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await deleteChatMessage(toActor(session)!, formString(formData, "messageId"), formString(formData, "reason"));
  }, "Nachricht gelöscht.");
}

export async function muteChatUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    const minutesRaw = formString(formData, "minutes");
    await muteChatUser(toActor(session)!, {
      sessionId: formString(formData, "sessionId"),
      userId: formString(formData, "userId"),
      minutes: minutesRaw === "permanent" ? null : Number(minutesRaw || "30"),
      reason: formString(formData, "reason"),
    });
  }, "Person im Chat stummgeschaltet.");
}

// ── Favoriten & Blockieren ──────────────────────────────────────────────────

export async function toggleFavoriteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("favorites.manage");
    const creatorProfileId = formString(formData, "creatorProfileId");
    if (formBool(formData, "favorite")) await addFavorite(actor, creatorProfileId);
    else await removeFavorite(actor, creatorProfileId);
    refresh();
  }, "Favoriten aktualisiert.");
}

export async function blockUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("blocks.manage");
    await blockUser(actor, formString(formData, "userId"));
    refresh();
  }, "Blockiert. Ihr könnt euch keine Nachrichten oder Anfragen mehr senden.");
}

export async function unblockUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("blocks.manage");
    await unblockUser(actor, formString(formData, "userId"));
    refresh();
  }, "Blockierung aufgehoben.");
}

// ── Altersprüfung (Kunden) ──────────────────────────────────────────────────

export async function startAgeVerificationAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("age_verification.manage");
    await enforceRateLimit(`age:${actor.id}`, RATE_LIMITS.ageVerificationPerUser);
    await startAgeVerification(actor);
    refresh();
  }, "Altersprüfung gestartet.");
}

export async function simulateAgeVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("age_verification.manage");
    const outcome = formString(formData, "outcome") === "rejected" ? "rejected" : "test_passed";
    await simulateAgeVerification(actor, outcome);
    refresh();
  }, "Simuliertes Ergebnis gespeichert (Testmodus – keine echte Prüfung).");
}

// ── Erklärungen (Creator) ───────────────────────────────────────────────────

export async function acceptDeclarationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.profile.edit");
    const { ipHash } = await getRequestContext();
    const kinds = formData.getAll("declarations").filter((v): v is string => typeof v === "string");
    if (kinds.length === 0) throw new AppError("validation", "Bitte bestätige alle Erklärungen.");
    await acceptDeclarations(actor, kinds, ipHash);
    refresh();
  }, "Erklärungen gespeichert.");
}
