import type { Metadata } from "next";
import Link from "next/link";
import { Radio } from "lucide-react";
import { terminateStreamAction } from "@/actions/staff";
import { requireStaff } from "@/server/auth/current";
import { listOpenSessionsForStaff } from "@/server/admin/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/ui/confirm-form";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { sessionStatus } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Live & Sitzungen" };

export default async function AdminStreamsPage() {
  await requireStaff("admin.streams.manage", "/admin/streams");
  const sessions = await listOpenSessionsForStaff();
  return (
    <>
      <PageHeader
        eyebrow="Moderation"
        title="Live & Sitzungen"
        description="Laufende öffentliche Streams und private Sitzungen (nur Metadaten). Mitarbeiter treten Sitzungen nie unbemerkt bei. Beenden erfordert eine Begründung, die dem Creator mitgeteilt wird."
      />
      <Card>
        <CardHeader title="Offene und laufende Sitzungen" />
        {sessions.length === 0 ? (
          <EmptyState icon={<Radio className="size-6" aria-hidden="true" />} title="Keine laufenden Sitzungen" description="Aktuell ist niemand live oder in einem privaten Chat." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Creator</TH>
                <TH>Art</TH>
                <TH>Status</TH>
                <TH>Seit</TH>
                <TH className="text-right">Zuschauer</TH>
                <TH className="text-right">Aktion</TH>
              </tr>
            </THead>
            <TBody>
              {sessions.map((session) => {
                const status = sessionStatus[session.status]!;
                return (
                  <TR key={session.id}>
                    <TD>
                      <Link href={`/creators/${session.slug}`} className="font-medium text-brand-700 hover:underline">
                        {session.displayName}
                      </Link>
                      <p className="text-xs text-ink-500">{session.creatorUsername}</p>
                    </TD>
                    <TD>{session.kind === "public_stream" ? "Öffentlicher Stream" : "Privater Chat"}</TD>
                    <TD>
                      <Badge tone={status.tone}>{status.label}</Badge> {session.provider === "mock" ? <Badge tone="test">Mock</Badge> : null}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-600">{formatDateTime(session.startedAt ?? session.requestedAt)}</TD>
                    <TD className="text-right tabular-nums">{session.viewers}</TD>
                    <TD className="text-right">
                      <ConfirmActionDialog trigger="Beenden" title="Sitzung beenden" description="Die Sitzung wird sofort beendet. Die Begründung wird dem Creator mitgeteilt und unveränderlich gespeichert." confirmLabel="Beenden" variant="danger" action={terminateStreamAction} hiddenFields={{ sessionId: session.id }} reasonLabel="Begründung (für den Creator sichtbar)" reasonRequired>
                        <Field id={`rule-${session.id}`} label="Verletzte Regel (optional)" hint="z. B. Community-Richtlinien Abschnitt 2">
                          <Input id={`rule-${session.id}`} name="ruleReference" maxLength={120} />
                        </Field>
                      </ConfirmActionDialog>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
