import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/current";
import { listTicketsForAdmin } from "@/server/support/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { supportCategoryLabel, ticketStatus } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

const filters = [
  { value: "active", label: "Aktiv" },
  { value: "closed", label: "Geschlossen" },
] as const;

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requireAdmin("/admin/support");
  const params = await searchParams;
  const status = params.status === "closed" ? "closed" : "active";
  const tickets = await listTicketsForAdmin(status);
  return (
    <>
      <PageHeader eyebrow="Support" title="Support-Anfragen" description="Gäste-Anfragen enthalten eine Kontaktadresse; E-Mail-Antworten sind noch nicht automatisiert." />
      <div className="flex gap-2">
        {filters.map((f) => (
          <Link key={f.value} href={`/admin/support?status=${f.value}`} className={cn("rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset", status === f.value ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-700 ring-line hover:bg-brand-50")}>
            {f.label}
          </Link>
        ))}
      </div>
      {tickets.length ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Betreff</TH>
                <TH>Thema</TH>
                <TH>Von</TH>
                <TH>Status</TH>
                <TH>Aktualisiert</TH>
              </tr>
            </THead>
            <TBody>
              {tickets.map((t) => {
                const st = ticketStatus[t.status]!;
                return (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/admin/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                        {t.subject}
                      </Link>
                    </TD>
                    <TD>{supportCategoryLabel[t.category]}</TD>
                    <TD className="text-ink-600">{t.username ?? (t.isGuest ? "Gast" : "–")}</TD>
                    <TD>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </TD>
                    <TD className="text-ink-600">{formatDateTime(t.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : (
        <EmptyState title="Keine Anfragen" description="Hier gibt es gerade nichts zu tun." />
      )}
    </>
  );
}
