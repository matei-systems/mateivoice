import { UserRoundX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function CreatorNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<UserRoundX className="size-6" aria-hidden="true" />}
        title="Profil nicht gefunden"
        description="Dieses Profil existiert nicht, ist noch nicht freigegeben oder wurde ausgeblendet."
        action={<ButtonLink href="/creators">Zur Übersicht</ButtonLink>}
      />
    </div>
  );
}
