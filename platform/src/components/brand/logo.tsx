import Link from "next/link";
import { brand } from "@/config/platform";
import { cn } from "@/lib/utils";

/**
 * Vorläufiges, austauschbares Logo: abstrahierter Horizont-Bogen („Aurora“)
 * mit Lichtpunkt. Name kommt zentral aus config/platform.ts.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f584aa" />
          <stop offset="0.55" stopColor="#ea5a8d" />
          <stop offset="1" stopColor="#b0245c" />
        </linearGradient>
        <radialGradient id="logo-glow" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#logo-bg)" />
      <rect width="40" height="40" rx="12" fill="url(#logo-glow)" />
      <path d="M9 27c3.4-7.6 7.3-11.4 11-11.4S27.6 19.4 31 27" stroke="white" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <path d="M14 29.5c1.9-3.6 3.9-5.4 6-5.4s4.1 1.8 6 5.4" stroke="white" strokeOpacity="0.65" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="m20 7.2 1.15 2.65 2.65 1.15-2.65 1.15L20 14.8l-1.15-2.65-2.65-1.15 2.65-1.15Z" fill="white" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5 rounded-lg", className)} aria-label={`${brand.name} – Startseite`}>
      <LogoMark className="transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105" />
      <span className="hidden font-display text-[1.2rem] font-semibold tracking-tight whitespace-nowrap text-ink-950 min-[400px]:inline">{brand.name}</span>
    </Link>
  );
}
