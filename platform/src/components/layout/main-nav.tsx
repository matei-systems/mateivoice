"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export const PRIMARY_NAV = [
  { href: "/creators", label: "Entdecken" },
  { href: "/creators?availability=live", label: "Live" },
  { href: "/how-it-works", label: "So funktioniert's" },
  { href: "/safety", label: "Sicherheit" },
  { href: "/for-creators", label: "Für Creator" },
] as const;

export function isNavActive(href: string, pathname: string, search: string) {
  const [path, query] = href.split("?");
  if (query) return pathname === path && search.includes(query);
  if (path === "/creators") return pathname.startsWith("/creators") && !search.includes("availability=live");
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MainNav() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <nav aria-label="Hauptnavigation" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(item.href, pathname, search);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active ? "text-brand-700" : "text-ink-700 hover:text-brand-700",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute inset-x-3.5 -bottom-px h-0.5 origin-center rounded-full bg-brand-500 transition-transform duration-300 ease-out",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
