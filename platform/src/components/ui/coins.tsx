import { cn, formatCoins } from "@/lib/utils";

export function CoinIcon({ className }: { className?: string }) {
  // Bewusst ohne SVG-Verlauf: Verlaufs-IDs wären seitenweit geteilt und brechen,
  // wenn die erste Instanz ausgeblendet ist.
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" className="fill-brand-500" />
      <path d="M4.2 9.5A8.4 8.4 0 0 1 9.5 4.2" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.4" />
      <path d="M12 8.3 13.2 11l2.8.3-2.1 1.8.6 2.8L12 14.4l-2.5 1.5.6-2.8L8 11.3l2.8-.3Z" fill="white" />
    </svg>
  );
}

/**
 * Münzbetrag. Testmünzen werden immer ausdrücklich als solche bezeichnet –
 * sie haben keinen Geldwert und sind weder kaufbar noch auszahlbar.
 */
export function CoinAmount({
  amount,
  test = true,
  className,
  size = "md",
  signed,
}: {
  amount: number;
  test?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  signed?: boolean;
}) {
  const text = signed && amount > 0 ? `+${formatCoins(amount)}` : formatCoins(amount);
  const sizeClass = { sm: "text-sm", md: "text-base", lg: "text-2xl", xl: "text-4xl" }[size];
  const iconClass = { sm: "size-3.5", md: "size-4", lg: "size-6", xl: "size-8" }[size];
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-semibold tabular-nums", sizeClass, className)}>
      <CoinIcon className={cn(iconClass, "self-center")} />
      {text}
      <span className="text-[0.7em] font-medium text-ink-600">{test ? "Testmünzen" : "Münzen"}</span>
    </span>
  );
}

export function PricePerMinute({ coins, className }: { coins: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums text-ink-900", className)}>
      <CoinIcon className="size-3.5" />
      {formatCoins(coins)}
      <span className="font-normal text-ink-600">/ Min.</span>
    </span>
  );
}
