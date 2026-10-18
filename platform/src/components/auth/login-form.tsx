"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="email" label="E-Mail-Adresse">
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field id="password" label="Passwort">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
          Passwort vergessen?
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Anmeldung läuft …">
        Anmelden
      </SubmitButton>
    </form>
  );
}
