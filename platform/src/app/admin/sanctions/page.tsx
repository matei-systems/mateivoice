import type { Metadata } from "next";
import Link from "next/link";
import { decideAppealAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { listOpenAppeals, listRecentSanctions } from "@/server/moderation/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { sanctionKindLabel } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Sanktionen & Einsprüche" };

export default async function AdminSanctionsPage() {
  await requireAdmin("/admin/sanctions");
  const [appeals, sanctions] = await Promise.all([listOpenAppeals(), listRecentSanctions()]);
  return (
    <>
      <PageHeader eyebrow="Moderation" title="Sanktionen & Einsprüche" description="Einsprüche werden begründet entschieden. Ein stattgegebener Einspruch hebt die Maßnahme auf." />
      <Card>
        <CardHeader title={`Offene Einsprüche (${appeals.length})`} />
        <CardBody>
          {appeals.length ? (
            <ul className="divide-y divide-line">
              {appeals.map(({ appeal, sanction, username }) => (
                <li key={appeal.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="text-sm">
                    <p className="font-semibold">
                      {username} · {sanctionKindLabel[sanction.kind]} vom {formatDate(sanction.createdAt)}
                    </p>
                    <p className="text-ink-600">Maßnahme: {sanction.reason}</p>
                    <p className="mt-2 rounded-xl bg-brand-25 p-3 whitespace-pre-line text-ink-800">{appeal.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmActionDialog trigger="Stattgeben" triggerVariant="primary" title="Einspruch stattgeben" confirmLabel="Stattgeben & aufheben" action={decideAppealAction} hiddenFields={{ appealId: appeal.id, decision: "overturned" }} reasonLabel="Begründung" reasonRequired />
                    <ConfirmActionDialog trigger="Ablehnen" title="Einspruch ablehnen" confirmLabel="Ablehnen" variant="danger" action={decideAppealAction} hiddenFields={{ appealId: appeal.id, decision: "upheld" }} reasonLabel="Begründung" reasonRequired />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Keine offenen Einsprüche.</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Letzte Maßnahmen" />
        <Table>
          <THead>
            <tr>
              <TH>Konto</TH>
              <TH>Art</TH>
              <TH>Begründung</TH>
              <TH>Zeitraum</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {sanctions.map(({ sanction, username }) => (
              <TR key={sanction.id}>
                <TD>
                  <Link href={`/admin/users/${sanction.userId}`} className="font-medium text-brand-700 hover:underline">
                    {username}
                  </Link>
                </TD>
                <TD>{sanctionKindLabel[sanction.kind]}</TD>
                <TD className="max-w-xs truncate text-ink-600" title={sanction.reason}>
                  {sanction.reason}
                </TD>
                <TD className="text-ink-600">
                  {formatDateTime(sanction.startsAt)}
                  {sanction.endsAt ? ` – ${formatDateTime(sanction.endsAt)}` : " – unbefristet"}
                </TD>
                <TD>{sanction.liftedAt ? <Badge tone="success">aufgehoben</Badge> : <Badge tone="danger">aktiv</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {sanctions.length === 0 ? <p className="px-6 py-8 text-center text-sm text-ink-600">Noch keine Maßnahmen.</p> : null}
      </Card>
    </>
  );
}
