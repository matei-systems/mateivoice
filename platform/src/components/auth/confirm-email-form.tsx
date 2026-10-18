"use client";

import { useActionState } from "react";
import { confirmEmailAction, resetPasswordAction } from "@/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmailAction, idleState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        E-Mail-Adresse bestätigen
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, idleState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="Neues Passwort" hint="Mindestens 12 Zeichen.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </Field>
      <Field id="passwordConfirm" label="Passwort wiederholen">
        <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Passwort speichern
      </SubmitButton>
    </form>
  );
}
