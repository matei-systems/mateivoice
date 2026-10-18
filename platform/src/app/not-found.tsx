import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<Compass className="size-6" aria-hidden="true" />}
        title="Seite nicht gefunden"
        description="Die Seite existiert nicht (mehr) oder du hast keinen Zugriff darauf."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/">Zur Startseite</ButtonLink>
            <ButtonLink href="/creators" variant="outline">
              Creator entdecken
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
