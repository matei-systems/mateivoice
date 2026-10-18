import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Kein Zugriff", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<ShieldX className="size-6" aria-hidden="true" />}
        title="Kein Zugriff"
        description="Für diesen Bereich fehlt deinem Konto die Berechtigung."
        action={<ButtonLink href="/">Zur Startseite</ButtonLink>}
      />
    </div>
  );
}
