"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Aktualisiert Serverdaten periodisch (z. B. eingehende Anfragen), solange der Tab sichtbar ist. */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
