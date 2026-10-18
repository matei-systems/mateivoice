"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/auth";
import { Field, FormMessage, Honeypot, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Honeypot />
      <Field id="email" label="E-Mail-Adresse">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Link anfordern
      </SubmitButton>
    </form>
  );
}
