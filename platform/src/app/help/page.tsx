import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, LifeBuoy, ShieldCheck, Sparkles, UserRound, Video } from "lucide-react";
import { getSettings } from "@/server/settings/service";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Hilfe-Center",
  description: "Antworten zu Konto, Altersprüfung, Münzen und Zahlungen, Sicherheit, Datenschutz und für Creator.",
};

type Topic = { id: string; title: string; icon: typeof UserRound; items: { q: string; a: React.ReactNode }[] };

export default async function HelpPage() {
  const settings = await getSettings();
  const topics: Topic[] = [
    {
      id: "konto",
      title: "Konto & Anmeldung",
      icon: UserRound,
      items: [
        { q: "Wer darf die Plattform nutzen?", a: `Ausschließlich volljährige Personen mit Wohnsitz in ${settings.ageAssurance.allowedCountries.join(", ")}. Mehrfachkonten und die Weitergabe von Zugängen sind nicht erlaubt.` },
        { q: "Ich habe keine Bestätigungs-E-Mail erhalten.", a: "Prüfe den Spam-Ordner. In deinem Konto kannst du den Link erneut anfordern (höchstens 3× pro Stunde)." },
        { q: "Wie schütze ich mein Konto?", a: <>Aktiviere die Zwei-Faktor-Anmeldung unter <Link className="text-brand-700 hover:underline" href="/account/security">Sicherheit</Link>. Bei Passwortänderungen werden alle anderen Sitzungen abgemeldet.</> },
      ],
    },
    {
      id: "alter",
      title: "Altersprüfung",
      icon: ShieldCheck,
      items: [
        { q: "Warum ist eine Altersprüfung nötig?", a: "Pornografische Angebote dürfen nur Erwachsenen zugänglich sein. In Deutschland verlangt der Jugendmedienschutz eine geschlossene Benutzergruppe mit Altersverifikation. Wir wenden diesen Standard für alle Startländer an." },
        { q: "Speichert ihr meinen Ausweis?", a: "Nein. Die Prüfung übernimmt ein spezialisierter Anbieter. Wir speichern nur das Ergebnis (bestanden/nicht bestanden) und den Zeitpunkt." },
        { q: "Was kann ich ohne Altersprüfung nutzen?", a: "Öffentliche Profile ansehen, Hilfe und Rechtstexte. Live-Streams, Chat, private Chats und Käufe erfordern die Prüfung." },
      ],
    },
    {
      id: "zahlungen",
      title: "Münzen & Zahlungen",
      icon: CreditCard,
      items: [
        { q: "Wie funktionieren Münzen?", a: <>Du kaufst Münzpakete als Einmalkauf (kein Abo) und setzt sie für private Chats oder Trinkgelder ein. Details auf <Link className="text-brand-700 hover:underline" href="/pricing">Preise & Münzen</Link>.</> },
        { q: "Wann werden Münzen gutgeschrieben?", a: "Sobald der Zahlungsanbieter die Zahlung bestätigt hat – in der Regel innerhalb weniger Sekunden. Eine Weiterleitung allein schreibt nichts gut." },
        { q: "Gibt es Limits?", a: `Ja, zum Schutz vor Missbrauch und impulsiven Ausgaben: ${formatEuroCents(settings.payments.dailyLimitCents)} pro Tag und ${formatEuroCents(settings.payments.monthlyLimitCents)} in 30 Tagen.` },
        { q: "Wie bekomme ich eine Erstattung?", a: <>Wende dich mit der Bestellnummer an den <Link className="text-brand-700 hover:underline" href="/support?category=payments">Support</Link>. Bei technischen Fehlern während eines Chats prüfen wir eine Kulanzerstattung.</> },
      ],
    },
    {
      id: "chats",
      title: "Streams & private Chats",
      icon: Video,
      items: [
        { q: "Was kostet ein privater Chat?", a: "Den Minutenpreis legt der Creator fest; er wird vor der Anfrage angezeigt und für die Sitzung fixiert. Abgerechnet wird jede begonnene Minute genau einmal." },
        { q: "Werden Chats aufgezeichnet?", a: "Nein, Streams und private Chats werden standardmäßig nicht aufgezeichnet. Aufnahmen durch Gegenüber sind verboten und werden sanktioniert." },
        { q: "Was passiert bei Verbindungsabbruch?", a: `Ohne Signal für ${settings.streaming.heartbeatTimeoutSeconds} Sekunden endet die Sitzung automatisch; weitere Minuten werden nicht berechnet.` },
      ],
    },
    {
      id: "sicherheit",
      title: "Sicherheit & Meldungen",
      icon: LifeBuoy,
      items: [
        { q: "Wie melde ich etwas?", a: "Über „Melden“ an Profilen, Streams und Chatnachrichten. Hinweise auf Minderjährige oder nicht einvernehmliche Inhalte werden sofort mit höchster Priorität bearbeitet." },
        { q: "Kann ich jemanden blockieren?", a: "Ja – im Chat oder auf dem Profil. Blockieren wirkt in beide Richtungen (keine Nachrichten, Anfragen oder Trinkgelder)." },
        { q: "Wie läuft ein Einspruch?", a: "Jede Maßnahme wird begründet. Du kannst in deinem Konto unter „Support & Meldungen“ Einspruch einlegen; eine andere Person prüft erneut." },
      ],
    },
    {
      id: "creator",
      title: "Für Creator",
      icon: Sparkles,
      items: [
        { q: "Wie werde ich freigeschaltet?", a: "Profil ausfüllen, Pflichterklärungen abgeben, Alters- und Identitätsprüfung abschließen und Profil einreichen. Das Team prüft und schaltet frei." },
        { q: "Wie viel verdiene ich?", a: `Du erhältst ${(10000 - settings.commission.platformBps) / 100} % der für dich eingesetzten Münzen (vorläufige Regel). Jede Buchung zeigt Brutto, Satz und deinen Anteil.` },
        { q: "Wie funktionieren Auszahlungen?", a: `Ab ${settings.payout.minimumCoins} Münzen kannst du eine Auszahlung auf dein SEPA-Konto beantragen. Einnahmen der letzten ${settings.payout.holdDays} Tage sind wegen möglicher Rückbuchungen noch in der Haltefrist.` },
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 pt-12 pb-8 sm:px-6 lg:pt-16">
      <SectionHeading eyebrow="Hilfe" title="Hilfe-Center" description="Antworten auf häufige Fragen. Nichts gefunden? Unser Support hilft weiter." />
      <nav aria-label="Themen" className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <a key={topic.id} href={`#${topic.id}`} className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink-700 ring-1 ring-line hover:text-brand-700 hover:ring-brand-300">
            <topic.icon className="size-4" aria-hidden="true" /> {topic.title}
          </a>
        ))}
      </nav>
      {topics.map((topic) => (
        <section key={topic.id} id={topic.id} className="scroll-mt-24 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <topic.icon className="size-5 text-brand-700" aria-hidden="true" /> {topic.title}
          </h2>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {topic.items.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-ink-900 marker:hidden group-open:text-brand-700 [&::-webkit-details-marker]:hidden">{item.q}</summary>
                <div className="mt-2 text-sm leading-relaxed text-ink-600">{item.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-line bg-surface-2 p-6">
        <p className="w-full text-ink-700">Weitere Fragen?</p>
        <ButtonLink href="/support">Support kontaktieren</ButtonLink>
        <ButtonLink href="/contact" variant="outline">
          Alle Kontaktwege
        </ButtonLink>
      </div>
    </div>
  );
}
