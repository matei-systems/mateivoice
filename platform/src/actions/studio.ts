"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission } from "@/server/auth/current";
import { submitProfileForReview, updateOwnPricing, updateOwnProfile } from "@/server/creators/service";
import { AppError } from "@/server/errors";
import { deleteOwnMedia, uploadCreatorImage } from "@/server/media/service";
import { simulateMockVerification, startVerification } from "@/server/verification/service";
import { formBool, formString, runAction } from "./helpers";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.profile.edit");
    const result = await updateOwnProfile(actor, {
      displayName: formString(formData, "displayName"),
      tagline: formString(formData, "tagline"),
      bio: formString(formData, "bio"),
      contactRules: formString(formData, "contactRules"),
      languages: formData.getAll("languages").filter((v): v is string => typeof v === "string"),
      tags: formData.getAll("tags").filter((v): v is string => typeof v === "string"),
      allowSearchIndexing: formBool(formData, "allowSearchIndexing"),
    });
    refresh();
    return {
      status: "success",
      message: result.needsReview
        ? "Gespeichert. Da dein Profil bereits freigegeben war, wird die Änderung vor der Veröffentlichung erneut geprüft."
        : "Profil gespeichert.",
    };
  });
}

export async function updatePricingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.pricing.edit");
    await updateOwnPricing(actor, { coinsPerMinute: formString(formData, "coinsPerMinute"), enabled: formBool(formData, "enabled") });
    refresh();
  }, "Preis gespeichert. Laufende Sitzungen behalten ihren vereinbarten Preis.");
}

export async function uploadImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.profile.edit");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("validation", "Bitte wähle eine Bilddatei aus.");
    await uploadCreatorImage(actor, file, formString(formData, "kind") === "avatar" ? "avatar" : "gallery");
    refresh();
  }, "Bild hochgeladen. Es wird nach der Prüfung öffentlich sichtbar.");
}

export async function deleteImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.profile.edit");
    await deleteOwnMedia(actor, formString(formData, "mediaId"));
    refresh();
  }, "Bild gelöscht.");
}

export async function submitForReviewAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.profile.edit");
    await submitProfileForReview(actor);
    refresh();
  }, "Dein Profil wurde zur Prüfung eingereicht.");
}

export async function startVerificationAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.verification.manage");
    await startVerification(actor.id);
    refresh();
  }, "Prüfung gestartet (Mock-Anbieter). Es findet keine echte Alters- oder Identitätsprüfung statt.");
}

export async function simulateVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.verification.manage");
    const outcome = formString(formData, "outcome") === "rejected" ? "rejected" : "test_passed";
    await simulateMockVerification(actor.id, outcome);
    refresh();
  }, "Simuliertes Ergebnis gespeichert. Der Status bleibt „nicht verifiziert“.");
}
