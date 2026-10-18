import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { homePathFor } from "@/server/auth/permissions";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Registrieren", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));
  const params = await searchParams;
  const role = params.role === "creator" ? "creator" : "customer";
  return (
    <AuthShell
      title="Konto erstellen"
      description="Kostenlos und in einer Minute. Ausschließlich für Erwachsene ab 18."
      footer={
        <>
          Bereits registriert?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Anmelden
          </Link>
        </>
      }
    >
      <RegisterForm initialRole={role} />
    </AuthShell>
  );
}
