import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getActor } from "@/server/auth/current";
import { canJoinSession } from "@/server/auth/permissions";
import { getAgeAccess } from "@/server/age/service";
import { getCreatorProfileBySlug } from "@/server/creators/service";
import { activeCoinCurrency } from "@/server/ledger/service";
import { getSettings } from "@/server/settings/service";
import { getActiveStream } from "@/server/video/service";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { LiveViewer } from "@/components/sessions/live-viewer";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Live-Stream", robots: { index: false } };

export default async function LivePage({ params }: PageProps<"/creators/[slug]/live">) {
  const { slug } = await params;
  const actor = await getActor();
  const data = await getCreatorProfileBySlug(slug, actor);
  if (!data) notFound();
  const [stream, settings] = await Promise.all([getActiveStream(data.profile.id), getSettings()]);
  const age = actor?.role === "customer" ? await getAgeAccess(actor.id) : null;
  const canWatch = !!actor && canJoinSession(actor, { kind: "public_stream", customerUserId: null, creatorUserId: data.profile.userId });
  const tipLabel = activeCoinCurrency() === "TEST_COIN" ? "Testmünzen" : "Münzen";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-10">
      <Link href={`/creators/${data.profile.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Zum Profil
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">{data.profile.displayName} – Live</h1>
        <ReportDialog targetType="creator_profile" targetId={data.profile.id} targetLabel="Stream" signedIn={!!actor} />
      </div>
      {!settings.featureFlags.publicStreams ? (
        <Alert tone="warning">Öffentliche Streams sind derzeit deaktiviert.</Alert>
      ) : !stream ? (
        <EmptyState title="Derzeit kein Live-Stream" description={`${data.profile.displayName} ist gerade nicht live.`} action={<ButtonLink href={`/creators/${data.profile.slug}`}>Zum Profil</ButtonLink>} />
      ) : !actor ? (
        <Alert tone="info" title="Anmeldung erforderlich" action={<ButtonLink href={`/login?next=/creators/${data.profile.slug}/live`} size="sm">Anmelden</ButtonLink>}>
          Live-Streams sind nur für angemeldete, geprüft volljährige Kundinnen und Kunden zugänglich.
        </Alert>
      ) : !canWatch ? (
        <Alert tone="warning" title="Kein Zugriff">Streams können nur mit einem aktiven Kundenkonto angesehen werden.</Alert>
      ) : age && !age.allowed ? (
        <Alert tone="brand" title="Altersprüfung erforderlich" action={<ButtonLink href="/account/age-verification" size="sm" icon={<ShieldCheck className="size-4" aria-hidden="true" />}>Jetzt prüfen</ButtonLink>}>
          Bevor du Live-Streams ansehen und chatten kannst, ist eine Altersprüfung erforderlich.
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <LiveViewer creatorProfileId={data.profile.id} displayName={data.profile.displayName} />
          <ChatPanel
            sessionId={stream.id}
            viewerId={actor.id}
            title={`Chat · ${stream.viewerCount} Zuschauer`}
            tip={actor.role === "customer" ? { min: settings.pricing.tipMin, max: settings.pricing.tipMax, enabled: settings.featureFlags.tips, currencyLabel: tipLabel } : null}
            className="lg:max-h-[38rem]"
          />
        </div>
      )}
    </div>
  );
}
