import type { Metadata } from "next";
import { unsubscribeAction } from "@/actions/account";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "E-Mails abbestellen", robots: { index: false, follow: false } };

/** Abmeldung optionaler E-Mails. Bestätigung per Klick (Link-Vorschauen lösen keine Abmeldung aus). */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <AuthShell title="E-Mails abbestellen" description="Optionale Benachrichtigungen kannst du jederzeit abbestellen. Für dein Konto notwendige Nachrichten (z. B. Sicherheit, Käufe) erhältst du weiterhin.">
      {token ? (
        <ActionForm action={unsubscribeAction} submitLabel="Abbestellen bestätigen" fullWidthSubmit inlineSuccess>
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      ) : (
        <Alert tone="danger">Der Abmeldelink ist unvollständig.</Alert>
      )}
    </AuthShell>
  );
}
