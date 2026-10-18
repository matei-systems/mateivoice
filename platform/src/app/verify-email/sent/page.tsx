import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getEnv } from "@/config/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "E-Mail bestätigen", robots: { index: false } };

export default function VerifyEmailSentPage() {
  const devOutbox = getEnv().EMAIL_PROVIDER === "dev-outbox" && getEnv().APP_ENV !== "production";
  return (
    <AuthShell title="Fast geschafft" description="Bitte bestätige deine E-Mail-Adresse.">
      <div className="space-y-5">
        <div className="grid size-14 animate-pop place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <MailCheck className="size-7" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-ink-700">
          Falls die Registrierung möglich war, haben wir dir eine Nachricht mit einem Bestätigungslink geschickt. Der Link ist 24 Stunden gültig.
          Danach kannst du dich anmelden.
        </p>
        {devOutbox ? (
          <Alert tone="test" title="Testmodus: Es werden keine echten E-Mails versendet">
            Nachrichten landen in der{" "}
            <Link href="/dev/mailbox" className="font-semibold underline underline-offset-2">
              Entwicklungs-Mailbox
            </Link>
            .
          </Alert>
        ) : (
          <Alert tone="warning" title="E-Mail-Versand noch nicht aktiv">
            Es ist noch kein E-Mail-Anbieter angebunden. Bitte wende dich an den Support.
          </Alert>
        )}
        <ButtonLink href="/login" variant="secondary" className="w-full">
          Zur Anmeldung
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
