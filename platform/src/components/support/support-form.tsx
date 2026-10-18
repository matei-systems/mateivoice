"use client";

import { useActionState } from "react";
import { supportAction } from "@/actions/support";
import { Field, FormMessage, Honeypot, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

const CATEGORIES = [
  { value: "account", label: "Konto & Anmeldung" },
  { value: "payments", label: "Münzen & Abrechnung" },
  { value: "technical", label: "Technisches Problem" },
  { value: "safety", label: "Sicherheit & Missbrauch" },
  { value: "creator", label: "Creator-Fragen" },
  { value: "privacy", label: "Datenschutz" },
  { value: "other", label: "Sonstiges" },
];

export function SupportForm({ signedIn, defaultCategory }: { signedIn: boolean; defaultCategory?: string }) {
  const [state, action] = useActionState(supportAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Honeypot />
      {!signedIn ? (
        <Field id="email" label="E-Mail-Adresse für Rückfragen">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      ) : null}
      <Field id="category" label="Thema">
        <Select id="category" name="category" required defaultValue={CATEGORIES.some((c) => c.value === defaultCategory) ? defaultCategory : ""}>
          <option value="" disabled>
            Bitte wählen …
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="subject" label="Betreff">
        <Input id="subject" name="subject" required minLength={3} maxLength={150} />
      </Field>
      <Field id="message" label="Nachricht" hint="Bitte keine Passwörter oder Zahlungsdaten angeben.">
        <Textarea id="message" name="message" required minLength={10} maxLength={5000} rows={6} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg">Anfrage senden</SubmitButton>
    </form>
  );
}
