import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { homePathFor } from "@/server/auth/permissions";
import { safeRedirectPath } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaForm } from "@/components/auth/mfa-form";

export const metadata: Metadata = { title: "Zwei-Faktor-Bestätigung", robots: { index: false } };

export default async function MfaPage({ searchParams }: PageProps<"/login/mfa">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : "", "");
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.user.totpEnabled) redirect(next || homePathFor(session.user.role));
  if (session.mfaVerified) redirect(next || homePathFor(session.user.role));

  return (
    <AuthShell title="Bestätigungscode" description="Gib den 6-stelligen Code aus deiner Authenticator-App ein.">
      <MfaForm next={next || undefined} />
    </AuthShell>
  );
}
