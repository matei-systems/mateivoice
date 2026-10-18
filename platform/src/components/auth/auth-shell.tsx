import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

/** Zweigeteiltes Layout für Anmelde-/Registrierungsseiten. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:py-16">
      <aside className="relative hidden overflow-hidden rounded-[2rem] bg-aurora p-10 shadow-card lg:block">
        <div className="pointer-events-none absolute -right-16 -bottom-16 size-72 animate-float rounded-full bg-brand-300/40 blur-3xl" aria-hidden="true" />
        <LogoMark className="size-12" />
        <p className="mt-8 font-display text-4xl leading-tight font-semibold tracking-tight text-ink-950">
          Willkommen in einem <span className="text-gradient-brand italic">respektvollen</span> Raum.
        </p>
        <ul className="relative mt-10 space-y-4 text-sm text-ink-700">
          <li className="flex gap-3">
            <ShieldCheck className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            Ausschließlich für Erwachsene – mit klaren Community-Richtlinien.
          </li>
          <li className="flex gap-3">
            <Lock className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            Kein Klarname nötig. Passwörter werden nur als sicherer Hash gespeichert.
          </li>
          <li className="flex gap-3">
            <BadgeCheck className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
            Transparente Minutenpreise, jederzeit beendbar.
          </li>
        </ul>
      </aside>
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-ink-600">{footer}</div> : null}
        <p className="mt-6 text-center text-xs text-ink-500">
          <Link href="/legal/privacy" className="hover:text-brand-700">Datenschutz (Entwurf)</Link> ·{" "}
          <Link href="/legal/terms" className="hover:text-brand-700">Nutzungsbedingungen (Entwurf)</Link> ·{" "}
          <Link href="/support" className="hover:text-brand-700">Hilfe</Link>
        </p>
      </div>
    </div>
  );
}
