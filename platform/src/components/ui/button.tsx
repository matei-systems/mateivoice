import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle" | "inverse" | "ghostInverse";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
  "transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 " +
  "focus-visible:outline-none focus-visible:shadow-glow";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft hover:bg-brand-700 hover:shadow-lift hover:-translate-y-px",
  secondary: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100",
  outline: "bg-surface text-ink-800 ring-1 ring-inset ring-line-strong hover:bg-brand-25 hover:ring-brand-300",
  ghost: "text-ink-700 hover:bg-brand-50 hover:text-brand-700",
  danger: "bg-danger-700 text-white shadow-soft hover:bg-danger-600",
  subtle: "bg-ink-100 text-ink-800 hover:bg-ink-200",
  // Für dunkle Flächen
  inverse: "bg-white text-brand-700 shadow-soft hover:bg-brand-50 hover:-translate-y-px",
  ghostInverse: "text-white hover:bg-white/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-md px-3.5 text-sm",
  md: "h-11 rounded-lg px-5 text-sm",
  lg: "h-13 rounded-xl px-7 text-base",
  icon: "size-10 rounded-full",
};

export function buttonClasses(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[options.variant ?? "primary"], sizes[options.size ?? "md"], options.className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, size, loading, icon, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

export function ButtonLink({ variant, size, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}
