"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

/** Ehrlicher Fehlerzustand ohne technische Details (Details stehen im Server-Log). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<TriangleAlert className="size-6" aria-hidden="true" />}
        title="Etwas ist schiefgelaufen"
        description={`Die Seite konnte nicht geladen werden. Bitte versuche es erneut.${digest ? ` (Referenz: ${digest})` : ""}`}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => retry()} icon={<RefreshCw className="size-4" aria-hidden="true" />}>
              Erneut versuchen
            </Button>
            <ButtonLink href="/" variant="outline">
              Zur Startseite
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
