import type { Metadata } from "next";

export const metadata: Metadata = { title: "Seite verlassen", robots: { index: false } };

export default function LeavePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-3xl font-semibold">Danke für deine Ehrlichkeit.</h1>
      <p className="mt-4 leading-relaxed text-ink-700">
        Diese Plattform ist nur für Erwachsene. Bitte schließe dieses Fenster. Informationen rund um sicheres Surfen findest du bei
        Saferinternet.at.
      </p>
    </div>
  );
}
