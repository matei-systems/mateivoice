import type { Metadata } from "next";
import Link from "next/link";
import { Check, Inbox, Radio, Wifi, WifiOff, X } from "lucide-react";
import { isTestMode } from "@/config/env";
import { respondToRequestAction, setAvailabilityAction } from "@/actions/sessions";
import { requireRole, toActor } from "@/server/auth/current";
import { getOwnProfile } from "@/server/creators/service";
import { getLatestVerification } from "@/server/verification/service";
import { getActiveStream, listOpenRequestsForCreator } from "@/server/video/service";
import { AutoRefresh } from "@/components/studio/auto-refresh";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PricePerMinute } from "@/components/ui/coins";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { AvailabilityBadge } from "@/components/ui/status";
import { creatorCanOperate, type VerificationStatus } from "@/lib/verification";
import { sessionStatus } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Live & Anfragen" };

export default async function StudioLivePage() {
  const session = await requireRole(["creator"], "/studio/live");
  const actor = toActor(session)!;
  const [own, requests, verification] = await Promise.all([getOwnProfile(actor.id), listOpenRequestsForCreator(actor), getLatestVerification(actor.id)]);
  if (!own) return null;
  const stream = await getActiveStream(own.profile.id);
  const canOperate = creatorCanOperate(verification?.status as VerificationStatus | undefined, verification?.provider, isTestMode());
  const approved = own.profile.reviewStatus === "approved";
  const availability = own.profile.availability;

  const options = [
    { value: "offline", label: "Offline", icon: <WifiOff className="size-4" aria-hidden="true" />, text: "Nicht sichtbar als verfügbar." },
    { value: "online", label: "Online", icon: <Wifi className="size-4" aria-hidden="true" />, text: "Für private Chat-Anfragen erreichbar." },
    { value: "live", label: "Live gehen", icon: <Radio className="size-4" aria-hidden="true" />, text: "Öffentlicher Stream (Simulation) + Anfragen." },
  ] as const;

  return (
    <>
      <AutoRefresh />
      <PageHeader eyebrow="Live" title="Live & Anfragen" description="Verfügbarkeit steuern und Anfragen beantworten. Die Seite aktualisiert sich automatisch." />
      {!approved ? <Alert tone="warning" title="Profil noch nicht freigegeben">Live gehen ist erst nach der Freigabe deines Profils möglich.</Alert> : null}
      {!canOperate ? (
        <Alert tone="warning" title="Verifizierung erforderlich" action={<ButtonLink href="/studio/verification" size="sm" variant="outline">Zur Verifizierung</ButtonLink>}>
          Live-Funktionen und private Chats sind erst nach der Alters- und Identitätsprüfung verfügbar.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Verfügbarkeit"
          action={<AvailabilityBadge availability={availability} />}
          description={stream ? `Stream läuft seit ${stream.startedAt ? formatDateTime(stream.startedAt) : "–"} · ${stream.viewerCount} Zuschauer (Simulation)` : undefined}
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            {options.map((option) => {
              const active = availability === option.value;
              const disabled = availability === "in_private" || (option.value === "live" && (!approved || !canOperate));
              return (
                <ActionForm key={option.value} action={setAvailabilityAction} className="space-y-0">
                  <input type="hidden" name="availability" value={option.value} />
                  <button
                    type="submit"
                    disabled={disabled || active}
                    className={`flex h-full w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition ${
                      active ? "border-brand-500 bg-brand-50 shadow-glow" : "border-line bg-surface hover:border-brand-300 hover:bg-brand-25"
                    } disabled:cursor-not-allowed ${disabled && !active ? "opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-ink-950">
                      {option.icon} {option.label}
                      {active ? <Badge tone="brand">aktiv</Badge> : null}
                    </span>
                    <span className="text-xs text-ink-600">{option.text}</span>
                  </button>
                </ActionForm>
              );
            })}
          </div>
          {availability === "in_private" ? <p className="mt-3 text-sm text-ink-600">Du bist gerade in einem privaten Chat.</p> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Anfragen & laufende Chats" description="Anfragen verfallen automatisch nach 2 Minuten. Ablehnen kostet den Kunden nichts." />
        <CardBody>
          {requests.length ? (
            <ul className="divide-y divide-line">
              {requests.map((request) => {
                const status = sessionStatus[request.status]!;
                return (
                  <li key={request.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {request.customerName} <Badge tone={status.tone} className="ml-1">{status.label}</Badge>
                      </p>
                      <p className="flex flex-wrap items-center gap-3 text-xs text-ink-600">
                        {request.coinsPerMinute ? <PricePerMinute coins={request.coinsPerMinute} className="text-xs" /> : null}
                        Angefragt {formatDateTime(request.requestedAt)}
                        {request.expiresAt && request.status !== "active" ? ` · läuft ab ${formatDateTime(request.expiresAt)}` : ""}
                      </p>
                    </div>
                    {request.status === "requested" ? (
                      <div className="flex gap-2">
                        <ActionForm action={respondToRequestAction} className="space-y-0" submitLabel="Annehmen" submitIcon={<Check className="size-4" aria-hidden="true" />} submitSize="sm">
                          <input type="hidden" name="sessionId" value={request.id} />
                          <input type="hidden" name="decision" value="accept" />
                        </ActionForm>
                        <ActionForm action={respondToRequestAction} className="space-y-0" submitLabel="Ablehnen" submitVariant="outline" submitIcon={<X className="size-4" aria-hidden="true" />} submitSize="sm">
                          <input type="hidden" name="sessionId" value={request.id} />
                          <input type="hidden" name="decision" value="decline" />
                        </ActionForm>
                      </div>
                    ) : (
                      <ButtonLink href={`/sessions/${request.id}`} size="sm">
                        Zur Sitzung
                      </ButtonLink>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<Inbox className="size-6" aria-hidden="true" />} title="Keine offenen Anfragen" description={availability === "offline" ? "Gehe online, um Anfragen zu erhalten." : "Neue Anfragen erscheinen hier automatisch."} />
          )}
        </CardBody>
      </Card>
      <p className="text-xs text-ink-600">
        Hinweis: Es ist noch kein Videoanbieter angebunden. „Live“ und private Chats laufen als Simulation ohne Bild und Ton.{" "}
        <Link href="/legal/community-guidelines" className="text-brand-700 hover:underline">Community-Richtlinien</Link>
      </p>
    </>
  );
}
