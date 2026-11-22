import type { Metadata } from "next";
import { CheckCircle2, FileSignature } from "lucide-react";
import { acceptDeclarationsAction } from "@/actions/social";
import { requireRole } from "@/server/auth/current";
import { DECLARATION_VERSION, DECLARATIONS, getAcceptedDeclarations } from "@/server/compliance/declarations";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Erklärungen" };

export default async function StudioDeclarationsPage() {
  const session = await requireRole(["creator"], "/studio/declarations");
  const accepted = await getAcceptedDeclarations(session.user.id);
  const complete = DECLARATIONS.every((d) => accepted.has(d.kind));
  return (
    <>
      <PageHeader eyebrow="Einwilligung & Rechte" title="Pflichterklärungen" description={`Ohne vollständige Erklärungen wird dein Profil nicht veröffentlicht. Fassung ${DECLARATION_VERSION} – jede Bestätigung wird mit Zeitpunkt gespeichert und kann nicht nachträglich verändert werden.`} />
      <Alert tone="info" title="Entwurf">Die Texte sind Entwürfe und werden vor dem Start rechtlich geprüft. Bei einer neuen Fassung musst du erneut bestätigen.</Alert>
      {complete ? (
        <Card>
          <CardHeader title="Alle Erklärungen abgegeben" action={<CheckCircle2 className="size-6 text-success-600" aria-hidden="true" />} />
          <CardBody>
            <ul className="space-y-3">
              {DECLARATIONS.map((d) => (
                <li key={d.kind} className="rounded-xl border border-line bg-surface-2 p-4">
                  <p className="font-medium text-ink-950">{d.title}</p>
                  <p className="mt-1 text-sm text-ink-700">{d.text}</p>
                  <p className="mt-2 text-xs text-ink-500">Bestätigt am {formatDateTime(accepted.get(d.kind)!)}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Bitte lesen und bestätigen" action={<FileSignature className="size-6 text-brand-700" aria-hidden="true" />} />
          <CardBody>
            <ActionForm action={acceptDeclarationsAction} submitLabel="Erklärungen verbindlich abgeben">
              <ul className="space-y-4">
                {DECLARATIONS.map((d) => (
                  <li key={d.kind} className="rounded-xl border border-line bg-surface-2 p-4">
                    <Checkbox id={`decl-${d.kind}`} name="declarations" value={d.kind} required defaultChecked={accepted.has(d.kind)}>
                      <span className="font-medium text-ink-950">{d.title}</span>
                      <span className="mt-1 block text-ink-700">{d.text}</span>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </>
  );
}
