import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { ArrowLeft, Coins, Eye, Gavel } from "lucide-react";
import { isTestMode } from "@/config/env";
import { adjustBalanceAction, createSanctionAction, liftSanctionAction, revealEmailAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { getUserForAdmin } from "@/server/admin/service";
import { getBalance } from "@/server/ledger/service";
import { listSanctionsForUser } from "@/server/moderation/service";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CoinAmount } from "@/components/ui/coins";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { roleLabel, sanctionKindLabel, userStatusLabel } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Nutzerdetails" };

export default async function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  await requireAdmin(`/admin/users/${id}`);
  const user = await getUserForAdmin(id);
  if (!user) notFound();
  const [sanctions, balance] = await Promise.all([
    listSanctionsForUser(user.id),
    user.role === "customer" ? getBalance(user.id, "customer_wallet") : Promise.resolve(null),
  ]);
  const status = userStatusLabel[user.status]!;
  const reportId = typeof query.reportId === "string" ? query.reportId : "";

  return (
    <>
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Alle Nutzer
      </Link>
      <PageHeader title={user.username} eyebrow={roleLabel[user.role]} actions={<Badge tone={status.tone}>{status.label}</Badge>} />
      <Card>
        <CardHeader
          title="Konto"
          action={
            <Dialog trigger="E-Mail anzeigen" triggerSize="sm" triggerIcon={<Eye className="size-4" aria-hidden="true" />} title="E-Mail-Adresse anzeigen" description="Der Zugriff wird mit Begründung im Audit-Protokoll gespeichert.">
              <ActionForm action={revealEmailAction} submitLabel="Anzeigen" inlineSuccess>
                <input type="hidden" name="userId" value={user.id} />
                <Field id="reveal-reason" label="Begründung">
                  <Textarea id="reveal-reason" name="reason" required minLength={10} rows={2} />
                </Field>
              </ActionForm>
            </Dialog>
          }
        />
        <CardBody>
          <DescriptionList
            items={[
              { term: "E-Mail (maskiert)", detail: user.maskedEmail },
              { term: "E-Mail bestätigt", detail: user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : "nein" },
              { term: "2FA", detail: user.totpEnabledAt ? "aktiv" : "nicht aktiv" },
              { term: "Selbstauskunft 18+", detail: formatDateTime(user.adultSelfDeclaredAt) },
              { term: "Registriert", detail: formatDate(user.createdAt) },
              { term: "Letzter Login", detail: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "–" },
              { term: "Testkonto", detail: user.isTestAccount ? "ja" : "nein" },
            ]}
          />
        </CardBody>
      </Card>

      {balance !== null ? (
        <Card>
          <CardHeader title="Testguthaben" action={<CoinAmount amount={balance} />} />
          {isTestMode() ? (
            <CardBody>
              <ActionForm action={adjustBalanceAction} submitLabel="Korrektur buchen" submitVariant="outline" submitIcon={<Coins className="size-4" aria-hidden="true" />} resetOnSuccess>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="requestId" value={randomUUID()} />
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field id="adj-amount" label="Betrag (±)">
                    <Input id="adj-amount" name="amount" type="number" step={1} required />
                  </Field>
                  <Field id="adj-reason" label="Begründung (Pflicht, wird protokolliert)">
                    <Input id="adj-reason" name="reason" required minLength={10} />
                  </Field>
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Maßnahmen"
          action={
            user.role !== "admin" && user.status !== "deleted" ? (
              <Dialog trigger="Maßnahme ergreifen" triggerSize="sm" triggerVariant="danger" triggerIcon={<Gavel className="size-4" aria-hidden="true" />} title="Maßnahme ergreifen" description="Die betroffene Person wird mit Begründung informiert und kann Einspruch einlegen.">
                <ActionForm action={createSanctionAction} submitLabel="Maßnahme speichern" submitVariant="danger">
                  <input type="hidden" name="userId" value={user.id} />
                  {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
                  <Field id="sanction-kind" label="Art">
                    <Select id="sanction-kind" name="kind" required defaultValue="warning">
                      <option value="warning">Verwarnung</option>
                      <option value="suspension">Sperre (Konto)</option>
                      {user.role === "creator" ? <option value="profile_hidden">Profil ausblenden</option> : null}
                    </Select>
                  </Field>
                  <Field id="sanction-duration" label="Dauer in Tagen" hint="Leer lassen = unbefristet bis zur Aufhebung." optional>
                    <Input id="sanction-duration" name="durationDays" type="number" min={1} max={3650} />
                  </Field>
                  <Field id="sanction-reason" label="Begründung (wird der Person angezeigt)">
                    <Textarea id="sanction-reason" name="reason" required minLength={10} rows={3} />
                  </Field>
                </ActionForm>
              </Dialog>
            ) : null
          }
        />
        <CardBody>
          {sanctions.length ? (
            <ul className="divide-y divide-line">
              {sanctions.map(({ sanction, appealStatus }) => (
                <li key={sanction.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-semibold">
                      {sanctionKindLabel[sanction.kind]} · {formatDateTime(sanction.createdAt)}
                      {sanction.liftedAt ? <Badge tone="success" className="ml-2">aufgehoben</Badge> : null}
                      {appealStatus ? <Badge tone="info" className="ml-2">Einspruch: {appealStatus}</Badge> : null}
                    </p>
                    <p className="text-ink-600">{sanction.reason}</p>
                  </div>
                  {!sanction.liftedAt ? (
                    <ConfirmActionDialog
                      trigger="Aufheben"
                      title="Maßnahme aufheben"
                      confirmLabel="Aufheben"
                      action={liftSanctionAction}
                      hiddenFields={{ sanctionId: sanction.id }}
                      reasonLabel="Begründung"
                      reasonRequired
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Keine Maßnahmen.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
