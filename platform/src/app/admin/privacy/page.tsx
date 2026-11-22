import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { recordPrivacyRequestAction, updatePrivacyRequestAction } from "@/actions/staff";
import { requireStaff } from "@/server/auth/current";
import { listPrivacyRequests } from "@/server/compliance/privacy";
import { getSettings } from "@/server/settings/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { privacyKindLabel, privacyStatusLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Datenschutz" };

export default async function AdminPrivacyPage() {
  await requireStaff("admin.privacy.manage", "/admin/privacy");
  const [requests, settings] = await Promise.all([listPrivacyRequests(), getSettings()]);
  return (
    <>
      <PageHeader eyebrow="Compliance" title="Datenschutzanfragen" description="Protokoll der Betroffenenrechte (Auskunft, Löschung, Berichtigung, Widerspruch). Export und Löschung erfolgen in der Regel als Selbstbedienung im Konto und werden hier automatisch protokolliert." />
      <Alert tone="info" title="Frist">Anfragen sind grundsätzlich innerhalb eines Monats zu beantworten (Art. 12 Abs. 3 DSGVO). Rechtliche Details: docs/LEGAL-DACH.md.</Alert>
      <Card>
        <CardHeader title="Aufbewahrungsfristen (aktuell)" description="Änderbar unter Einstellungen → Aufbewahrungsfristen." />
        <CardBody>
          <DescriptionList
            items={[
              { term: "Chatnachrichten", detail: `${settings.retention.chatMessagesDays} Tage (außer bei Beweissicherung oder offener Meldung)` },
              { term: "E-Mail-Protokoll", detail: `${settings.retention.emailOutboxDays} Tage` },
              { term: "Buchungen, Audit-Protokoll, Moderationsbegründungen", detail: "unveränderlich; Aufbewahrung gemäß gesetzlicher Pflichten (z. B. § 132 BAO)" },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Anfragen" />
        {requests.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-6" aria-hidden="true" />} title="Keine Anfragen" description="Bisher wurden keine Datenschutzanfragen protokolliert." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Eingang</TH>
                <TH>Konto</TH>
                <TH>Art</TH>
                <TH>Status</TH>
                <TH>Notiz</TH>
                <TH className="text-right">Aktion</TH>
              </tr>
            </THead>
            <TBody>
              {requests.map(({ request, username }) => {
                const status = privacyStatusLabel[request.status]!;
                const open = request.status === "received" || request.status === "on_hold";
                return (
                  <TR key={request.id}>
                    <TD className="whitespace-nowrap text-ink-600">{formatDateTime(request.createdAt)}</TD>
                    <TD>{username ?? "–"}</TD>
                    <TD>{privacyKindLabel[request.kind]}</TD>
                    <TD>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TD>
                    <TD className="max-w-xs text-xs whitespace-pre-line text-ink-600">{request.note ?? "–"}</TD>
                    <TD className="text-right">
                      {open ? (
                        <ConfirmActionDialog trigger="Bearbeiten" title="Anfrage bearbeiten" confirmLabel="Speichern" action={updatePrivacyRequestAction} hiddenFields={{ requestId: request.id }} reasonLabel="Bearbeitungsnotiz" reasonRequired>
                          <Field id={`status-${request.id}`} label="Neuer Status">
                            <Select id={`status-${request.id}`} name="status" defaultValue="completed">
                              <option value="completed">Erledigt</option>
                              <option value="on_hold">Zurückgestellt</option>
                              <option value="rejected">Abgelehnt (mit Begründung)</option>
                            </Select>
                          </Field>
                        </ConfirmActionDialog>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Anfrage erfassen" description="Für Anfragen per E-Mail, Post oder Support (z. B. Berichtigung, Widerspruch)." />
        <CardBody>
          <ActionForm action={recordPrivacyRequestAction} submitLabel="Erfassen" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="pr-username" label="Nutzername">
                <Input id="pr-username" name="username" required maxLength={24} />
              </Field>
              <Field id="pr-kind" label="Art">
                <Select id="pr-kind" name="kind" defaultValue="rectification">
                  {Object.entries(privacyKindLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field id="pr-note" label="Beschreibung">
              <Textarea id="pr-note" name="note" rows={2} required minLength={10} maxLength={2000} />
            </Field>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
