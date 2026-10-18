import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "test" | "live" | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-200",
  danger: "bg-danger-50 text-danger-700 ring-danger-200",
  info: "bg-info-50 text-info-700 ring-info-200",
  test: "bg-test-50 text-test-700 ring-test-200",
  live: "bg-live text-white ring-live",
  dark: "bg-ink-950/75 text-white ring-white/10 backdrop-blur",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
