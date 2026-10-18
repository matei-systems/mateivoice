"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { safeRedirectPath } from "@/lib/utils";
import {
  clearSessionCookie,
  getCurrentSession,
  getRequestContext,
  setSessionCookie,
} from "@/server/auth/current";
import { homePathFor } from "@/server/auth/permissions";
import {
  login,
  registerUser,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  verifyEmail,
  verifyLoginMfa,
} from "@/server/auth/service";
import { invalidateSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { formString, isBotSubmission, runAction } from "./helpers";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const state = await runAction(async () => {
    const result = await login({ email: formString(formData, "email"), password: formString(formData, "password") }, await getRequestContext());
    await setSessionCookie(result.token, result.expiresAt);
    const next = safeRedirectPath(formString(formData, "next"), "");
    target = result.mfaPending
      ? `/login/mfa${next ? `?next=${encodeURIComponent(next)}` : ""}`
      : next || homePathFor(result.role);
  });
  if (target) redirect(target);
  return state;
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (isBotSubmission(formData)) redirect("/verify-email/sent");
  let done = false;
  const state = await runAction(async () => {
    await registerUser(
      {
        email: formString(formData, "email"),
        username: formString(formData, "username"),
        password: formString(formData, "password"),
        role: formString(formData, "role"),
        confirmAdult: formData.get("confirmAdult") ?? undefined,
        acceptTerms: formData.get("acceptTerms") ?? undefined,
        acceptPrivacy: formData.get("acceptPrivacy") ?? undefined,
        acceptCreatorAgreement: formData.get("acceptCreatorAgreement") ?? undefined,
      },
      await getRequestContext(),
    );
    done = true;
  });
  if (done) redirect("/verify-email/sent");
  return state;
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) await invalidateSession(session.sessionId);
  await clearSessionCookie();
  redirect("/");
}

export async function mfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const state = await runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new AppError("unauthenticated", "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
    await verifyLoginMfa({ sessionId: session.sessionId, userId: session.user.id, code: formString(formData, "code") }, await getRequestContext());
    target = safeRedirectPath(formString(formData, "next"), "") || homePathFor(session.user.role);
  });
  if (target) redirect(target);
  return state;
}

export async function confirmEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await verifyEmail(formString(formData, "token"));
  if (result === "verified") redirect("/verify-email?status=verified");
  return { status: "error", message: "Der Bestätigungslink ist ungültig oder abgelaufen. Fordere im Konto einen neuen Link an." };
}

export async function resendVerificationAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const session = await getCurrentSession();
    if (!session || session.mfaPending) throw new AppError("unauthenticated", "Bitte melde dich an.");
    await resendVerificationEmail(session.user.id);
  }, "Wir haben dir einen neuen Bestätigungslink gesendet. Im Testmodus findest du ihn in der Entwicklungs-Mailbox.");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (isBotSubmission(formData)) return { status: "success", message: GENERIC_RESET_MESSAGE };
  return runAction(async () => {
    await requestPasswordReset(formString(formData, "email"), await getRequestContext());
  }, GENERIC_RESET_MESSAGE);
}

const GENERIC_RESET_MESSAGE =
  "Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir einen Link zum Zurücksetzen gesendet. Der Link ist 60 Minuten gültig.";

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let done = false;
  const state = await runAction(async () => {
    if (formString(formData, "password") !== formString(formData, "passwordConfirm")) {
      throw new AppError("validation", "Die Passwörter stimmen nicht überein.");
    }
    await resetPassword({ token: formString(formData, "token"), password: formString(formData, "password") });
    done = true;
  });
  if (done) redirect("/login?reset=1");
  return state;
}
