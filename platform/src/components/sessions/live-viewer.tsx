"use client";

import { Radio, VideoOff } from "lucide-react";
import { useActionState } from "react";
import { joinPublicStreamAction } from "@/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";
import { LiveKitStage } from "./livekit-stage";

/** Öffentlicher Stream – mit echtem Anbieter (LiveKit) Video, im Mock-Modus nur Simulation des Beitritts. */
export function LiveViewer({ creatorProfileId, displayName, publish = false }: { creatorProfileId: string; displayName: string; publish?: boolean }) {
  const [state, action] = useActionState(joinPublicStreamAction, idleState);
  const joined = state.status === "success";
  const videoToken = typeof state.data?.videoToken === "string" ? state.data.videoToken : null;
  const videoServerUrl = typeof state.data?.videoServerUrl === "string" ? state.data.videoServerUrl : null;
  if (joined && videoToken && videoServerUrl) {
    return <LiveKitStage serverUrl={videoServerUrl} token={videoToken} publish={publish} label={`Live-Stream von ${displayName}`} />;
  }
  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-stage text-white shadow-lift">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(234_90_141/0.5),transparent_55%),radial-gradient(circle_at_80%_80%,rgb(176_36_92/0.45),transparent_50%)]" aria-hidden="true" />
        <div className="relative grid h-full place-items-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <VideoOff className="mx-auto size-10 text-white/70" aria-hidden="true" />
            <p className="font-display text-2xl font-semibold">{joined ? `Verbunden mit ${displayName}s Stream` : `${displayName} ist live`}</p>
            <p className="text-sm text-white/70">
              {joined
                ? "Simulationsmodus: Der Beitritt wurde serverseitig autorisiert und protokolliert, es wird aber kein Video übertragen."
                : "Mit einem angebundenen Videoanbieter (LiveKit) startet hier das Video. Im Testmodus wird der Beitritt nur simuliert."}
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
            {publish ? "Kamera starten" : "Stream beitreten"}
          </SubmitButton>
        </form>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}
