import type { Metadata } from "next";
import Link from "next/link";
import { Flag, LifeBuoy, Scale } from "lucide-react";
import { appealAction } from "@/actions/reports";
import { requireSession } from "@/server/auth/current";
import { listReportsByUser, listSanctionsForUser } from "@/server/moderation/service";
import { listTicketsForUser } from "@/server/support/service";
import { SupportForm } from "@/components/support/support-form";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { reportCategoryLabel, reportStatus, sanctionKindLabel, supportCategoryLabel, ticketStatus } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support & Meldungen" };

export default async function AccountSupportPage() {
  const session = await requireSession("/account/support");
  const [tickets, reports, sanctions] = await Promise.all([
    listTicketsForUser(session.user.id),
    listReportsByUser(session.user.id),
    listSanctionsForUser(session.user.id),
  ]);

  return (
    <>
      <PageHeader eyebrow="Hilfe" title="Support & Meldungen" description="Deine Anfragen, Meldungen und – falls vorhanden – Maßnahmen mit Einspruchsmöglichkeit." />

      {sanctions.length > 0 ? (
        <Card>
          <CardHeader title="Maßnahmen gegen dein Konto" description="Jede Maßnahme ist begründet. Du kannst einmal pro Maßnahme Einspruch einlegen." />
          <CardBody>
            <ul className="divide-y divide-line">
              {sanctions.map(({ sanction, appealStatus }) => (
                <li key={sanction.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">
                      {sanctionKindLabel[sanction.kind]} · {formatDate(sanction.startsAt)}
                      {sanction.endsAt ? ` bis ${formatDate(sanction.endsAt)}` : ""}
                      {sanction.liftedAt ? <Badge tone="success" className="ml-2">aufgehoben</Badge> : null}
                    </p>
                    <p className="text-ink-700">Begründung: {sanction.reason}</p>
                    {appealStatus ? (
                      <p className="text-ink-600">Einspruch: {appealStatus === "open" ? "in Prüfung" : appealStatus === "overturned" ? "stattgegeben" : "abgelehnt"}</p>
                    ) : null}
                  </div>
                  {!appealStatus && !sanction.liftedAt ? (
                    <Dialog trigger="Einspruch einlegen" triggerSize="sm" triggerIcon={<Scale className="size-4" aria-hidden="true" />} title="Einspruch einlegen">
                      <ActionForm action={appealAction} submitLabel="Einspruch senden" inlineSuccess>
                        <input type="hidden" name="sanctionId" value={sanction.id} />
                        <Field id={`appeal-${sanction.id}`} label="Begründung" hint="Mindestens 20 Zeichen. Bitte sachlich beschreiben, warum die Maßnahme aus deiner Sicht falsch ist.">
                          <Textarea id={`appeal-${sanction.id}`} name="message" required minLength={20} maxLength={4000} rows={5} />
                        </Field>
                      </ActionForm>
                    </Dialog>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Meine Anfragen" />
          <CardBody>
            {tickets.length ? (
              <ul className="divide-y divide-line">
                {tickets.map((ticket) => {
                  const status = ticketStatus[ticket.status]!;
                  return (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/account/support/${ticket.id}`} className="block truncate font-medium text-ink-950 hover:text-brand-700">
                          {ticket.subject}
                        </Link>
                        <p className="text-xs text-ink-600">
                          {supportCategoryLabel[ticket.category]} · {formatDateTime(ticket.updatedAt)}
                        </p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <LifeBuoy className="size-4" aria-hidden="true" /> Noch keine Anfragen.
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Meine Meldungen" description="Meldungen werden vertraulich behandelt; Details zum Ergebnis teilen wir aus Datenschutzgründen nicht immer." />
          <CardBody>
            {reports.length ? (
              <ul className="divide-y divide-line">
                {reports.map((report) => {
                  const status = reportStatus[report.status]!;
                  return (
                    <li key={report.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-medium">{reportCategoryLabel[report.category]}</p>
                        <p className="text-xs text-ink-600">{formatDateTime(report.createdAt)}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <Flag className="size-4" aria-hidden="true" /> Keine Meldungen eingereicht.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Neue Anfrage" />
        <CardBody>
          <SupportForm signedIn />
        </CardBody>
      </Card>
    </>
  );
}
