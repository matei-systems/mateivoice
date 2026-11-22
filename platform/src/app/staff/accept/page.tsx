import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { acceptStaffInviteAction } from "@/actions/staff";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";

export const metadata: Metadata = { title: "Einladung annehmen", robots: { index: false, follow: false } };

export default async function StaffAcceptPage({ searchParams }: PageProps<"/staff/accept">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <AuthShell title="Einladung in den Mitarbeiterbereich" description="Lege ein persönliches Passwort fest. Nach dem ersten Login richtest du die Zwei-Faktor-Anmeldung ein.">
      {!token ? (
        <Alert tone="danger">Der Einladungslink ist unvollständig.</Alert>
      ) : (
        <ActionForm action={acceptStaffInviteAction} submitLabel="Passwort festlegen" submitIcon={<KeyRound className="size-4" aria-hidden="true" />} fullWidthSubmit>
          <input type="hidden" name="token" value={token} />
          <Field id="password" label="Neues Passwort" hint="Mindestens 12 Zeichen. Nutze ein einzigartiges Passwort (Passwortmanager).">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </Field>
          <Field id="passwordConfirm" label="Passwort wiederholen">
            <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </Field>
        </ActionForm>
      )}
    </AuthShell>
  );
}
