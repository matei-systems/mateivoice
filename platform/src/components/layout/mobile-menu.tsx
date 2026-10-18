"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV } from "./main-nav";

/** Vollflächiges Menü für kleine Bildschirme (ergänzt die untere Tab-Leiste). */
export function MobileMenu({ signedIn, role }: { signedIn: boolean; role: "customer" | "creator" | "admin" | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Menü bei Navigation schließen (Zustandsanpassung während des Renderns statt Effekt).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const areaLink =
    role === "admin" ? { href: "/admin", label: "Adminbereich" } : role === "creator" ? { href: "/studio", label: "Creator-Studio" } : { href: "/account", label: "Mein Bereich" };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-full text-ink-800 transition hover:bg-brand-50 lg:hidden"
        aria-label="Menü öffnen"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none border-l border-line bg-surface p-0 shadow-lift open:animate-slide-in-right"
        aria-label="Navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <span className="font-display text-lg font-semibold">Menü</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-10 place-items-center rounded-full text-ink-600 hover:bg-brand-50"
              aria-label="Menü schließen"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile Navigation">
            <ul className="space-y-1">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-12 items-center rounded-xl px-4 text-[0.95rem] font-medium text-ink-800 transition hover:bg-brand-50",
                      pathname === item.href && "bg-brand-50 text-brand-700",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="my-3 h-px bg-line" aria-hidden="true" />
              {signedIn ? (
                <>
                  <li>
                    <Link href={areaLink.href} className="flex h-12 items-center rounded-xl px-4 text-[0.95rem] font-medium text-ink-800 hover:bg-brand-50">
                      {areaLink.label}
                    </Link>
                  </li>
                  <li>
                    <Link href="/account/settings" className="flex h-12 items-center rounded-xl px-4 text-[0.95rem] font-medium text-ink-800 hover:bg-brand-50">
                      Einstellungen
                    </Link>
                  </li>
                  <li>
                    <form action={logoutAction}>
                      <button type="submit" className="flex h-12 w-full items-center rounded-xl px-4 text-left text-[0.95rem] font-medium text-danger-700 hover:bg-danger-50">
                        Abmelden
                      </button>
                    </form>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="flex h-12 items-center rounded-xl px-4 text-[0.95rem] font-medium text-ink-800 hover:bg-brand-50">
                      Anmelden
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="flex h-12 items-center justify-center rounded-xl bg-brand-600 px-4 text-[0.95rem] font-semibold text-white">
                      Kostenlos registrieren
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
          <div className="pb-safe border-t border-line px-5 pt-4 text-xs leading-relaxed text-ink-600">
            Nur für Erwachsene (18+). <Link href="/support" className="font-medium text-brand-700">Hilfe & Kontakt</Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
