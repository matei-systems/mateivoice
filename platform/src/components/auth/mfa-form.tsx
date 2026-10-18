"use client";

import { useActionState } from "react";
import { mfaAction } from "@/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

export function MfaForm({ next }: { next?: string }) {
  const [state, action] = useActionState(mfaAction, idleState);
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="code" label="Code" hint="Der Code ändert sich alle 30 Sekunden.">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center font-mono text-2xl tracking-[0.5em]"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Bestätigen
      </SubmitButton>
    </form>
  );
}
