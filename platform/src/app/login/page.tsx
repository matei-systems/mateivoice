import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { homePathFor } from "@/server/auth/permissions";
import { safeRedirectPath } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : "", "");
  const session = await getCurrentSession();
  if (session && !session.mfaPending) redirect(next || homePathFor(session.user.role));
  if (session?.mfaPending) redirect(`/login/mfa${next ? `?next=${encodeURIComponent(next)}` : ""}`);

  return (
    <AuthShell
      title="Willkommen zurück"
      description="Melde dich mit deiner E-Mail-Adresse an."
      footer={
        <>
          Noch kein Konto?{" "}
          <Link href="/register" className="font-semibold text-brand-700 hover:underline">
            Kostenlos registrieren
          </Link>
        </>
      }
    >
      {params.reset === "1" ? (
        <Alert tone="success" title="Passwort geändert" className="mb-5">
          Du kannst dich jetzt mit dem neuen Passwort anmelden. Alle anderen Sitzungen wurden beendet.
        </Alert>
      ) : null}
      <LoginForm next={next || undefined} />
    </AuthShell>
  );
}
