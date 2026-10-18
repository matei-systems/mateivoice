import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/confirm-email-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Neues Passwort", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <AuthShell title="Neues Passwort festlegen" description="Danach werden alle bestehenden Anmeldungen beendet.">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="warning" title="Kein gültiger Link">
            Bitte öffne den Link aus der E-Mail oder fordere einen neuen an.
          </Alert>
          <ButtonLink href="/forgot-password" className="w-full">
            Neuen Link anfordern
          </ButtonLink>
        </div>
      )}
    </AuthShell>
  );
}
