import type { Metadata } from "next";
import { legalDocuments } from "@/config/platform";
import { BulletList, ProsePage, ProseSection } from "@/components/content/prose-page";

export const metadata: Metadata = { title: "Community-Richtlinien (Entwurf)" };

export default function CommunityGuidelinesPage() {
  return (
    <ProsePage
      eyebrow="Sicherheit"
      title="Community-Richtlinien"
      draft
      version={legalDocuments.communityGuidelines.version}
      description="Respekt, Einvernehmlichkeit und Sicherheit gelten für alle – ohne Ausnahme."
    >
      <ProseSection title="Absolut verboten (sofortige Sperre, ggf. Meldung an Behörden)">
        <BulletList
          items={[
            "Jegliche Beteiligung oder Darstellung minderjähriger Personen – auch angedeutet oder im Rollenspiel.",
            "Nicht einvernehmliche Inhalte, heimliche Aufnahmen, Weitergabe intimer Inhalte ohne Zustimmung.",
            "Gewalt, Drohungen, Ausbeutung, Menschenhandel.",
            "Sonstige rechtswidrige Inhalte.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Nicht erlaubt">
        <BulletList
          items={[
            "Aufzeichnen, Mitschneiden oder Weiterverbreiten von Streams und Chats.",
            "Belästigung, Druck, Erpressung, Beleidigungen.",
            "Erfragen oder Veröffentlichen persönlicher Daten (Adresse, Klarname, Telefonnummer).",
            "Umgehen der Plattform für Zahlungen, Spam, Betrug, Identitätsmissbrauch.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Melden & Einspruch">
        <p>
          Jedes Profil und jede eigene Sitzung kann gemeldet werden. Meldungen zu möglichen Minderjährigen oder nicht einvernehmlichen Inhalten werden
          mit höchster Priorität bearbeitet. Moderationsentscheidungen werden begründet; gegen Maßnahmen kann im Konto Einspruch eingelegt werden.
        </p>
      </ProseSection>
    </ProsePage>
  );
}
