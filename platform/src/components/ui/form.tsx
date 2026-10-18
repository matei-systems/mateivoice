import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-lg border border-line-strong bg-surface px-3.5 text-[0.95rem] text-ink-900 shadow-xs " +
  "placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:shadow-glow " +
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 " +
  "aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgb(225_29_72/0.15)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, "py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "form-select h-11 pr-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("block text-sm font-medium text-ink-800", className)} {...props}>
      {children}
    </label>
  );
}

/** Feld mit Beschriftung, Hinweis und Fehlermeldung (barrierefrei verknüpft). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-500">(optional)</span> : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs font-medium text-danger-700" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  id,
  name,
  children,
  defaultChecked,
  required,
  className,
  value,
}: {
  id: string;
  name: string;
  children: ReactNode;
  defaultChecked?: boolean;
  required?: boolean;
  className?: string;
  value?: string;
}) {
  return (
    <label htmlFor={id} className={cn("group flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink-700", className)}>
      <input
        id={id}
        name={name}
        type="checkbox"
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        className="form-checkbox mt-0.5 size-[1.15rem] shrink-0 cursor-pointer rounded-[0.35rem] border border-line-strong bg-surface shadow-xs transition checked:border-brand-600 checked:bg-brand-600 hover:border-brand-400 focus-visible:shadow-glow focus-visible:outline-none"
      />
      <span>{children}</span>
    </label>
  );
}

/** Ergebnis einer Formularaktion – ehrliche Erfolgs- oder Fehlermeldung. */
export function FormMessage({ state }: { state?: { status: string; message?: string } | null }) {
  if (!state?.message || state.status === "idle") return null;
  const success = state.status === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      aria-live="polite"
      className={cn(
        "flex animate-scale-in items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        success ? "border-success-200 bg-success-50 text-success-700" : "border-danger-200 bg-danger-50 text-danger-700",
      )}
    >
      {success ? (
        <CheckCircle2 className="mt-px size-4 shrink-0 animate-pop" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

/** Honeypot-Feld gegen einfache Bots (für Menschen unsichtbar). */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="website">Website</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
