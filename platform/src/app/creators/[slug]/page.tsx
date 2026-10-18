import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, Eye, Info, Languages, Radio, ShieldCheck, Wallet } from "lucide-react";
import { languageLabel, tagLabel } from "@/config/catalog";
import { videoSessions } from "@/config/platform";
import { getActor } from "@/server/auth/current";
import { hasPermission } from "@/server/auth/permissions";
import { getCreatorProfileBySlug } from "@/server/creators/service";
import { getBalance } from "@/server/ledger/service";
import { canCreatorOperate } from "@/server/verification/service";
import { getActiveStream, getOpenSessionForCustomer } from "@/server/video/service";
import { RequestChatForm } from "@/components/creators/request-chat-form";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CoinAmount, PricePerMinute } from "@/components/ui/coins";
import { AvailabilityBadge, TestProfileBadge, VerificationBadge } from "@/components/ui/status";
import { formatDateTime } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/creators/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCreatorProfileBySlug(slug, null);
  if (!data) return { title: "Profil nicht gefunden", robots: { index: false } };
  return {
    title: data.profile.displayName,
    description: data.profile.tagline || `Profil von ${data.profile.displayName}`,
    // Datenschutzfreundlich: Indexierung nur, wenn der Creator sie ausdrücklich erlaubt.
    robots: { index: data.profile.allowSearchIndexing && !data.profile.isTestProfile, follow: false },
  };
}

