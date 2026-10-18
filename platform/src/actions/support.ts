"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertSession, getActor, getRequestContext } from "@/server/auth/current";
import { addUserMessage, createSupportTicket } from "@/server/support/service";
import { formString, isBotSubmission, runAction } from "./helpers";

export async function supportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (isBotSubmission(formData)) return { status: "success", message: "Danke, deine Anfrage wurde gespeichert." };
  return runAction(async () => {
    const actor = await getActor();
    const ticket = await createSupportTicket(
      actor,
      {
        category: formString(formData, "category"),
        subject: formString(formData, "subject"),
        message: formString(formData, "message"),
        email: formString(formData, "email"),
      },
      await getRequestContext(),
    );
    return {
      status: "success",
      message: actor
        ? "Danke! Deine Anfrage wurde gespeichert. Antworten findest du in deinem Konto unter „Support & Meldungen“."
        : "Danke! Deine Anfrage wurde gespeichert. Hinweis: E-Mail-Benachrichtigungen sind noch nicht aktiv – eine Antwort per E-Mail ist derzeit nicht automatisiert möglich.",
      data: { ticketId: ticket.id },
    };
  });
}

export async function supportReplyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await addUserMessage(session.user.id, formString(formData, "ticketId"), formString(formData, "body"));
    refresh();
  }, "Nachricht gesendet.");
}
