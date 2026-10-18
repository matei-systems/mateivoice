import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/current";
import { listAuditLogs } from "@/server/admin/service";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit-Protokoll" };

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("/admin/audit");
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const rows = await listAuditLogs(page);
  return (
    <>
      <PageHeader eyebrow="System" title="Audit-Protokoll" description="Unveränderliches Protokoll aller administrativen Änderungen (UPDATE/DELETE per Datenbank-Trigger gesperrt)." />
      {rows.length ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Zeitpunkt</TH>
                <TH>Admin</TH>
                <TH>Aktion</TH>
                <TH>Ziel</TH>
                <TH>Begründung</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-ink-600">{formatDateTime(row.createdAt)}</TD>
                  <TD>{row.actorName ?? "System"}</TD>
                  <TD>
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{row.action}</code>
                  </TD>
                  <TD className="text-xs text-ink-600">
                    {row.targetType ?? "–"}
                    {row.targetId ? <span className="block font-mono">{row.targetId.slice(0, 8)}…</span> : null}
                  </TD>
                  <TD className="max-w-sm text-ink-700">{row.reason ?? "–"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <EmptyState title="Noch keine Einträge" description="Sobald Admins Änderungen vornehmen, erscheinen sie hier." />
      )}
      <Pagination page={page} pageCount={rows.length === 100 ? page + 1 : page} hrefFor={(p) => `/admin/audit?page=${p}`} />
    </>
  );
}
