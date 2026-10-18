import type { ReactNode } from "react";
import { FileWarning } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";

/** Einheitliches Layout für Text- und Rechtsseiten. */
export function ProsePage({
  eyebrow,
  title,
  description,
  draft,
  version,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  draft?: boolean;
  version?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 lg:pt-14">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {draft ? (
        <div className="mt-6 flex gap-3 rounded-2xl border-2 border-dashed border-warning-600/50 bg-warning-50 p-4 text-sm text-warning-700">
          <FileWarning className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">ENTWURF – rechtlich nicht geprüft{version ? ` (Version ${version})` : ""}</p>
            <p className="mt-1 leading-relaxed">
              Dieser Text ist ein Arbeitsentwurf für den Prototyp und KEIN rechtsverbindliches Dokument. Platzhalter in eckigen Klammern und die
              markierten offenen Punkte müssen vor einem Echtbetrieb fachlich (Rechtsberatung, Steuerberatung) geprüft und ergänzt werden.
            </p>
          </div>
        </div>
      ) : null}
      <article className="prose-aurora mt-8 space-y-6 text-[0.97rem] leading-relaxed text-ink-800">{children}</article>
    </div>
  );
}

export function ProseSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl font-semibold text-ink-950">{title}</h2>
      {children}
    </section>
  );
}

export function OpenPoint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border-l-4 border-warning-600 bg-warning-50 px-3 py-2 text-sm text-warning-700">
      <strong>Offener Punkt:</strong> {children}
    </p>
  );
}

export function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-brand-500">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
