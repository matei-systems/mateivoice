import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import { languageLabel, tagLabel } from "@/config/catalog";
import { moderateMediaAction, reviewProfileAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { getProfileForAdmin } from "@/server/creators/service";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { PricePerMinute } from "@/components/ui/coins";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { VerificationBadge } from "@/components/ui/status";
import { reviewStatus } from "@/lib/labels";
import { verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Profilprüfung" };

export default async function AdminCreatorPage({ params }: PageProps<"/admin/creators/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/creators/${id}`);
  const data = await getProfileForAdmin(id);
  if (!data) notFound();
  const { profile, offer, verification, media } = data;
  const review = reviewStatus[profile.reviewStatus]!;

  return (
    <>
      <Link href="/admin/creators" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Alle Profile
      </Link>
      <PageHeader
        eyebrow={`@${data.username}`}
        title={profile.displayName}
        actions={
          <>
            <Badge tone={review.tone}>{review.label}</Badge>
            <ButtonLink href={`/creators/${profile.slug}`} size="sm" variant="ghost" icon={<ExternalLink className="size-4" aria-hidden="true" />}>
              Vorschau
            </ButtonLink>
            <ButtonLink href={`/admin/users/${data.userId}`} size="sm" variant="outline">
              Konto
            </ButtonLink>
          </>
        }
      />
      <Card>
        <CardHeader
          title="Entscheidung"
          description="Ablehnungen und Sperren werden begründet, protokolliert und dem Creator mitgeteilt."
          action={
            <div className="flex flex-wrap gap-2">
              <ConfirmActionDialog
                trigger="Freigeben"
                triggerVariant="primary"
                triggerIcon={<Check className="size-4" aria-hidden="true" />}
                title="Profil freigeben"
                description="Das Profil wird öffentlich sichtbar (sofern die Verifizierungsvoraussetzungen erfüllt sind)."
                confirmLabel="Freigeben"
                action={reviewProfileAction}
                hiddenFields={{ profileId: profile.id, decision: "approve" }}
                reasonLabel="Notiz (optional)"
              />
              <ConfirmActionDialog
                trigger="Änderungen anfordern"
                title="Änderungen anfordern"
                confirmLabel="Anfordern"
                action={reviewProfileAction}
                hiddenFields={{ profileId: profile.id, decision: "request_changes" }}
                reasonLabel="Was muss geändert werden?"
                reasonRequired
              />
              <ConfirmActionDialog
                trigger="Sperren"
                triggerVariant="danger"
                triggerIcon={<X className="size-4" aria-hidden="true" />}
                variant="danger"
                title="Profil sperren"
                confirmLabel="Sperren"
                action={reviewProfileAction}
                hiddenFields={{ profileId: profile.id, decision: "suspend" }}
                reasonLabel="Begründung"
                reasonRequired
              />
            </div>
          }
        />
        <CardBody>
          <DescriptionList
            items={[
              { term: "Kurzbeschreibung", detail: profile.tagline || "–" },
              { term: "Beschreibung", detail: <span className="whitespace-pre-line">{profile.bio || "–"}</span> },
              { term: "Kontaktregeln", detail: <span className="whitespace-pre-line">{profile.contactRules || "–"}</span> },
              { term: "Sprachen", detail: profile.languages.map(languageLabel).join(", ") || "–" },
              { term: "Themen", detail: profile.tags.map(tagLabel).join(", ") || "–" },
              { term: "Preis", detail: offer ? <span className="flex items-center gap-2"><PricePerMinute coins={offer.coinsPerMinute} /> {offer.enabled ? <Badge tone="success">aktiv</Badge> : <Badge>inaktiv</Badge>}</span> : "–" },
              {
                term: "Verifizierung",
                detail: (
                  <span className="flex flex-wrap items-center gap-2">
                    <VerificationBadge verification={verificationDisplay(verification?.status as VerificationStatus | undefined, verification?.provider)} />
                    {verification ? <span className="text-xs text-ink-600">Anbieter: {verification.provider} · {formatDateTime(verification.updatedAt)}</span> : null}
                  </span>
                ),
              },
              { term: "Letzte Prüfung", detail: profile.reviewedAt ? `${formatDateTime(profile.reviewedAt)}${profile.reviewNote ? ` – ${profile.reviewNote}` : ""}` : "–" },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Bilder" description="Nur freigegebene Bilder sind öffentlich sichtbar." />
        <CardBody>
          {media.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((m) => (
                <li key={m.id} className="space-y-2 rounded-2xl border border-line p-3">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-brand-50">
                    <Image src={`/media/${m.id}`} alt={m.kind === "avatar" ? "Profilbild" : "Galeriebild"} fill sizes="300px" className="object-cover" unoptimized />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={m.moderationStatus === "approved" ? "success" : m.moderationStatus === "rejected" ? "danger" : "warning"}>
                      {m.kind === "avatar" ? "Profilbild" : "Galerie"} · {m.moderationStatus === "approved" ? "frei" : m.moderationStatus === "rejected" ? "abgelehnt" : "offen"}
                    </Badge>
                    <div className="flex gap-1.5">
                      {m.moderationStatus !== "approved" ? (
                        <ConfirmActionDialog trigger="Freigeben" title="Bild freigeben" confirmLabel="Freigeben" action={moderateMediaAction} hiddenFields={{ mediaId: m.id, decision: "approved" }} />
                      ) : null}
                      {m.moderationStatus !== "rejected" ? (
                        <ConfirmActionDialog trigger="Ablehnen" title="Bild ablehnen" confirmLabel="Ablehnen" variant="danger" action={moderateMediaAction} hiddenFields={{ mediaId: m.id, decision: "rejected" }} reasonLabel="Begründung" reasonRequired />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Keine Bilder hochgeladen.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
