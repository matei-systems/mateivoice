import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/server/auth/current";
import { canJoinSession } from "@/server/auth/permissions";
import { getCreatorProfileBySlug } from "@/server/creators/service";
import { getActiveStream } from "@/server/video/service";
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
  const stream = await getActiveStream(data.profile.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:pt-10">
      <Link href={`/creators/${data.profile.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Zum Profil
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">{data.profile.displayName} – Live</h1>
        <ReportDialog targetType="creator_profile" targetId={data.profile.id} targetLabel="Stream" signedIn={!!actor} />
      </div>
      {!stream ? (
        <EmptyState title="Derzeit kein Live-Stream" description={`${data.profile.displayName} ist gerade nicht live.`} action={<ButtonLink href={`/creators/${data.profile.slug}`}>Zum Profil</ButtonLink>} />
      ) : !actor ? (
        <Alert tone="info" title="Anmeldung erforderlich" action={<ButtonLink href={`/login?next=/creators/${data.profile.slug}/live`} size="sm">Anmelden</ButtonLink>}>
          Live-Streams sind nur für angemeldete, volljährige Kundinnen und Kunden zugänglich.
        </Alert>
      ) : !canJoinSession(actor, { kind: "public_stream", customerUserId: null, creatorUserId: data.profile.userId }) ? (
        <Alert tone="warning" title="Kein Zugriff">Streams können nur mit einem aktiven Kundenkonto angesehen werden.</Alert>
      ) : (
        <LiveViewer creatorProfileId={data.profile.id} displayName={data.profile.displayName} />
      )}
    </div>
  );
}
