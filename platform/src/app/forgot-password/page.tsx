import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Passwort vergessen", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Passwort vergessen?"
      description="Gib deine E-Mail-Adresse ein. Wenn ein Konto existiert, senden wir dir einen Link zum Zurücksetzen."
      footer={
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
