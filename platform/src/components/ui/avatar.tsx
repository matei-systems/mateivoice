import Image from "next/image";
import { cn, initials, stableHash } from "@/lib/utils";

// Eigens erstellte Platzhalter-Verläufe (keine Fotos realer Personen).
const GRADIENTS = [
  ["#ffd2e1", "#ea5a8d"],
  ["#ffe8f0", "#f584aa"],
  ["#fcb0c9", "#b0245c"],
  ["#fde2b5", "#ea5a8d"],
  ["#ddd6fe", "#cc2f6e"],
  ["#ffe8f0", "#8c1f4b"],
] as const;

const sizes = {
  xs: "size-7 text-[0.65rem]",
  sm: "size-9 text-xs",
  md: "size-12 text-sm",
  lg: "size-20 text-xl",
  xl: "size-28 text-3xl",
} as const;

export function Avatar({
  name,
  mediaId,
  size = "md",
  className,
  rounded = "full",
}: {
  name: string;
  mediaId?: string | null;
  size?: keyof typeof sizes;
  className?: string;
  rounded?: "full" | "2xl";
}) {
  const shape = rounded === "full" ? "rounded-full" : "rounded-2xl";
  if (mediaId) {
    return (
      <span className={cn("relative inline-block shrink-0 overflow-hidden bg-brand-100", shape, sizes[size], className)}>
        <Image src={`/media/${mediaId}`} alt={`Profilbild von ${name}`} fill sizes="112px" className="object-cover" unoptimized />
      </span>
    );
  }
  return <PlaceholderPortrait name={name} className={cn("shrink-0", shape, sizes[size], className)} />;
}

/** Generierter, eindeutig als Platzhalter erkennbarer Avatar (Initialen auf Verlauf). */
export function PlaceholderPortrait({ name, className }: { name: string; className?: string }) {
  const [from, to] = GRADIENTS[stableHash(name) % GRADIENTS.length]!;
  const angle = stableHash(`${name}-angle`) % 360;
  return (
    <span
      role="img"
      aria-label={`Platzhalterbild für ${name}`}
      className={cn("relative inline-grid place-items-center overflow-hidden font-display font-semibold text-white", className)}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` }}
    >
      <svg className="absolute inset-0 size-full opacity-25" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="78" cy="20" r="28" fill="white" />
        <circle cx="12" cy="92" r="34" fill="white" />
      </svg>
      <span className="relative drop-shadow-sm">{initials(name)}</span>
    </span>
  );
}
