"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, assertSession, clearSessionCookie, getRequestContext } from "@/server/auth/current";
import {
  changePassword,
  confirmTotpEnrollment,
  deleteAccount,
  disableTotp,
  startTotpEnrollment,
  updateUsername,
} from "@/server/auth/service";
import { invalidateAllUserSessions } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { grantTestCoins } from "@/server/ledger/service";
import { markNotificationsRead, updateNotificationPreferences } from "@/server/notifications/service";
import { formBool, formString, runAction } from "./helpers";

export async function requestTestCoinsAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("wallet.request_test_credit");
    const result = await grantTestCoins(actor.id);
    refresh();
    return { status: "success", message: `${result.amount} Testmünzen gutgeschrieben (simuliert, ohne Geldwert).` };
  });
}

export async function updateUsernameAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("account.manage");
    await updateUsername(actor.id, formString(formData, "username"));
    refresh();
  }, "Nutzername gespeichert.");
}

export async function updatePreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("account.manage");
    await updateNotificationPreferences(actor.id, {
      emailSessionUpdates: formBool(formData, "emailSessionUpdates"),
      emailMarketing: formBool(formData, "emailMarketing"),
      inAppSessionUpdates: formBool(formData, "inAppSessionUpdates"),
    });
  }, "Einstellungen gespeichert.");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await assertSession();
  await markNotificationsRead(session.user.id);
  refresh();
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    if (formString(formData, "newPassword") !== formString(formData, "newPasswordConfirm")) {
      throw new AppError("validation", "Die neuen Passwörter stimmen nicht überein.");
    }
    await changePassword({
      userId: session.user.id,
      currentSessionId: session.sessionId,
      currentPassword: formString(formData, "currentPassword"),
      newPassword: formString(formData, "newPassword"),
    });
  }, "Passwort geändert. Alle anderen Sitzungen wurden abgemeldet.");
}

export async function startTotpAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await startTotpEnrollment(session.user.id);
    refresh();
  }, "Scanne jetzt den QR-Code und bestätige mit einem Code.");
}

export async function confirmTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await confirmTotpEnrollment({ userId: session.user.id, sessionId: session.sessionId, code: formString(formData, "code") }, await getRequestContext());
    refresh();
  }, "Zwei-Faktor-Authentifizierung ist aktiv.");
}

export async function disableTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await disableTotp({ userId: session.user.id, password: formString(formData, "password"), code: formString(formData, "code") });
    refresh();
  }, "Zwei-Faktor-Authentifizierung wurde deaktiviert.");
}

export async function signOutOtherSessionsAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const session = await assertSession();
    await invalidateAllUserSessions(getDb(), session.user.id, session.sessionId);
    refresh();
  }, "Alle anderen Sitzungen wurden abgemeldet.");
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let done = false;
  const state = await runAction(async () => {
    const session = await assertSession();
    await deleteAccount({
      userId: session.user.id,
      password: formString(formData, "password"),
      confirmation: formString(formData, "confirmation"),
    });
    await clearSessionCookie();
    done = true;
  });
  if (done) redirect("/?konto=geloescht");
  return state;
}
