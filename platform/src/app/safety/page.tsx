import type { Metadata } from "next";
import Link from "next/link";
import { BulletList, ProsePage, ProseSection } from "@/components/content/prose-page";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Sicherheit & Jugendschutz",
  description: "Wie die Plattform Minderjährige ausschließt, Missbrauch verhindert und Meldungen bearbeitet.",
};

export default function SafetyPage() {
  return (
    <ProsePage eyebrow="Sicherheit" title="Sicherheit & Jugendschutz" description="Was wir tun – und wo die Grenzen liegen.">
      <Alert tone="danger" title="Akute Gefahr?">
        Wende dich bitte sofort an die Polizei (Notruf 133) oder den Euro-Notruf 112. Hinweise auf Missbrauch Minderjähriger kannst du zusätzlich bei
        den zuständigen Meldestellen einbringen.
      </Alert>
      <ProseSection title="Ausschließlich für Erwachsene">
        <BulletList
          items={[
            "Gäste sehen einen Altershinweis; Kundinnen und Kunden bestätigen bei der Registrierung ihre Volljährigkeit (Selbstauskunft).",
            "Creator werden im Echtbetrieb erst nach einer Alters- und Identitätsprüfung durch einen spezialisierten Anbieter freigeschaltet. Der Anbieter wird derzeit ausgewählt – bis dahin trägt kein Profil das Merkmal „verifiziert“.",
            "Die Seite ist für Jugendschutzfilter als „adult“ gekennzeichnet.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Melden & Moderation">
        <BulletList
          items={[
            "Jedes Profil und jede eigene Sitzung kann gemeldet werden.",
            "Hinweise auf Minderjährige, nicht einvernehmliche oder rechtswidrige Inhalte werden als „kritisch“ priorisiert; alle Admins werden sofort benachrichtigt.",
            "Jede Entscheidung wird begründet und im unveränderlichen Audit-Protokoll festgehalten.",
            "Gegen Sanktionen kann Einspruch eingelegt werden.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Privatsphäre">
        <BulletList
          items={[
            "Private Chats werden standardmäßig nicht aufgezeichnet.",
            "Bildschirmaufnahmen durch Gegenüber lassen sich technisch nicht vollständig verhindern. Aufnahmen sind verboten und werden sanktioniert.",
            "Hochgeladene Bilder werden neu kodiert; Standort- und Kameradaten (EXIF) werden entfernt.",
          ]}
        />
      </ProseSection>
      <p className="text-sm text-ink-600">
        Details: <Link href="/legal/community-guidelines" className="font-medium text-brand-700 hover:underline">Community-Richtlinien</Link> ·{" "}
        <Link href="/support?category=safety" className="font-medium text-brand-700 hover:underline">Sicherheitsanliegen melden</Link>
      </p>
    </ProsePage>
  );
}
