import type { Metadata } from "next";
import { Download, UserX } from "lucide-react";
import { unblockUserAction } from "@/actions/social";
import { requireSession } from "@/server/auth/current";
import { deletionBlockers } from "@/server/compliance/privacy";
import { listBlockedUsers } from "@/server/social/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Privatsphäre & Daten" };

export default async function PrivacyPage() {
  const session = await requireSession("/account/privacy");
  const [blocked, blockers] = await Promise.all([listBlockedUsers(session.user.id), deletionBlockers(session.user.id)]);
  return (
    <>
      <PageHeader eyebrow="Datenschutz" title="Privatsphäre & Daten" description="Blockierte Konten, Datenexport und Hinweise zur Löschung. Benachrichtigungen und Marketing-Einwilligung verwaltest du unter „Benachrichtigungen“." />
      <Card>
        <CardHeader title="Blockierte Konten" description="Blockieren wirkt in beide Richtungen: keine Nachrichten, Anfragen oder Trinkgelder. Die blockierte Person wird nicht benachrichtigt." />
        {blocked.length === 0 ? (
          <CardBody>
            <EmptyState icon={<UserX className="size-6" aria-hidden="true" />} title="Niemand blockiert" description="Du kannst Konten im Chat oder auf Profilen blockieren." />
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {blocked.map((entry) => (
              <li key={entry.userId} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                <div>
                  <p className="font-medium text-ink-900">{entry.username}</p>
                  <p className="text-xs text-ink-500">seit {formatDateTime(entry.createdAt)}</p>
                </div>
                <ActionForm action={unblockUserAction} submitLabel="Aufheben" submitSize="sm" submitVariant="outline" className="space-y-0">
                  <input type="hidden" name="userId" value={entry.userId} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Meine Daten herunterladen" description="Export aller zu deinem Konto gespeicherten Daten als JSON (Art. 15/20 DSGVO)." />
        <CardBody>
          <a href="/account/export" className={buttonClasses({ variant: "outline" })}>
            <Download className="size-4" aria-hidden="true" /> Datenexport herunterladen
          </a>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Konto löschen" description="Die Löschung findest du unter „Einstellungen“. Vorab geprüft:" />
        <CardBody className="space-y-3">
          {blockers.length === 0 ? (
            <Alert tone="success">Einer Löschung steht derzeit nichts entgegen.</Alert>
          ) : (
            blockers.map((blocker) => (
              <Alert key={blocker.code} tone="warning">
                {blocker.message}
              </Alert>
            ))
          )}
          <p className="text-xs leading-relaxed text-ink-500">
            Bei der Löschung werden Profil- und Kontaktdaten entfernt bzw. anonymisiert. Buchungs- und Abrechnungsdaten bleiben aufgrund gesetzlicher Aufbewahrungspflichten pseudonymisiert erhalten.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
