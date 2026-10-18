"use server";

import type { ActionState } from "@/lib/action-state";
import { assertSession, toActor } from "@/server/auth/current";
import { createAppeal, createReport } from "@/server/moderation/service";
import { formString, runAction } from "./helpers";

export async function reportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    const result = await createReport(toActor(session)!, {
      targetType: formString(formData, "targetType"),
      targetId: formString(formData, "targetId"),
      category: formString(formData, "category"),
      description: formString(formData, "description"),
    });
    return {
      status: "success",
      message:
        result.priority === "critical"
          ? "Danke. Deine Meldung wurde mit höchster Priorität an das Moderationsteam übermittelt."
          : "Danke. Deine Meldung wurde gespeichert und wird vom Moderationsteam geprüft.",
    };
  });
}

export async function appealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await createAppeal(toActor(session)!, { sanctionId: formString(formData, "sanctionId"), message: formString(formData, "message") });
  }, "Dein Einspruch wurde eingereicht. Wir prüfen ihn und informieren dich über die Entscheidung.");
}
