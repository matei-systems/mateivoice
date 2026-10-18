"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DashboardNavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

/** Rahmen für Kunden-, Creator- und Adminbereich: Seitenleiste (Desktop), Scroll-Tabs (Mobil). */
export function DashboardShell({
  title,
  subtitle,
  nav,
  children,
  accent,
}: {
  title: string;
  subtitle?: ReactNode;
  nav: DashboardNavItem[];
  children: ReactNode;
  accent?: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (item: DashboardNavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-10 sm:px-6 lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10 lg:pt-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 hidden lg:block">
          <p className="font-display text-xl font-semibold text-ink-950">{title}</p>
          {subtitle ? <div className="mt-1 text-sm text-ink-600">{subtitle}</div> : null}
          {accent ? <div className="mt-3">{accent}</div> : null}
        </div>
        <nav aria-label={`${title} – Navigation`}>
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {nav.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap ring-1 ring-inset transition lg:rounded-xl lg:px-3.5 lg:py-2.5 lg:ring-0",
                      active
                        ? "bg-brand-600 text-white ring-brand-600 lg:bg-brand-50 lg:text-brand-700"
                        : "bg-surface text-ink-700 ring-line hover:bg-brand-50 hover:text-brand-700 lg:bg-transparent",
                    )}
                  >
                    <span className={cn("hidden lg:inline", active ? "text-brand-600" : "text-ink-500")}>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0 animate-fade-in space-y-6 pt-4 lg:pt-0">{children}</div>
    </div>
  );
}
