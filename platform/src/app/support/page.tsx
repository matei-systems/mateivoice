import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/server/auth/current";
import { SupportForm } from "@/components/support/support-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Hilfe & Kontakt", description: "Fragen, Probleme oder Sicherheitsanliegen – wir helfen weiter." };

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const category = typeof params.category === "string" ? params.category : undefined;
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[1fr_22rem] lg:pt-14">
      <div className="space-y-6">
        <PageHeader eyebrow="Support" title="Hilfe & Kontakt" description="Schreib uns – Anfragen werden gespeichert und vom Team bearbeitet." />
        {category === "safety" ? (
          <Alert tone="danger" title="Sicherheitsanliegen">
            Bei akuter Gefahr wende dich sofort an die Polizei (Notruf 133). Angemeldete Nutzer können Profile und Sitzungen auch direkt melden.
          </Alert>
        ) : null}
        <Card>
          <CardBody>
            <SupportForm signedIn={!!user} defaultCategory={category} />
          </CardBody>
        </Card>
      </div>
      <aside className="space-y-4 lg:pt-24">
        <Card>
          <CardBody className="space-y-3 text-sm text-ink-700">
            <LifeBuoy className="size-6 text-brand-600" aria-hidden="true" />
            <p className="font-semibold text-ink-950">Häufige Themen</p>
            <ul className="space-y-2">
              <li>
                <Link href="/forgot-password" className="text-brand-700 hover:underline">Passwort vergessen</Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-brand-700 hover:underline">So funktioniert die Abrechnung</Link>
              </li>
              <li>
                <Link href="/safety" className="text-brand-700 hover:underline">Sicherheit & Jugendschutz</Link>
              </li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2 text-sm text-ink-700">
            <ShieldAlert className="size-6 text-brand-600" aria-hidden="true" />
            <p className="font-semibold text-ink-950">Ehrlicher Status</p>
            <p>Anfragen werden gespeichert und im Adminbereich bearbeitet. Automatische E-Mail-Antworten sind noch nicht aktiv.</p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
