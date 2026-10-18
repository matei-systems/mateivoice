"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./button";

/**
 * Modal auf Basis des nativen <dialog>-Elements (Fokusfalle, Escape und
 * Hintergrund-Sperre durch den Browser). Öffnen/Schließen ist animiert.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerVariant = "outline",
  triggerSize = "md",
  triggerClassName,
  triggerIcon,
  wide,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerVariant?: ButtonVariant;
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} className={triggerClassName} icon={triggerIcon} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(event) => {
          if (event.target === ref.current) close();
        }}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink-900 shadow-lift open:animate-scale-in",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
        aria-labelledby="dialog-title"
      >
        {open ? (
          <div className="max-h-[85dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="space-y-1">
                <h2 id="dialog-title" className="text-lg font-semibold text-ink-950">
                  {title}
                </h2>
                {description ? <p className="text-sm text-ink-600">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-500 transition hover:bg-brand-50 hover:text-brand-700"
                aria-label="Dialog schließen"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-5 sm:px-6">{typeof children === "function" ? children(close) : children}</div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
