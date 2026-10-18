"use client";

import { Radio, VideoOff } from "lucide-react";
import { useActionState } from "react";
import { joinPublicStreamAction } from "@/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

/** Öffentlicher Stream – im Mock-Modus nur Simulation des Beitritts ohne Video. */
export function LiveViewer({ creatorProfileId, displayName }: { creatorProfileId: string; displayName: string }) {
  const [state, action] = useActionState(joinPublicStreamAction, idleState);
  const joined = state.status === "success";
  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-ink-950 text-white shadow-lift">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(234_90_141/0.5),transparent_55%),radial-gradient(circle_at_80%_80%,rgb(176_36_92/0.45),transparent_50%)]" aria-hidden="true" />
        <div className="relative grid h-full place-items-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <VideoOff className="mx-auto size-10 text-white/70" aria-hidden="true" />
            <p className="font-display text-2xl font-semibold">{joined ? `Verbunden mit ${displayName}s Stream` : `${displayName} ist live`}</p>
            <p className="text-sm text-white/70">
              Simulationsmodus: Es ist noch kein Videoanbieter angebunden. Der Beitritt wird serverseitig autorisiert und protokolliert, es wird aber kein Video übertragen.
            </p>
          </div>
        </div>
        <Badge tone="live" className="absolute top-4 left-4 uppercase">
          <span className="size-1.5 animate-live-pulse rounded-full bg-white" /> Live
        </Badge>
      </div>
      {!joined ? (
        <form action={action}>
          <input type="hidden" name="creatorProfileId" value={creatorProfileId} />
          <SubmitButton size="lg" icon={<Radio className="size-5" aria-hidden="true" />}>
            Stream beitreten (Simulation)
          </SubmitButton>
        </form>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}
