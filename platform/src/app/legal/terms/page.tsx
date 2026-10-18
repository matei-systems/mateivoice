import type { Metadata } from "next";
import { commission, legalDocuments, minimumAge } from "@/config/platform";
import { formatBps } from "@/server/ledger/commission";
import { BulletList, OpenPoint, ProsePage, ProseSection } from "@/components/content/prose-page";

export const metadata: Metadata = { title: "Nutzungsbedingungen (Entwurf)" };

export default function TermsPage() {
  return (
    <ProsePage eyebrow="Rechtliches" title="Nutzungsbedingungen" draft version={legalDocuments.terms.version}>
      <ProseSection title="1. Geltungsbereich">
        <p>
          Diese Bedingungen regeln die Nutzung der Plattform [Plattformname] durch Kundinnen und Kunden sowie Creator. Betreiber ist [Firmenwortlaut,
          Sitz]. Ergänzend gelten die Community-Richtlinien und für Creator die Creator-Vereinbarung.
        </p>
      </ProseSection>
      <ProseSection title="2. Mindestalter">
        <p>Die Nutzung ist ausschließlich volljährigen Personen ab {minimumAge} Jahren gestattet.</p>
        <OpenPoint>Ob und in welcher Form auch für Kundinnen und Kunden eine technische Altersverifikation verpflichtend ist, wird rechtlich geprüft.</OpenPoint>
      </ProseSection>
      <ProseSection title="3. Konto">
        <BulletList
          items={[
            "Zugangsdaten sind geheim zu halten; Konten sind nicht übertragbar.",
            "Wir können Konten bei begründetem Verdacht auf Verstöße sperren. Gegen Sanktionen kann Einspruch eingelegt werden.",
            "Konten können jederzeit in den Einstellungen gelöscht werden.",
          ]}
        />
      </ProseSection>
      <ProseSection title="4. Münzen">
        <p>
          Leistungen werden in Münzen abgerechnet. Im aktuellen Prototyp existiert ausschließlich Testguthaben ohne Geldwert; es kann weder gekauft,
          übertragen noch ausgezahlt werden.
        </p>
        <OpenPoint>
          Rechtliche Einordnung echter Münzen (z. B. Vorauszahlung, E-Geld-/Zahlungsdiensterecht), Gültigkeit, Verfall, Erstattung nicht verbrauchter
          Münzen sowie Widerrufsrecht bei digitalen Leistungen sind zu klären.
        </OpenPoint>
      </ProseSection>
      <ProseSection title="5. Private Videochats">
        <BulletList
          items={[
            "Der Minutenpreis wird vor der Anfrage angezeigt und für die Sitzung fixiert.",
            "Abgerechnet wird je begonnener Minute, ausschließlich während einer aktiven Sitzung.",
            "Aufnahmen, Mitschnitte und Weitergabe von Inhalten sind untersagt.",
          ]}
        />
      </ProseSection>
      <ProseSection title="6. Plattformprovision (Creator)">
        <p>
          Vorläufig {formatBps(commission.defaultPlatformBps)} der verbrauchten Münzen. {commission.basisDescription}
        </p>
      </ProseSection>
      <ProseSection title="7. Haftung, anwendbares Recht, Streitbeilegung">
        <p>[Nach rechtlicher Prüfung zu ergänzen – Verbraucherschutzrecht beachten.]</p>
      </ProseSection>
    </ProsePage>
  );
}
