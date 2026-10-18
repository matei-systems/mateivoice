import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmEmailForm } from "@/components/auth/confirm-email-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "E-Mail bestätigen", robots: { index: false } };

/**
 * Bestätigung erst per Klick (POST) – E-Mail-Scanner, die Links automatisch
 * öffnen, lösen so keine Statusänderung aus.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  if (params.status === "verified") {
    return (
      <AuthShell title="E-Mail bestätigt">
        <div className="space-y-5">
          <CheckCircle2 className="size-12 animate-pop text-success-600" aria-hidden="true" />
          <p className="text-sm text-ink-700">Danke! Deine E-Mail-Adresse ist bestätigt. Alle Funktionen deines Kontos sind jetzt verfügbar.</p>
          <ButtonLink href="/login" className="w-full">
            Weiter
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <AuthShell title="E-Mail-Adresse bestätigen" description="Ein Klick genügt.">
      {token ? (
        <ConfirmEmailForm token={token} />
      ) : (
        <Alert tone="warning" title="Kein Bestätigungslink">
          Bitte öffne den Link aus der Bestätigungs-E-Mail.
        </Alert>
      )}
    </AuthShell>
  );
}
