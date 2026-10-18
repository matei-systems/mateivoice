import type { Metadata } from "next";
import { commission, legalDocuments, pricing } from "@/config/platform";
import { formatBps } from "@/server/ledger/commission";
import { BulletList, OpenPoint, ProsePage, ProseSection } from "@/components/content/prose-page";

export const metadata: Metadata = { title: "Creator-Vereinbarung (Entwurf)" };

export default function CreatorAgreementPage() {
  return (
    <ProsePage eyebrow="Rechtliches" title="Creator-Vereinbarung" draft version={legalDocuments.creatorAgreement.version}>
      <ProseSection title="Voraussetzungen">
        <BulletList
          items={[
            "Volljährigkeit und erfolgreiche Alters- und Identitätsprüfung über einen spezialisierten Anbieter, bevor Live-Funktionen freigeschaltet werden.",
            "Alle in Inhalten sichtbaren Personen müssen volljährig sein und ausdrücklich eingewilligt haben.",
            "Einhaltung der Community-Richtlinien.",
          ]}
        />
      </ProseSection>
      <ProseSection title="Preise">
        <p>
          Creator legen ihren Preis für private Chats selbst fest – zwischen {pricing.privateChat.minCoinsPerMinute} und{" "}
          {pricing.privateChat.maxCoinsPerMinute} Münzen pro Minute.
        </p>
      </ProseSection>
      <ProseSection title="Provision und Anteil">
        <p>
          Vorläufige Plattformprovision: {formatBps(commission.defaultPlatformBps)}. {commission.basisDescription} {commission.roundingDescription}
        </p>
        <OpenPoint>
          Vertragsmodell (Vermittlung vs. eigene Leistung der Plattform), Bemessungsgrundlage (brutto/netto, Umsatzsteuer, Zahlungsgebühren),
          Auszahlungsrhythmus, Mindestbeträge, Verrechnung von Rückbuchungen und steuerliche Pflichten (inkl. Plattform-Meldepflichten) sind zu klären.
        </OpenPoint>
      </ProseSection>
      <ProseSection title="Auszahlungen">
        <p>Auszahlungen erfolgen erst nach Anbindung eines dafür zugelassenen Zahlungsanbieters. Testmünzen sind nicht auszahlbar.</p>
      </ProseSection>
    </ProsePage>
  );
}
