import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cancelRequestAction } from "@/actions/sessions";
import { requireSession, toActor } from "@/server/auth/current";
import { splitCommission, formatBps } from "@/server/ledger/commission";
import { getSessionView } from "@/server/video/service";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { SessionRoom } from "@/components/sessions/session-room";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Privater Chat", robots: { index: false, follow: false } };

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/sessions/${id}`);
  const actor = toActor(session)!;
  const view = await getSessionView(actor, id);
  if (!view) notFound();

  const counterpartName = view.viewerRole === "creator" ? (view.customerName ?? "Kunde") : view.creator.displayName;
  const split = view.coinsPerMinute != null && view.commissionBps != null ? splitCommission(view.coinsPerMinute, view.commissionBps) : null;
  const backHref = view.viewerRole === "creator" ? "/studio/sessions" : view.viewerRole === "admin" ? "/admin" : "/account/sessions";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:pt-10">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Zurück
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">Privater 1:1-Chat</p>
          <h1 className="font-display text-3xl font-semibold">mit {counterpartName}</h1>
        </div>
        {view.viewerRole !== "admin" ? (
          <ReportDialog targetType="video_session" targetId={view.id} targetLabel="Sitzung" signedIn triggerLabel="Sitzung melden" />
        ) : null}
      </div>

      <SessionRoom
        sessionId={view.id}
        viewerRole={view.viewerRole}
        counterpartName={counterpartName}
        coinsPerMinute={view.coinsPerMinute}
        initial={{
          ok: true,
          status: view.status,
          chargedMinutes: view.chargedMinutes,
          totalCoins: view.totalCoins,
          startedAt: view.startedAt?.toISOString() ?? null,
          endReason: view.endReason,
          counterpartConnected: view.counterpartConnected,
          joined: view.joined,
        }}
      />

      {view.viewerRole === "customer" && (view.status === "requested" || view.status === "accepted") ? (
        <ActionForm action={cancelRequestAction} submitLabel="Anfrage stornieren" submitVariant="outline" submitSize="sm">
          <input type="hidden" name="sessionId" value={view.id} />
        </ActionForm>
      ) : null}

      <Card>
        <CardBody>
          <DescriptionList
            items={[
              { term: "Angefragt", detail: formatDateTime(view.requestedAt) },
              ...(view.expiresAt && (view.status === "requested" || view.status === "accepted")
                ? [{ term: "Läuft ab", detail: formatDateTime(view.expiresAt) }]
                : []),
              ...(view.startedAt ? [{ term: "Begonnen", detail: formatDateTime(view.startedAt) }] : []),
              ...(view.endedAt ? [{ term: "Beendet", detail: formatDateTime(view.endedAt) }] : []),
              ...(split && view.viewerRole !== "customer"
                ? [
                    {
                      term: "Aufteilung je Minute",
                      detail: `${split.creatorShare} Creator-Anteil · ${split.platformShare} Plattform (${formatBps(split.platformBps)}, vorläufig)`,
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>
      <Alert tone="info" title="So wird abgerechnet">
        <span>
          Sobald beide Seiten verbunden sind, wird jede begonnene Minute serverseitig zum fixierten Preis berechnet – jede Minute genau einmal.
          Bei Verbindungsverlust (über 45 Sekunden ohne Signal) endet die Sitzung automatisch. Es handelt sich ausschließlich um Testmünzen.
        </span>
      </Alert>
    </div>
  );
}