export default async function CreatorProfilePage({ params }: PageProps<"/creators/[slug]">) {
  const { slug } = await params;
  const actor = await getActor();
  const data = await getCreatorProfileBySlug(slug, actor);
  if (!data) notFound();
  const { profile, offer, gallery, verification } = data;

  const [stream, canOperate, balance, openSession] = await Promise.all([
    getActiveStream(profile.id),
    canCreatorOperate(profile.userId),
    actor?.role === "customer" ? getBalance(actor.id, "customer_wallet") : Promise.resolve(null),
    actor?.role === "customer" ? getOpenSessionForCustomer(actor.id) : Promise.resolve(null),
  ]);

  const privateAvailable = !!offer?.enabled && canOperate && (profile.availability === "online" || profile.availability === "live");
  const minimum = offer ? offer.coinsPerMinute * videoSessions.minimumBalanceMinutes : 0;

  let chatBlock: React.ReactNode;
  if (!offer?.enabled) {
    chatBlock = <Alert tone="info" title="Private Chats derzeit nicht angeboten" />;
  } else if (!canOperate) {
    chatBlock = (
      <Alert tone="warning" title="Noch nicht freigeschaltet">
        Private Chats sind erst nach erfolgreicher Alters- und Identitätsprüfung verfügbar.
      </Alert>
    );
  } else if (!actor) {
    chatBlock = (
      <div className="space-y-3">
        <ButtonLink href={`/login?next=/creators/${profile.slug}`} size="lg" className="w-full">
          Anmelden, um anzufragen
        </ButtonLink>
        <p className="text-center text-xs text-ink-600">
          Noch kein Konto? <Link href="/register" className="font-medium text-brand-700">Kostenlos registrieren</Link>
        </p>
      </div>
    );
  } else if (actor.role !== "customer") {
    chatBlock = <Alert tone="info">Private Chats können nur mit einem Kundenkonto angefragt werden.</Alert>;
  } else if (!hasPermission(actor, "sessions.request_private")) {
    chatBlock = (
      <Alert tone="warning" title={actor.emailVerified ? "Konto eingeschränkt" : "E-Mail-Adresse bestätigen"}>
        {actor.emailVerified
          ? "Dein Konto ist derzeit eingeschränkt. Details findest du in deinem Konto."
          : "Bitte bestätige zuerst deine E-Mail-Adresse, um private Chats anfragen zu können."}
      </Alert>
    );
  } else if (openSession) {
    chatBlock = (
      <Alert tone="info" title="Du hast bereits eine offene Sitzung" action={<ButtonLink href={`/sessions/${openSession.id}`} size="sm">Öffnen</ButtonLink>} />
    );
  } else if (!privateAvailable) {
    chatBlock = <Alert tone="info" title="Gerade nicht verfügbar">Der Creator ist derzeit nicht für private Chats online.</Alert>;
  } else if ((balance ?? 0) < minimum) {
    chatBlock = (
      <Alert tone="warning" title="Nicht genügend Testguthaben" action={<ButtonLink href="/account/wallet" size="sm" variant="secondary">Zum Guthaben</ButtonLink>}>
        Für eine Anfrage brauchst du mindestens {minimum} Testmünzen.
      </Alert>
    );
  } else {
    chatBlock = <RequestChatForm creatorProfileId={profile.id} />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <Link href="/creators" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Zurück zur Übersicht
      </Link>

      {!data.publiclyVisible ? (
        <Alert tone="warning" title="Vorschau – nicht öffentlich sichtbar" className="mt-4">
          Dieses Profil ist noch nicht freigegeben. Nur du {data.isOwner ? "" : "(bzw. Admins) "}siehst diese Vorschau.
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-8">
          {/* Kopfbereich */}
          <section className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            <div className="h-28 bg-aurora sm:h-36" aria-hidden="true" />
            <div className="px-5 pb-6 sm:px-8">
              <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end">
                <Avatar name={profile.displayName} mediaId={data.avatarMediaId} size="xl" rounded="2xl" className="ring-4 ring-surface shadow-lift sm:size-36" />
                <div className="min-w-0 flex-1 space-y-2 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AvailabilityBadge availability={profile.availability} />
                    <VerificationBadge verification={verification} />
                    {profile.isTestProfile ? <TestProfileBadge /> : null}
                  </div>
                  <h1 className="font-display text-4xl font-semibold tracking-tight">{profile.displayName}</h1>
                  {profile.tagline ? <p className="text-ink-700">{profile.tagline}</p> : null}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
                {profile.languages.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Languages className="size-4" aria-hidden="true" /> {profile.languages.map(languageLabel).join(", ")}
                  </span>
                ) : null}
                {profile.lastOnlineAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-4" aria-hidden="true" /> Zuletzt online {formatDateTime(profile.lastOnlineAt)}
                  </span>
                ) : null}
              </div>
              {profile.tags.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Themen">
                  {profile.tags.map((tag) => (
                    <li key={tag}>
                      <Link href={`/creators?tag=${tag}`} className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 transition hover:bg-brand-100">
                        {tagLabel(tag)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          {/* Live */}
          {stream ? (
            <section className="overflow-hidden rounded-3xl border border-brand-200 bg-surface shadow-card">
              <div className="relative grid aspect-video place-items-center overflow-hidden bg-ink-950 text-center text-white">
                <div className="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_30%_20%,rgb(234_90_141/0.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgb(176_36_92/0.5),transparent_50%)]" aria-hidden="true" />
                <div className="relative space-y-3 px-6">
                  <Badge tone="live" className="uppercase">
                    <span className="size-1.5 animate-live-pulse rounded-full bg-white" /> Live seit {stream.startedAt ? formatDateTime(stream.startedAt) : "–"}
                  </Badge>
                  <p className="font-display text-2xl font-semibold">{profile.displayName} ist live</p>
                  <p className="mx-auto max-w-md text-sm text-white/75">
                    Videoanbieter noch nicht angebunden – hier erscheint später der öffentliche Stream. Es wird kein Video übertragen.
                  </p>
                  <ButtonLink href={`/creators/${profile.slug}/live`} variant="secondary" icon={<Radio className="size-4" aria-hidden="true" />}>
                    Stream öffnen
                  </ButtonLink>
                </div>
                <span className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur">
                  <Eye className="size-3.5" aria-hidden="true" /> {stream.viewerCount} Zuschauer
                </span>
              </div>
            </section>
          ) : null}

          {/* Über */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">Über {profile.displayName}</h2>
            {profile.bio ? (
              <p className="leading-relaxed whitespace-pre-line text-ink-700">{profile.bio}</p>
            ) : (
              <p className="text-ink-600">Noch keine Beschreibung vorhanden.</p>
            )}
          </section>

          {/* Galerie */}
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">Galerie</h2>
            {gallery.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((media) => (
                  <li key={media.id} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-50">
                    <Image src={`/media/${media.id}`} alt={`Bild von ${profile.displayName}`} fill sizes="(min-width: 640px) 30vw, 45vw" className="object-cover" loading="lazy" unoptimized />
                    {media.moderationStatus !== "approved" ? (
                      <Badge tone="warning" className="absolute top-2 left-2">
                        {media.moderationStatus === "pending" ? "In Prüfung" : "Abgelehnt"}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-strong bg-brand-25 px-5 py-8 text-center text-sm text-ink-600">
                Noch keine freigegebenen Bilder.
              </p>
            )}
          </section>

          {/* Regeln */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">Regeln für die Kontaktaufnahme</h2>
            <Card>
              <CardBody className="space-y-3 text-sm leading-relaxed text-ink-700">
                {profile.contactRules ? <p className="whitespace-pre-line">{profile.contactRules}</p> : null}
                <p className="flex gap-2 text-ink-600">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span>
                    Zusätzlich gelten die{" "}
                    <Link href="/legal/community-guidelines" className="font-medium text-brand-700 hover:underline">
                      Community-Richtlinien
                    </Link>
                    . Keine Aufnahmen, keine Weitergabe von Inhalten, keine persönlichen Kontaktdaten erfragen.
                  </span>
                </p>
              </CardBody>
            </Card>
          </section>
        </div>

        {/* Seitenleiste: Angebot & Aktionen */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-brand-25 px-5 py-4">
              <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Privater 1:1-Videochat</p>
              <div className="mt-2">
                {offer ? <PricePerMinute coins={offer.coinsPerMinute} className="text-xl" /> : <span className="text-sm text-ink-600">Kein Preis hinterlegt</span>}
              </div>
            </div>
            <CardBody className="space-y-4">
              {chatBlock}
              <ul className="space-y-2 text-xs leading-relaxed text-ink-600">
                <li className="flex gap-2">
                  <Clock3 className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                  Abrechnung je begonnener Minute, nur solange der Chat aktiv ist. Beenden ist jederzeit möglich.
                </li>
                <li className="flex gap-2">
                  <Info className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                  Der Preis wird bei der Anfrage fixiert. Ablehnung oder Ablauf der Anfrage kostet nichts.
                </li>
                {balance !== null ? (
                  <li className="flex items-center gap-2">
                    <Wallet className="size-3.5 shrink-0 text-brand-600" aria-hidden="true" /> Dein Testguthaben: <CoinAmount amount={balance} size="sm" />
                  </li>
                ) : null}
              </ul>
            </CardBody>
          </Card>
          <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-2 shadow-xs">
            <span className="text-xs text-ink-600">Stimmt etwas nicht?</span>
            <ReportDialog targetType="creator_profile" targetId={profile.id} targetLabel="Profil" signedIn={!!actor} />
          </div>
        </aside>
      </div>
    </div>
  );
}
