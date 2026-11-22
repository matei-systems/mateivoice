import type { Metadata } from "next";
import { changeStaffRoleAction, inviteStaffAction, setStaffActiveAction } from "@/actions/staff";
import { requireStaff } from "@/server/auth/current";
import { ROLE_LABELS, STAFF_ROLES } from "@/server/auth/permissions";
import { listStaff } from "@/server/staff/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { userStatusLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Mitarbeiter" };

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Gesamtverantwortung: Einstellungen, Mitarbeiter, alle Bereiche.",
  moderator: "Profilprüfung, Meldungen, Maßnahmen, Chat-/Stream-Moderation, Beweissicherung.",
  support: "Support-Anfragen, Datenschutzanfragen, Einsicht in Kontaktdaten (mit Begründung).",
  finance: "Bestellungen, Erstattungen, Auszahlungen, Finanzberichte, Risikosignale, Pakete.",
};

export default async function AdminStaffPage() {
  const session = await requireStaff("admin.staff.manage", "/admin/staff");
  const staff = await listStaff();
  return (
    <>
      <PageHeader eyebrow="Zugriff" title="Mitarbeiter" description="Jede Person hat ein eigenes Konto mit Passwort und verpflichtender Zwei-Faktor-Anmeldung. Keine geteilten Zugänge." />
      <Card>
        <CardHeader title="Rollen (minimale Rechte)" />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2">
            {STAFF_ROLES.map((role) => (
              <li key={role} className="rounded-xl border border-line bg-surface-2 p-4">
                <p className="font-medium text-ink-950">{ROLE_LABELS[role]}</p>
                <p className="mt-1 text-sm text-ink-600">{ROLE_DESCRIPTIONS[role]}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Konten" />
        <Table>
          <THead>
            <tr>
              <TH>Nutzername</TH>
              <TH>Rolle</TH>
              <TH>Status</TH>
              <TH>Letzter Login</TH>
              <TH className="text-right">Aktionen</TH>
            </tr>
          </THead>
          <TBody>
            {staff.map((member) => {
              const status = userStatusLabel[member.status]!;
              const self = member.id === session.user.id;
              return (
                <TR key={member.id}>
                  <TD className="font-medium">
                    {member.username} {self ? <Badge tone="brand">du</Badge> : null}
                  </TD>
                  <TD>{ROLE_LABELS[member.role]}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {member.invitePending ? <Badge tone="warning">Einladung offen</Badge> : null}
                      {member.mfa ? <Badge tone="success">2FA</Badge> : <Badge tone="warning">2FA fehlt</Badge>}
                    </span>
                  </TD>
                  <TD className="text-ink-600">{member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "–"}</TD>
                  <TD>
                    {self ? null : (
                      <div className="flex justify-end gap-1.5">
                        <ConfirmActionDialog trigger="Rolle ändern" title={`Rolle von ${member.username} ändern`} description="Bestehende Anmeldungen der Person werden beendet." confirmLabel="Ändern" action={changeStaffRoleAction} hiddenFields={{ userId: member.id }} reasonLabel="Begründung" reasonRequired>
                          <Field id={`role-${member.id}`} label="Neue Rolle">
                            <Select id={`role-${member.id}`} name="role" defaultValue={member.role}>
                              {STAFF_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </ConfirmActionDialog>
                        {member.status === "active" ? (
                          <ConfirmActionDialog trigger="Deaktivieren" title={`${member.username} deaktivieren`} description="Alle Anmeldungen werden sofort beendet." confirmLabel="Deaktivieren" variant="danger" action={setStaffActiveAction} hiddenFields={{ userId: member.id, active: "false" }} reasonLabel="Begründung" reasonRequired />
                        ) : (
                          <ConfirmActionDialog trigger="Reaktivieren" title={`${member.username} reaktivieren`} confirmLabel="Reaktivieren" action={setStaffActiveAction} hiddenFields={{ userId: member.id, active: "true" }} reasonLabel="Begründung" reasonRequired />
                        )}
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Person einladen" description="Die Einladung ist 72 Stunden gültig. Die Person legt ein eigenes Passwort fest und muss beim ersten Login 2FA einrichten." />
        <CardBody className="space-y-4">
          <Alert tone="info">Im Testmodus landet die Einladung in der Entwicklungs-Mailbox – es wird keine E-Mail versendet.</Alert>
          <ActionForm action={inviteStaffAction} submitLabel="Einladung senden" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="invite-email" label="E-Mail-Adresse">
                <Input id="invite-email" name="email" type="email" required autoComplete="off" />
              </Field>
              <Field id="invite-username" label="Nutzername">
                <Input id="invite-username" name="username" required pattern="[A-Za-z0-9_.\-]{3,24}" autoComplete="off" />
              </Field>
              <Field id="invite-role" label="Rolle">
                <Select id="invite-role" name="role" defaultValue="moderator">
                  {STAFF_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
