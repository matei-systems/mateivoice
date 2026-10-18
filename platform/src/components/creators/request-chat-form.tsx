"use client";

import { MessageCircleHeart } from "lucide-react";
import { useActionState } from "react";
import { requestPrivateSessionAction } from "@/actions/sessions";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

export function RequestChatForm({ creatorProfileId }: { creatorProfileId: string }) {
  const [state, action] = useActionState(requestPrivateSessionAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="creatorProfileId" value={creatorProfileId} />
      <SubmitButton size="lg" className="w-full" icon={<MessageCircleHeart className="size-5" aria-hidden="true" />} pendingLabel="Anfrage wird gesendet …">
        Privaten Chat anfragen
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
