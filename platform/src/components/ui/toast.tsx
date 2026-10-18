"use client";

import { CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };
type ToastApi = { show: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-lift",
              toast.tone === "success" && "border-success-200",
              toast.tone === "error" && "border-danger-200",
              toast.tone === "info" && "border-line",
            )}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 className="mt-px size-5 shrink-0 animate-pop text-success-600" aria-hidden="true" />
            ) : toast.tone === "error" ? (
              <OctagonAlert className="mt-px size-5 shrink-0 text-danger-600" aria-hidden="true" />
            ) : (
              <Info className="mt-px size-5 shrink-0 text-brand-600" aria-hidden="true" />
            )}
            <p className="flex-1 text-ink-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 grid size-6 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Hinweis schließen"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => undefined };
}
