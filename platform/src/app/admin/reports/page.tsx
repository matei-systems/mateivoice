import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/current";
import { listReports } from "@/server/moderation/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { reportCategoryLabel, reportPriority, reportStatus } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Meldungen" };

const tabs = [
  { value: "", label: "Offen & in Bearbeitung" },
  { value: "closed", label: "Abgeschlossen" },
];

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin("/admin/reports");
  const params = await searchParams;
  const filter = params.status === "closed" ? "closed" : undefined;
  const rows = await listReports({ status: filter });
  return (
    <>
      <PageHeader eyebrow="Moderation" title="Meldungen" description="Sortiert nach Priorität. Kritische Meldungen zuerst." />
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value ? `/admin/reports?status=${tab.value}` : "/admin/reports"}
            className={cn("rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset", (filter ?? "") === tab.value ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-700 ring-line hover:bg-brand-50")}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Priorität</TH>
                <TH>Kategorie</TH>
                <TH>Ziel</TH>
                <TH>Status</TH>
                <TH>Eingang</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const priority = reportPriority[row.priority]!;
                const status = reportStatus[row.status]!;
                return (
                  <TR key={row.id} className={row.priority === "critical" ? "bg-danger-50/60" : undefined}>
                    <TD>
                      <Badge tone={priority.tone}>{priority.label}</Badge>
                    </TD>
                    <TD>
                      <Link href={`/admin/reports/${row.id}`} className="font-medium text-brand-700 hover:underline">
                        {reportCategoryLabel[row.category]}
                      </Link>
                    </TD>
                    <TD className="text-ink-600">{row.targetType}</TD>
                    <TD>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TD>
                    <TD className="text-ink-600">{formatDateTime(row.createdAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : (
        <EmptyState title="Keine Meldungen" description="In dieser Ansicht gibt es derzeit keine Meldungen." />
      )}
    </>
  );
}
