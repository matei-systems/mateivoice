import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Coins, Percent, Radio, Users } from "lucide-react";
import { isTestMode } from "@/config/env";
import { commission } from "@/config/platform";
import { requireRole, toActor } from "@/server/auth/current";
import { getOwnProfile } from "@/server/creators/service";
import { formatBps } from "@/server/ledger/commission";
import { currentCommissionBps, getBalance } from "@/server/ledger/service";
import { getLatestVerification } from "@/server/verification/service";
import { listOpenRequestsForCreator, listSessionsForUser } from "@/server/video/service";
import { SessionsTable } from "@/components/account/sessions-table";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { VerificationBadge } from "@/components/ui/status";
import { creatorCanOperate, verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { reviewStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Creator-Studio" };

export default async function StudioOverviewPage() {
  const session = await requireRole(["creator"], "/studio");
  const actor = toActor(session)!;
  const [own, earnings, verification, sessions, openRequests] = await Promise.all([
    getOwnProfile(actor.id),
    getBalance(actor.id, "creator_earnings"),
    getLatestVerification(actor.id),
    listSessionsForUser(actor, 5),
    listOpenRequestsForCreator(actor),
  ]);
  if (!own) return <Alert tone="danger" title="Kein Creator-Profil gefunden">Bitte kontaktiere den Support.</Alert>;
  const { profile, offer, media } = own;
  const display = verificationDisplay(verification?.status as VerificationStatus | undefined, verification?.provider);
  const canOperate = creatorCanOperate(verification?.status as VerificationStatus | undefined, verification?.provider, isTestMode());
  const review = reviewStatus[profile.reviewStatus]!;

  const checklist = [
    { done: session.user.emailVerified, label: "E-Mail-Adresse bestätigt", href: "/account" },
    { done: profile.tagline.length >= 5 && profile.bio.length >= 40, label: "Profiltext ausgefüllt", href: "/studio/profile" },
    { done: media.some((m) => m.kind === "avatar"), label: "Profilbild hochgeladen", href: "/studio/profile" },
    { done: profile.reviewStatus !== "draft" && profile.reviewStatus !== "changes_requested", label: "Profil zur Prüfung eingereicht", href: "/studio/profile" },
    { done: profile.reviewStatus === "approved", label: "Profil freigegeben", href: "/studio/profile" },
    { done: canOperate, label: isTestMode() ? "Verifizierung (im Testmodus simuliert)" : "Alters- & Identitätsprüfung bestanden", href: "/studio/verification" },
    { done: !!offer?.enabled, label: "Privaten Chat aktiviert", href: "/studio/pricing" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader
        eyebrow="Creator-Studio"
        title={`Hallo, ${profile.displayName}`}
        description="Status, Anfragen und Einnahmen auf einen Blick."
        actions={<ButtonLink href="/studio/live" icon={<Radio className="size-4" aria-hidden="true" />}>Live & Anfragen</ButtonLink>}
      />
      {openRequests.some((r) => r.status === "requested") ? (
        <Alert tone="brand" title="Neue Anfrage für einen privaten Chat" action={<ButtonLink href="/studio/live" size="sm">Ansehen</ButtonLink>} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="brand" label="Einnahmen (Testmünzen)" value={<CoinAmount amount={earnings} size="lg" />} hint="Simuliert – nicht auszahlbar." icon={<Coins className="size-5" aria-hidden="true" />} />
        <StatCard label="Provision (vorläufig)" value={formatBps(currentCommissionBps())} hint={commission.basisDescription} icon={<Percent className="size-5" aria-hidden="true" />} />
        <StatCard label="Profilstatus" value={<Badge tone={review.tone}>{review.label}</Badge>} hint={profile.reviewNote ? `Hinweis: ${profile.reviewNote}` : undefined} />
        <StatCard label="Verifizierung" value={<VerificationBadge verification={display} />} hint={display.description} icon={<Users className="size-5" aria-hidden="true" />} />
      </div>
      <Card>
        <CardHeader title="Startklar werden" description={`${doneCount} von ${checklist.length} Schritten erledigt`} />
        <CardBody>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-brand-50" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={checklist.length}>
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-700" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-brand-25", item.done ? "text-ink-600" : "font-medium text-ink-900")}>
                  {item.done ? <CheckCircle2 className="size-5 text-success-600" aria-hidden="true" /> : <Circle className="size-5 text-ink-300" aria-hidden="true" />}
                  <span className={cn(item.done && "line-through decoration-ink-300")}>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Letzte Sitzungen" action={<Link href="/studio/sessions" className="text-sm font-medium text-brand-700 hover:underline">Alle</Link>} />
        {sessions.length ? <SessionsTable rows={sessions} perspective="creator" /> : <CardBody><p className="text-sm text-ink-600">Noch keine Sitzungen.</p></CardBody>}
      </Card>
    </>
  );
}
