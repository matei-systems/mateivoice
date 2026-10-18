import Link from "next/link";
import { brand } from "@/config/platform";
import { Logo } from "@/components/brand/logo";

const columns = [
  {
    title: "Plattform",
    links: [
      { href: "/creators", label: "Creator entdecken" },
      { href: "/creators?availability=live", label: "Jetzt live" },
      { href: "/how-it-works", label: "So funktioniert's" },
      { href: "/for-creators", label: "Für Creator" },
    ],
  },
  {
    title: "Sicherheit",
    links: [
      { href: "/safety", label: "Sicherheit & Jugendschutz" },
      { href: "/legal/community-guidelines", label: "Community-Richtlinien" },
      { href: "/support?category=safety", label: "Problem melden" },
    ],
  },
  {
    title: "Rechtliches (Entwürfe)",
    links: [
      { href: "/legal/imprint", label: "Impressum" },
      { href: "/legal/terms", label: "Nutzungsbedingungen" },
      { href: "/legal/privacy", label: "Datenschutz" },
      { href: "/legal/creator-agreement", label: "Creator-Vereinbarung" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-gradient-to-b from-surface to-brand-25 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-ink-600">{brand.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-ink-900 px-2.5 py-0.5 text-xs font-bold text-ink-900">18+</span>
            <span className="text-xs text-ink-600">Ausschließlich für volljährige Personen.</span>
          </div>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-semibold text-ink-950">{column.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink-600 transition hover:text-brand-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ink-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {brand.name} · Arbeitsname · Prototyp ohne Echtbetrieb
          </p>
          <p>
            Rechtstexte sind Entwürfe und nicht rechtlich geprüft. <Link href="/support" className="font-medium text-brand-700 hover:underline">Hilfe & Kontakt</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
