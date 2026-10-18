import type { Metadata } from "next";
import { Clock3, MessageCircleHeart, Radio, ShieldCheck, Wallet } from "lucide-react";
import { videoSessions } from "@/config/platform";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "So funktioniert's",
  description: "Registrieren, Münzen nutzen, live zusehen oder einen privaten Chat anfragen – transparent pro Minute.",
};

const flow = [
  { icon: ShieldCheck, title: "1. Konto anlegen", text: "Registrieren, Volljährigkeit bestätigen, E-Mail-Adresse bestätigen. Ein Nutzername reicht – kein Klarname." },
  { icon: Wallet, title: "2. Münzen", text: "Leistungen werden in Münzen abgerechnet. Im Testmodus erhältst du kostenloses Testguthaben ohne Geldwert. Echte Käufe sind noch nicht möglich." },
  { icon: Radio, title: "3. Live zusehen", text: "Öffentliche Streams laufender Creator ansehen (mit Kundenkonto)." },
  { icon: MessageCircleHeart, title: "4. Privaten Chat anfragen", text: `Der Creator nimmt an oder lehnt ab. Die Anfrage verfällt nach ${videoSessions.requestTtlSeconds / 60} Minuten automatisch – ohne Kosten.` },
  { icon: Clock3, title: "5. Fair abgerechnet", text: "Sobald beide verbunden sind, wird jede begonnene Minute zum vorab angezeigten Preis berechnet. Beenden ist jederzeit möglich; bei Verbindungsverlust endet die Sitzung automatisch." },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 lg:pt-14">
      <PageHeader eyebrow="So funktioniert's" title="Transparent vom ersten Klick an" description="Alles Wichtige zu Konto, Münzen, Streams und privaten Chats." />
      <ol className="mt-10 space-y-4">
        {flow.map((step) => (
          <li key={step.title} className="flex gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <step.icon className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/register">Kostenlos registrieren</ButtonLink>
        <ButtonLink href="/creators" variant="outline">
          Creator entdecken
        </ButtonLink>
      </div>
    </div>
  );
}
