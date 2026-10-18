"use client";

import { useRouter } from "next/navigation";
import { CircleStop, Flag, Loader2, LogIn, PhoneOff, VideoOff, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { heartbeatAction, joinSessionAction, leaveSessionAction, sessionStateAction, type SessionClientState } from "@/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoinIcon } from "@/components/ui/coins";
import { endReasonLabel, sessionStatus } from "@/lib/labels";
import { formatCoins, formatDuration } from "@/lib/utils";

/**
 * Sitzungsraum. Der Browser sendet nur Herzschläge; Abrechnung und Status
 * werden ausschließlich serverseitig berechnet. Im Mock-Modus wird KEIN Video
 * übertragen – der Bereich zeigt das ehrlich an.
 */
export function SessionRoom({
  sessionId,
  initial,
  viewerRole,
  counterpartName,
  coinsPerMinute,
}: {
  sessionId: string;
  initial: SessionClientState;
  viewerRole: "customer" | "creator" | "admin";
  counterpartName: string;
  coinsPerMinute: number | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<SessionClientState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const lastStatus = useRef(initial.status);

  const terminal = !!state.status && !["requested", "accepted", "active"].includes(state.status);
  const isParticipant = viewerRole !== "admin";

  const apply = useCallback(
    (next: SessionClientState) => {
      if (!next.ok) {
        setError(next.message ?? "Unbekannter Fehler");
        return;
      }
      setError(null);
      setState(next);
      if (next.status !== lastStatus.current) {
        lastStatus.current = next.status;
        router.refresh();
      }
    },
    [router],
  );

  // Herzschlag (Teilnehmer) bzw. Statusabfrage alle 10 s
  useEffect(() => {
    if (terminal) return;
    const interval = window.setInterval(() => {
      const call = isParticipant && state.joined ? heartbeatAction(sessionId) : sessionStateAction(sessionId);
      call.then(apply).catch(() => setError("Verbindung zum Server unterbrochen – wird erneut versucht …"));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [sessionId, terminal, isParticipant, state.joined, apply]);

  // Sekundenanzeige (nur Darstellung, keine Abrechnung)
  useEffect(() => {
    if (state.status !== "active") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [state.status]);

  const elapsed = state.startedAt ? (now - new Date(state.startedAt).getTime()) / 1000 : 0;
  const status = sessionStatus[state.status ?? "requested"] ?? { label: state.status, tone: "neutral" as const };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-ink-950 text-white shadow-lift">
        <div className="aspect-video w-full">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgb(234_90_141/0.45),transparent_55%),radial-gradient(circle_at_80%_85%,rgb(176_36_92/0.45),transparent_50%)]" aria-hidden="true" />
          <div className="relative grid h-full place-items-center p-6 text-center">
            <div className="max-w-md space-y-3">
              <VideoOff className="mx-auto size-10 text-white/70" aria-hidden="true" />
              <p className="font-display text-2xl font-semibold">
                {state.status === "active" ? `Verbunden mit ${counterpartName}` : state.status === "accepted" ? "Bereit zum Beitreten" : status.label}
              </p>
              <p className="text-sm text-white/70">
                Simulationsmodus: Es ist noch kein Videoanbieter angebunden. Hier erscheint später der private Videochat. Es wird kein Bild oder Ton
                übertragen und nichts aufgezeichnet.
              </p>
            </div>
          </div>
        </div>
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {state.status === "active" ? (
            <Badge tone="dark" icon={state.counterpartConnected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}>
              {state.counterpartConnected ? `${counterpartName} verbunden` : `${counterpartName} nicht verbunden`}
            </Badge>
          ) : null}
        </div>
        {state.status === "active" ? (
          <div className="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1 font-mono text-sm tabular-nums backdrop-blur">{formatDuration(elapsed)}</div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-600">Preis (fixiert)</p>
          <p className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
            <CoinIcon className="size-4" /> {coinsPerMinute ?? "–"} / Min.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-600">Berechnete Minuten</p>
          <p className="mt-1 font-semibold tabular-nums">{state.chargedMinutes ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-600">{viewerRole === "creator" ? "Umsatz (brutto, Testmünzen)" : "Bisher berechnet"}</p>
          <p className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
            <CoinIcon className="size-4" /> {formatCoins(state.totalCoins ?? 0)}
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      ) : null}

      {terminal ? (
        <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-700">
          <p className="font-semibold text-ink-950">Diese Sitzung ist beendet.</p>
          {state.endReason ? <p>Grund: {endReasonLabel[state.endReason] ?? state.endReason}</p> : null}
        </div>
      ) : isParticipant ? (
        <div className="flex flex-wrap gap-3">
          {(state.status === "accepted" || state.status === "active") && !state.joined ? (
            <Button
              size="lg"
              disabled={pending}
              icon={pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <LogIn className="size-5" aria-hidden="true" />}
              onClick={() => startTransition(async () => apply(await joinSessionAction(sessionId)))}
            >
              Beitreten (Simulation)
            </Button>
          ) : null}
          {state.status === "accepted" && state.joined ? (
            <p className="flex items-center gap-2 text-sm text-ink-700">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden="true" /> Warte auf {counterpartName} …
            </p>
          ) : null}
          {state.status === "requested" ? (
            <p className="flex items-center gap-2 text-sm text-ink-700">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden="true" /> Warte auf Antwort des Creators … Es werden keine Münzen berechnet.
            </p>
          ) : null}
          {state.status === "active" || (state.status === "accepted" && viewerRole === "creator") ? (
            <Button
              variant={state.status === "active" ? "danger" : "outline"}
              size="lg"
              disabled={pending}
              icon={state.status === "active" ? <PhoneOff className="size-5" aria-hidden="true" /> : <CircleStop className="size-5" aria-hidden="true" />}
              onClick={() => startTransition(async () => apply(await leaveSessionAction(sessionId)))}
            >
              {state.status === "active" ? "Sitzung beenden" : "Abbrechen"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-600">
          <Flag className="size-4" aria-hidden="true" /> Admin-Ansicht: nur Metadaten, kein Beitritt.
        </p>
      )}
    </div>
  );
}
