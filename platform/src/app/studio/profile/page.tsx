import type { Metadata } from "next";
import Image from "next/image";
import { Send, Trash2, Upload } from "lucide-react";
import { LANGUAGES, TAGS } from "@/config/catalog";
import { uploads } from "@/config/platform";
import { deleteImageAction, submitForReviewAction, updateProfileAction, uploadImageAction } from "@/actions/studio";
import { requireRole } from "@/server/auth/current";
import { getOwnProfile } from "@/server/creators/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { reviewStatus } from "@/lib/labels";

export const metadata: Metadata = { title: "Profil bearbeiten" };

const moderationBadge = {
  pending: { label: "In Prüfung", tone: "warning" },
  approved: { label: "Freigegeben", tone: "success" },
  rejected: { label: "Abgelehnt", tone: "danger" },
} as const;

export default async function StudioProfilePage() {
  const session = await requireRole(["creator"], "/studio/profile");
  const own = await getOwnProfile(session.user.id);
  if (!own) return null;
  const { profile, media } = own;
  const review = reviewStatus[profile.reviewStatus]!;
  const avatar = media.find((m) => m.id === profile.avatarMediaId);
  const gallery = media.filter((m) => m.kind === "gallery");
  const canSubmit = profile.reviewStatus === "draft" || profile.reviewStatus === "changes_requested";

  return (
    <>
      <PageHeader
        eyebrow="Profil"
        title="Profil bearbeiten"
        description="Texte, Themen und Bilder. Alle Inhalte werden vor der Veröffentlichung geprüft."
        actions={<Badge tone={review.tone}>{review.label}</Badge>}
      />
      {profile.reviewStatus === "changes_requested" && profile.reviewNote ? (
        <Alert tone="danger" title="Änderungen erforderlich">{profile.reviewNote}</Alert>
      ) : null}
      {profile.reviewStatus === "pending_review" ? <Alert tone="info" title="Dein Profil wird geprüft">Bis zur Freigabe ist es nicht öffentlich sichtbar.</Alert> : null}

      <Card>
        <CardHeader title="Profiltexte" description="Keine Kontaktdaten, Links zu externen Zahlungswegen oder Hinweise auf Minderjährige." />
        <CardBody>
          <ActionForm action={updateProfileAction} submitLabel="Profil speichern">
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="displayName" label="Anzeigename">
                <Input id="displayName" name="displayName" defaultValue={profile.displayName} required minLength={2} maxLength={40} />
              </Field>
              <Field id="tagline" label="Kurzbeschreibung" hint="Max. 120 Zeichen – erscheint auf deiner Karte.">
                <Input id="tagline" name="tagline" defaultValue={profile.tagline} maxLength={120} />
              </Field>
            </div>
            <Field id="bio" label="Über mich" hint="Max. 2000 Zeichen.">
              <Textarea id="bio" name="bio" defaultValue={profile.bio} maxLength={2000} rows={6} />
            </Field>
            <Field id="contactRules" label="Regeln für die Kontaktaufnahme" hint="Was ist dir wichtig? Grenzen, Umgangsformen, Wünsche.">
              <Textarea id="contactRules" name="contactRules" defaultValue={profile.contactRules} maxLength={1000} rows={3} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-800">Sprachen (max. 6)</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {LANGUAGES.map((l) => (
                  <Checkbox key={l.code} id={`lang-${l.code}`} name="languages" value={l.code} defaultChecked={profile.languages.includes(l.code)}>
                    {l.label}
                  </Checkbox>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-800">Themen (max. 6)</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TAGS.map((t) => (
                  <Checkbox key={t.code} id={`tag-${t.code}`} name="tags" value={t.code} defaultChecked={profile.tags.includes(t.code)}>
                    {t.label}
                  </Checkbox>
                ))}
              </div>
            </fieldset>
            <Checkbox id="allowSearchIndexing" name="allowSearchIndexing" defaultChecked={profile.allowSearchIndexing}>
              Mein Profil darf von Suchmaschinen gefunden werden (Standard: aus).
            </Checkbox>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Profilbild" description={`JPEG, PNG oder WebP, max. ${uploads.maxBytes / 1024 / 1024} MB. Metadaten (z. B. Standort) werden automatisch entfernt.`} />
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative">
            <Avatar name={profile.displayName} mediaId={avatar?.id ?? null} size="xl" rounded="2xl" />
            {avatar ? <Badge tone={moderationBadge[avatar.moderationStatus].tone} className="absolute -bottom-2 left-2">{moderationBadge[avatar.moderationStatus].label}</Badge> : null}
          </div>
          <ActionForm action={uploadImageAction} submitLabel="Hochladen" submitVariant="outline" submitIcon={<Upload className="size-4" aria-hidden="true" />} resetOnSuccess className="flex-1">
            <input type="hidden" name="kind" value="avatar" />
            <Input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700" />
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Galerie" description={`Bis zu ${uploads.maxGalleryImages} Bilder. Nur freigegebene Bilder sind öffentlich sichtbar.`} />
        <CardBody className="space-y-5">
          {gallery.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {gallery.map((m) => (
                <li key={m.id} className="space-y-2">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-brand-50">
                    <Image src={`/media/${m.id}`} alt="Galeriebild" fill sizes="200px" className="object-cover" unoptimized />
                    <Badge tone={moderationBadge[m.moderationStatus].tone} className="absolute top-2 left-2">{moderationBadge[m.moderationStatus].label}</Badge>
                  </div>
                  <ActionForm action={deleteImageAction} className="space-y-0" submitLabel="Löschen" submitVariant="ghost" submitSize="sm" submitIcon={<Trash2 className="size-4" aria-hidden="true" />}>
                    <input type="hidden" name="mediaId" value={m.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Noch keine Galeriebilder.</p>
          )}
          {gallery.length < uploads.maxGalleryImages ? (
            <ActionForm action={uploadImageAction} submitLabel="Bild hinzufügen" submitVariant="outline" submitIcon={<Upload className="size-4" aria-hidden="true" />} resetOnSuccess>
              <input type="hidden" name="kind" value="gallery" />
              <Input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700" />
            </ActionForm>
          ) : null}
        </CardBody>
      </Card>

      {canSubmit ? (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Bereit zur Prüfung?</p>
              <p className="text-sm text-ink-600">Nach dem Einreichen prüft das Team dein Profil. Du wirst benachrichtigt.</p>
            </div>
            <ActionForm action={submitForReviewAction} submitLabel="Zur Prüfung einreichen" submitIcon={<Send className="size-4" aria-hidden="true" />} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
