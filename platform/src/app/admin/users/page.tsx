import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/server/auth/current";
import { listUsers } from "@/server/admin/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { roleLabel, userStatusLabel } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Nutzer" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin("/admin/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const role = params.role === "customer" || params.role === "creator" || params.role === "admin" ? params.role : undefined;
  const status = params.status === "active" || params.status === "suspended" || params.status === "deleted" ? params.status : undefined;
  const rows = await listUsers({ q, role, status });

  return (
    <>
      <PageHeader eyebrow="Administration" title="Nutzer" description="E-Mail-Adressen werden maskiert angezeigt. Die vollständige Adresse ist nur mit Begründung einsehbar (protokolliert)." />
      <form className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card sm:flex-row" method="get">
        <label className="relative flex-1">
          <span className="sr-only">Suche</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input name="q" defaultValue={q} placeholder="Nutzername oder E-Mail" className="pl-10" />
        </label>
        <Select name="role" defaultValue={role ?? ""} className="sm:w-40" aria-label="Rolle">
          <option value="">Alle Rollen</option>
          <option value="customer">Kunden</option>
          <option value="creator">Creator</option>
          <option value="admin">Admins</option>
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="sm:w-40" aria-label="Status">
          <option value="">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="suspended">Gesperrt</option>
          <option value="deleted">Gelöscht</option>
        </Select>
        <Button type="submit">Filtern</Button>
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Nutzer</TH>
              <TH>Rolle</TH>
              <TH>Status</TH>
              <TH>E-Mail</TH>
              <TH>Registriert</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((user) => {
              const st = userStatusLabel[user.status]!;
              return (
                <TR key={user.id}>
                  <TD>
                    <Link href={`/admin/users/${user.id}`} className="font-medium text-brand-700 hover:underline">
                      {user.username}
                    </Link>
                    {user.isTestAccount ? <Badge tone="test" className="ml-2">Test</Badge> : null}
                  </TD>
                  <TD>{roleLabel[user.role]}</TD>
                  <TD>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </TD>
                  <TD className="text-ink-600">
                    {user.maskedEmail} {user.emailVerifiedAt ? null : <Badge tone="warning" className="ml-1">unbestätigt</Badge>}
                  </TD>
                  <TD className="text-ink-600">{formatDate(user.createdAt)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="px-6 py-8 text-center text-sm text-ink-600">Keine Nutzer gefunden.</p> : null}
      </Card>
    </>
  );
}
