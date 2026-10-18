"use client";

import Link from "next/link";
import { Sparkles, UserRound } from "lucide-react";
import { useActionState, useState } from "react";
import { registerAction } from "@/actions/auth";
import { Checkbox, Field, FormMessage, Honeypot, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "customer", title: "Kunde", text: "Streams ansehen und private Chats anfragen", icon: UserRound },
  { value: "creator", title: "Creator", text: "Eigenes Profil, eigene Preise, Live gehen", icon: Sparkles },
] as const;

export function RegisterForm({ initialRole }: { initialRole: "customer" | "creator" }) {
  const [state, action] = useActionState(registerAction, idleState);
  const [role, setRole] = useState<"customer" | "creator">(initialRole);
  return (
    <form action={action} className="space-y-5">
      <Honeypot />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-800">Kontoart</legend>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition",
                role === option.value ? "border-brand-500 bg-brand-50 shadow-glow" : "border-line-strong hover:border-brand-300",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="sr-only"
              />
              <option.icon className={cn("size-5", role === option.value ? "text-brand-600" : "text-ink-500")} aria-hidden="true" />
              <span className="text-sm font-semibold text-ink-950">{option.title}</span>
              <span className="text-xs leading-snug text-ink-600">{option.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="email" label="E-Mail-Adresse" hint="Für Bestätigung und Sicherheitsmeldungen. Wird nicht öffentlich angezeigt.">
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" maxLength={254} />
      </Field>
      <Field id="username" label="Nutzername" hint="3–24 Zeichen. Wird anderen angezeigt – bitte keinen Klarnamen verwenden.">
        <Input id="username" name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.\-]{3,24}" />
      </Field>
      <Field id="password" label="Passwort" hint="Mindestens 12 Zeichen. Eine Passphrase aus mehreren Wörtern ist ideal.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </Field>
      <div className="space-y-3 rounded-xl bg-brand-25 p-4 ring-1 ring-inset ring-line">
        <Checkbox id="confirmAdult" name="confirmAdult" required>
          Ich bin mindestens <strong>18 Jahre</strong> alt.
        </Checkbox>
        <Checkbox id="acceptTerms" name="acceptTerms" required>
          Ich akzeptiere die{" "}
          <Link href="/legal/terms" target="_blank" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Nutzungsbedingungen
          </Link>{" "}
          und{" "}
          <Link href="/legal/community-guidelines" target="_blank" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Community-Richtlinien
          </Link>{" "}
          (Entwurf).
        </Checkbox>
        <Checkbox id="acceptPrivacy" name="acceptPrivacy" required>
          Ich habe die{" "}
          <Link href="/legal/privacy" target="_blank" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Datenschutzinformation
          </Link>{" "}
          (Entwurf) gelesen.
        </Checkbox>
        {role === "creator" ? (
          <Checkbox id="acceptCreatorAgreement" name="acceptCreatorAgreement" required>
            Ich akzeptiere die{" "}
            <Link href="/legal/creator-agreement" target="_blank" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Creator-Vereinbarung
            </Link>{" "}
            (Entwurf) und weiß, dass Live-Funktionen erst nach einer Alters- und Identitätsprüfung freigeschaltet werden.
          </Checkbox>
        ) : null}
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Konto wird erstellt …">
        Konto erstellen
      </SubmitButton>
      <p className="text-xs leading-relaxed text-ink-600">
        Die Bestätigung „18+“ ist eine Selbstauskunft. Creator durchlaufen vor der Freischaltung eine gesonderte Prüfung.
      </p>
    </form>
  );
}
