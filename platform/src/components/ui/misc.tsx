import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-[0.95rem] leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "brand" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-card",
        tone === "brand" && "border-brand-200 bg-gradient-to-br from-brand-50 to-surface",
        tone === "warning" && "border-warning-200",
        tone === "danger" && "border-danger-200",
        tone === "default" && "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        {icon ? <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-ink-950 tabular-nums">{value}</div>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{hint}</p> : null}
    </div>
  );
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const linkClass =
    "inline-flex h-10 items-center gap-1 rounded-lg px-3.5 text-sm font-medium ring-1 ring-inset ring-line-strong bg-surface text-ink-800 transition hover:bg-brand-50 hover:ring-brand-300";
  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Seitennavigation">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" /> Zurück
        </Link>
      ) : null}
      <span className="text-sm text-ink-600 tabular-nums">
        Seite {page} von {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={linkClass} rel="next">
          Weiter <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left" }: { eyebrow?: string; title: ReactNode; description?: ReactNode; align?: "left" | "center" }) {
  return (
    <div className={cn("space-y-3", align === "center" && "mx-auto max-w-2xl text-center")}>
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
      <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-950 sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
      {description ? <p className="text-base leading-relaxed text-ink-600">{description}</p> : null}
    </div>
  );
}

export function DescriptionList({ items }: { items: { term: ReactNode; detail: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item, index) => (
        <div key={index} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm text-ink-600">{item.term}</dt>
          <dd className="text-sm font-medium text-ink-900 sm:col-span-2">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
