import type { Metadata } from "next";
import { BulletList, OpenPoint, ProsePage, ProseSection } from "@/components/content/prose-page";

export const metadata: Metadata = { title: "Impressum (Entwurf)" };

export default function ImprintPage() {
  return (
    <ProsePage eyebrow="Rechtliches" title="Impressum" draft description="Offenlegung und Informationspflichten (Entwurfsstruktur).">
      <OpenPoint>
        Es ist noch kein Unternehmen gegründet. Die folgenden Angaben sind Platzhalter und müssen nach Gründung vollständig ergänzt werden
        (Informationspflichten u. a. nach E-Commerce-Gesetz, Unternehmensgesetzbuch, Gewerbeordnung und Mediengesetz – zu prüfen).
      </OpenPoint>
      <ProseSection title="Diensteanbieter">
        <BulletList
          items={[
            "[Firmenwortlaut und Rechtsform]",
            "[Anschrift / Sitz in Österreich]",
            "[Firmenbuchnummer und Firmenbuchgericht]",
            "[UID-Nummer]",
            "[Unternehmensgegenstand]",
            "[Mitgliedschaft Wirtschaftskammer / Fachgruppe]",
            "[Gewerbebehörde und anwendbare Rechtsvorschriften]",
            "[Kontakt: E-Mail-Adresse und Kontaktformular]",
          ]}
        />
      </ProseSection>
      <ProseSection title="Offenlegung nach Mediengesetz">
        <p>[Medieninhaber, Herausgeber, grundlegende Richtung – nach rechtlicher Prüfung zu ergänzen.]</p>
      </ProseSection>
      <ProseSection title="Kontakt für Behörden und Meldungen">
        <p>
          [Kontaktstelle für Behörden und Nutzer nach dem EU Digital Services Act – Benennung, Sprache(n) und Erreichbarkeit sind rechtlich zu klären.]
        </p>
      </ProseSection>
    </ProsePage>
  );
}
