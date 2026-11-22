"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

/**
 * Videobühne für LiveKit. Der Browser erhält nur ein kurzlebiges, auf diesen Raum
 * beschränkte Token. Creator senden Kamera/Mikrofon; alle anderen empfangen nur.
 * Es wird nichts aufgezeichnet.
 */
export function LiveKitStage({ serverUrl, token, publish, label }: { serverUrl: string; token: string; publish: boolean; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    let cancelled = false;
    const attach = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
      if (track.kind === Track.Kind.Audio && audioRef.current) audioRef.current.appendChild(track.attach());
    };
    room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach());
    room.on(RoomEvent.Disconnected, () => !cancelled && setState("error"));
    room
      .connect(serverUrl, token)
      .then(async () => {
        if (cancelled) return;
        setState("connected");
        if (publish) {
          await room.localParticipant.enableCameraAndMicrophone();
          const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
          if (local && videoRef.current) local.attach(videoRef.current);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
        setError("Die Videoverbindung konnte nicht aufgebaut werden.");
      });
    return () => {
      cancelled = true;
      void room.disconnect();
    };
  }, [serverUrl, token, publish]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-3xl bg-stage text-white shadow-lift">
      <video ref={videoRef} className="size-full object-cover" autoPlay playsInline muted={publish} aria-label={label} />
      <div ref={audioRef} hidden />
      {state !== "connected" ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-white/70" role="status">
          {state === "connecting" ? "Verbinde …" : (error ?? "Verbindung getrennt.")}
        </p>
      ) : null}
    </div>
  );
}
