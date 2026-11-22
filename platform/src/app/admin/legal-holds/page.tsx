import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { createLegalHoldAction, releaseLegalHoldAction } from "@/actions/staff";
import { requireStaff } from "@/server/auth/current";
import { listLegalHolds } from "@/server/compliance/holds";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { holdTargetLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Beweissicherung" };

export default async function AdminLegalHoldsPage({ searchParams }: PageProps<"/admin/legal-holds">) {
  await requireStaff("admin.legal_holds.manage", "/admin/legal-holds");
  const params = await searchParams;
  const includeReleased = params.all === "1";
  const holds = await listLegalHolds({ includeReleased });
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Beweissicherung (Legal Hold)"
        description="Gesicherte Objekte werden von Lösch- und Aufbewahrungsjobs ausgenommen; betroffene Konten können sich nicht selbst löschen. Kritische Meldungen lösen automatisch eine Sicherung aus."
        actions={
          <a href={includeReleased ? "/admin/legal-holds" : "/admin/legal-holds?all=1"} className="text-sm font-medium text-brand-700 hover:underline">
            {includeReleased ? "Nur aktive anzeigen" : "Auch freigegebene anzeigen"}
          </a>
        }
      />
      <Card>
        <CardHeader title="Sicherungen" />
        {holds.length === 0 ? (
          <EmptyState icon={<Lock className="size-6" aria-hidden="true" />} title="Keine Beweissicherungen" description="Aktuell sind keine Objekte gesichert." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Seit</TH>
                <TH>Objekt</TH>
                <TH>Begründung</TH>
                <TH>Status</TH>
                <TH className="text-right">Aktion</TH>
              </tr>
            </THead>
            <TBody>
              {holds.map(({ hold, createdBy, targetUsername }) => (
                <TR key={hold.id}>
                  <TD className="whitespace-nowrap text-ink-600">{formatDateTime(hold.createdAt)}</TD>
                  <TD>
                    <span className="font-medium">{holdTargetLabel[hold.targetType] ?? hold.targetType}</span>
                    <p className="font-mono text-xs text-ink-500">{targetUsername ?? hold.targetId}</p>
                  </TD>
                  <TD className="max-w-sm text-ink-700">
                    {hold.reason}
                    <p className="text-xs text-ink-500">von {createdBy ?? "System"}</p>
                  </TD>
                  <TD>{hold.releasedAt ? <Badge tone="neutral">freigegeben {formatDateTime(hold.releasedAt)}</Badge> : <Badge tone="warning">aktiv</Badge>}</TD>
                  <TD className="text-right">
                    {hold.releasedAt ? null : (
                      <ConfirmActionDialog trigger="Freigeben" title="Beweissicherung freigeben" description="Danach greifen wieder die normalen Lösch- und Aufbewahrungsfristen." confirmLabel="Freigeben" action={releaseLegalHoldAction} hiddenFields={{ holdId: hold.id }} reasonLabel="Begründung" reasonRequired />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Neue Beweissicherung" description="z. B. bei behördlichen Anfragen oder laufenden Verfahren." />
        <CardBody>
          <ActionForm action={createLegalHoldAction} submitLabel="Sichern" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="hold-type" label="Objekttyp">
                <Select id="hold-type" name="targetType" defaultValue="user">
                  {Object.entries(holdTargetLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="hold-target" label="ID bzw. Nutzername (bei Konten)">
                <Input id="hold-target" name="targetId" required maxLength={64} />
              </Field>
            </div>
            <Field id="hold-reason" label="Begründung">
              <Textarea id="hold-reason" name="reason" rows={2} required minLength={10} maxLength={1000} />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
