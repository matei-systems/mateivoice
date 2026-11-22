import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, LifeBuoy, ShieldCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Support, Meldungen zu Sicherheit und Jugendschutz, Datenschutzanfragen und Anbieterkennzeichnung.",
};

/** Kontaktwege. Bewusst ohne erfundene Adressen – die Anbieterdaten folgen nach Gründung im Impressum. */
export default function ContactPage() {
  const channels = [
    {
      icon: LifeBuoy,
      title: "Support",
      text: "Fragen zu Konto, Münzen, Zahlungen oder Technik. Wir antworten in deinem Konto bzw. per E-Mail.",
      link: { href: "/support", label: "Support-Anfrage stellen" },
    },
    {
      icon: AlertTriangle,
      title: "Sicherheit & Jugendschutz",
      text: "Hinweise auf Minderjährige, nicht einvernehmliche oder rechtswidrige Inhalte werden mit höchster Priorität bearbeitet – auch ohne Konto. In akuten Notfällen: Polizei (AT 133, DE 110, CH 117).",
      link: { href: "/support?category=safety", label: "Sicherheitsproblem melden" },
    },
    {
      icon: ShieldCheck,
      title: "Datenschutz",
      text: "Auskunft und Export sind in deinem Konto möglich. Für Berichtigung, Widerspruch oder Fragen nutze den Support (Kategorie Datenschutz).",
      link: { href: "/support?category=privacy", label: "Datenschutzanfrage" },
    },
    {
      icon: Building2,
      title: "Anbieter & Behörden",
      text: "Anbieterkennzeichnung (Impressum) und Kontaktstelle für Behörden nach dem Digital Services Act werden mit der Unternehmensgründung veröffentlicht.",
      link: { href: "/legal/imprint", label: "Impressum (Entwurf)" },
    },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 pt-12 pb-8 sm:px-6 lg:pt-16">
      <SectionHeading eyebrow="Kontakt" title="So erreichst du uns" description="Wähle den passenden Weg – so landet dein Anliegen direkt beim richtigen Team." />
      <div className="grid gap-5 sm:grid-cols-2">
        {channels.map((channel) => (
          <Card key={channel.title}>
            <CardBody className="space-y-3">
              <channel.icon className="size-6 text-brand-700" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink-950">{channel.title}</h2>
              <p className="text-sm leading-relaxed text-ink-600">{channel.text}</p>
              <Link href={channel.link.href} className="inline-flex text-sm font-semibold text-brand-700 hover:underline">
                {channel.link.label} →
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
