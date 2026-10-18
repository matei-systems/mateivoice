import type { Metadata } from "next";
import { legalDocuments } from "@/config/platform";
import { BulletList, OpenPoint, ProsePage, ProseSection } from "@/components/content/prose-page";

export const metadata: Metadata = { title: "Datenschutzinformation (Entwurf)" };

export default function PrivacyPage() {
  return (
    <ProsePage eyebrow="Rechtliches" title="Datenschutzinformation" draft version={legalDocuments.privacy.version}>
      <ProseSection title="Verantwortlicher">
        <p>[Firmenwortlaut, Anschrift, Kontakt]. [Datenschutzbeauftragter – ob erforderlich, ist zu prüfen.]</p>
      </ProseSection>
      <ProseSection title="Welche Daten wir verarbeiten (Prototyp-Stand)">
        <BulletList
          items={[
            "Kontodaten: E-Mail-Adresse, Nutzername, Passwort-Hash (scrypt), Rolle, Zeitpunkte von Registrierung und Anmeldung.",
            "Selbstauskunft „18+“ mit Zeitstempel sowie Zustimmungen zu Dokumentversionen.",
            "Sitzungsdaten: zufälliges Sitzungs-Token (nur als Hash gespeichert), gekürzter User-Agent, pseudonymisierter IP-Hash.",
            "Nutzungs- und Abrechnungsdaten: Video-Sitzungen (Zeitpunkte, Dauer, Preise), Buchungen im Münz-Journal.",
            "Creator: Profilangaben, hochgeladene Bilder (ohne Metadaten neu kodiert), Status der Verifizierung (keine Ausweisdaten).",
            "Meldungen, Support-Anfragen, Moderationsentscheidungen, Admin-Audit-Protokoll.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Was wir bewusst NICHT speichern">
        <BulletList
          items={[
            "Keine Klartext-Passwörter, keine Klartext-IP-Adressen.",
            "Keine Ausweisdokumente – die Prüfung soll bei einem spezialisierten Anbieter erfolgen.",
            "Keine Video-Aufzeichnungen privater Chats (Standard).",
            "Keine Zahlungskartendaten (diese verbleiben beim späteren Zahlungsanbieter).",
          ]}
        />
      </ProseSection>
      <ProseSection title="Rechte der betroffenen Personen">
        <p>
          Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Im Konto stehen ein Datenexport (JSON) und die
          Kontolöschung zur Verfügung. Beschwerden sind bei der Österreichischen Datenschutzbehörde möglich.
        </p>
      </ProseSection>
      <OpenPoint>
        Rechtsgrundlagen je Verarbeitung, Speicherdauern (insb. Aufbewahrungspflichten für Buchungsdaten), Auftragsverarbeiter (Hosting, E-Mail,
        Zahlung, Video, Verifizierung), Drittlandübermittlungen sowie die Einordnung möglicher besonderer Kategorien personenbezogener Daten
        (Art. 9 DSGVO) müssen rechtlich geprüft werden.
      </OpenPoint>
    </ProsePage>
  );
}
