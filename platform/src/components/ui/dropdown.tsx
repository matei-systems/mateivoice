"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DropdownItem =
  | { type: "link"; href: string; label: string; icon?: ReactNode }
  | { type: "form"; action: () => Promise<void>; label: string; icon?: ReactNode; danger?: boolean }
  | { type: "separator" }
  | { type: "label"; label: ReactNode };

/** Dropdown-Menü mit Tastatur- und Außenklick-Unterstützung. */
export function Dropdown({
  trigger,
  items,
  align = "end",
  label,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 transition hover:bg-brand-50 focus-visible:shadow-glow focus-visible:outline-none"
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute z-50 mt-2 w-64 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lift",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => {
            if (item.type === "separator") return <div key={index} className="my-1.5 h-px bg-line" role="separator" />;
            if (item.type === "label") {
              return (
                <div key={index} className="px-3 py-2 text-xs text-ink-600">
                  {item.label}
                </div>
              );
            }
            const classes = cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-800 transition hover:bg-brand-50 hover:text-brand-700",
              item.type === "form" && item.danger && "text-danger-700 hover:bg-danger-50 hover:text-danger-700",
            );
            if (item.type === "link") {
              return (
                <Link key={index} href={item.href} role="menuitem" className={classes} onClick={() => setOpen(false)}>
                  {item.icon}
                  {item.label}
                </Link>
              );
            }
            return (
              <form key={index} action={item.action}>
                <button type="submit" role="menuitem" className={classes}>
                  {item.icon}
                  {item.label}
                </button>
              </form>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
