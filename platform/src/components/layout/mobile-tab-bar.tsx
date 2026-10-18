"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Compass, Radio, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Untere Tab-Leiste für Smartphones – daumenfreundlich, eigenständig statt
 * verkleinerter Desktop-Navigation.
 */
export function MobileTabBar({ role, unread }: { role: "customer" | "creator" | "admin" | null; unread: number }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const areaHref = role === "admin" ? "/admin" : role === "creator" ? "/studio" : role === "customer" ? "/account" : "/login";
  const tabs = [
    { href: "/creators", label: "Entdecken", icon: Compass, active: pathname.startsWith("/creators") && !search.includes("availability=live") },
    { href: "/creators?availability=live", label: "Live", icon: Radio, active: pathname === "/creators" && search.includes("availability=live") },
    ...(role === "creator"
      ? [{ href: "/studio/live", label: "Studio", icon: Sparkles, active: pathname.startsWith("/studio/live") }]
      : []),
    { href: role ? "/account/notifications" : "/login", label: "Hinweise", icon: Bell, active: pathname.startsWith("/account/notifications"), badge: unread },
    {
      href: areaHref,
      label: role ? "Konto" : "Anmelden",
      icon: UserRound,
      active: (pathname.startsWith(areaHref) && !pathname.startsWith("/account/notifications") && !pathname.startsWith("/studio/live")) || pathname === "/login",
    },
  ];
  return (
    <nav
      aria-label="Schnellnavigation"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5">
        {tabs.map(({ href, label, icon: Icon, active, ...rest }) => {
          const badge = "badge" in rest ? (rest.badge as number) : 0;
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.68rem] font-medium transition-colors",
                  active ? "text-brand-700" : "text-ink-600",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", active && "bg-brand-100")}>
                  <Icon className="size-[1.2rem]" aria-hidden="true" />
                </span>
                {label}
                {badge > 0 ? (
                  <span className="absolute top-0.5 right-[calc(50%-1.5rem)] grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[0.6rem] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
