import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { acknowledgeAgeAction } from "@/actions/age-gate";
import { brand, minimumAge } from "@/config/platform";
import { LogoMark } from "@/components/brand/logo";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Altershinweis für Gäste. WICHTIG: Dies ist eine Selbstauskunft und KEINE
 * Altersverifikation. Ob für Kunden eine echte Altersprüfung erforderlich ist,
 * wird rechtlich geklärt (siehe docs/LEGAL-OPEN-QUESTIONS-AT.md).
 */
export function AgeGate() {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-ink-950/45 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="w-full max-w-md animate-scale-in overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
        <div className="bg-aurora px-6 pt-8 pb-6 text-center sm:px-8">
          <LogoMark className="mx-auto size-12" />
          <p className="mt-5 inline-flex items-center rounded-full border border-ink-900 px-3 py-0.5 text-sm font-bold text-ink-900">{minimumAge}+</p>
          <h2 id="age-gate-title" className="mt-4 font-display text-2xl font-semibold tracking-tight">
            Nur für Erwachsene
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-700">
            {brand.name} richtet sich ausschließlich an volljährige Personen. Bitte bestätige, dass du mindestens {minimumAge} Jahre alt bist.
          </p>
        </div>
        <div className="space-y-4 px-6 pt-5 pb-6 sm:px-8">
          <form action={acknowledgeAgeAction}>
            <SubmitButton size="lg" className="w-full">
              Ich bin {minimumAge} oder älter
            </SubmitButton>
          </form>
          <Link
            href="/leave"
            className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-ink-700 ring-1 ring-inset ring-line-strong transition hover:bg-ink-50"
          >
            Ich bin unter {minimumAge} – verlassen
          </Link>
          <p className="flex gap-2 text-xs leading-relaxed text-ink-600">
            <ShieldCheck className="mt-px size-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              Hinweis: Dies ist eine Selbstauskunft, keine Altersverifikation. Für Eltern: Jugendschutzfilter erkennen diese Seite über die
              Kennzeichnung „adult“. <Link href="/legal/terms" className="font-medium text-brand-700 underline-offset-2 hover:underline">Nutzungsbedingungen (Entwurf)</Link>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
