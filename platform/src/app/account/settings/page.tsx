import type { Metadata } from "next";
import { Download, Trash2 } from "lucide-react";
import { deleteAccountAction, updatePreferencesAction, updateUsernameAction } from "@/actions/account";
import { requireSession } from "@/server/auth/current";
import { getAccount } from "@/server/auth/service";
import { getNotificationPreferences } from "@/server/notifications/service";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { roleLabel } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const session = await requireSession("/account/settings");
  const [account, prefs] = await Promise.all([getAccount(session.user.id), getNotificationPreferences(session.user.id)]);
  if (!account) return null;

  return (
    <>
      <PageHeader eyebrow="Konto" title="Einstellungen" description="Profil, Benachrichtigungen und Datenschutz." />

      <Card>
        <CardHeader title="Konto" />
        <CardBody className="space-y-6">
          <DescriptionList
            items={[
              { term: "E-Mail-Adresse", detail: <span className="flex flex-wrap items-center gap-2">{account.email} {account.emailVerifiedAt ? <Badge tone="success">bestätigt</Badge> : <Badge tone="warning">nicht bestätigt</Badge>}</span> },
              { term: "Kontoart", detail: roleLabel[account.role] },
              { term: "Mitglied seit", detail: formatDate(account.createdAt) },
            ]}
          />
          <ActionForm action={updateUsernameAction} submitLabel="Nutzernamen speichern" submitVariant="outline" className="max-w-md">
            <Field id="username" label="Nutzername" hint="Wird anderen angezeigt. Bitte keinen Klarnamen verwenden.">
              <Input id="username" name="username" defaultValue={account.username} required minLength={3} maxLength={24} />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Benachrichtigungen" description="Aktuell werden nur In-App-Benachrichtigungen angezeigt. E-Mail-Versand ist noch nicht aktiv; deine Auswahl wird gespeichert." />
        <CardBody>
          <ActionForm action={updatePreferencesAction} submitLabel="Einstellungen speichern" submitVariant="outline">
            <Checkbox id="inAppSessionUpdates" name="inAppSessionUpdates" defaultChecked={prefs.inAppSessionUpdates}>
              In-App-Hinweise zu Sitzungen (Anfragen, Annahme, Ende)
            </Checkbox>
            <Checkbox id="emailSessionUpdates" name="emailSessionUpdates" defaultChecked={prefs.emailSessionUpdates}>
              E-Mails zu Sitzungen (sobald verfügbar)
            </Checkbox>
            <Checkbox id="emailMarketing" name="emailMarketing" defaultChecked={prefs.emailMarketing}>
              Neuigkeiten und Angebote per E-Mail (freiwillig, jederzeit widerrufbar)
            </Checkbox>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Datenschutz" description="Deine Rechte nach DSGVO – direkt im Konto." />
        <CardBody className="flex flex-wrap gap-3">
          <a
            href="/account/export"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-surface px-5 text-sm font-medium text-ink-800 ring-1 ring-line-strong ring-inset transition hover:bg-brand-25"
          >
            <Download className="size-4" aria-hidden="true" /> Meine Daten exportieren (JSON)
          </a>
          {account.role !== "admin" ? (
            <Dialog
              trigger="Konto löschen"
              triggerVariant="danger"
              triggerIcon={<Trash2 className="size-4" aria-hidden="true" />}
              title="Konto endgültig löschen?"
              description="Personenbezogene Daten werden entfernt bzw. anonymisiert. Buchungsdaten bleiben pseudonymisiert erhalten, soweit Aufbewahrungspflichten bestehen können. Testguthaben verfällt."
            >
              <ActionForm action={deleteAccountAction} submitLabel="Konto endgültig löschen" submitVariant="danger">
                <Field id="delete-password" label="Passwort zur Bestätigung">
                  <Input id="delete-password" name="password" type="password" autoComplete="current-password" required />
                </Field>
                <Field id="delete-confirmation" label="Gib LÖSCHEN ein">
                  <Input id="delete-confirmation" name="confirmation" required autoComplete="off" />
                </Field>
              </ActionForm>
            </Dialog>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
