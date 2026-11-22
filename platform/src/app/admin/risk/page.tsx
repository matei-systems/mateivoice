import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { reviewRiskEventAction } from "@/actions/finance";
import { requireStaff } from "@/server/auth/current";
import { listRiskEvents, RISK_LABELS, type RiskKind } from "@/server/risk/service";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { riskSeverityLabel, riskStatusLabel } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Risikosignale" };

export default async function AdminRiskPage({ searchParams }: PageProps<"/admin/risk">) {
  await requireStaff("admin.risk.review", "/admin/risk");
  const params = await searchParams;
  const status = params.status === "all" ? undefined : params.status === "reviewed" || params.status === "dismissed" ? params.status : "open";
  const events = await listRiskEvents(status ? { status } : {});
  return (
    <>
      <PageHeader
        eyebrow="Betrugsprävention"
        title="Risikosignale"
        description="Regelbasierte Hinweise auf ungewöhnliche Zahlungen, Rückbuchungen, Trinkgeld-Häufungen und Auszahlungsänderungen. Signale sperren nichts automatisch – Entscheidungen trifft ein Mensch und dokumentiert sie."
      />
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        {[
          { value: "open", label: "Offen" },
          { value: "reviewed", label: "Geprüft" },
          { value: "dismissed", label: "Verworfen" },
          { value: "all", label: "Alle" },
        ].map((f) => (
          <Link
            key={f.value}
            href={`/admin/risk?status=${f.value}`}
            className={cn("rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset", (status ?? "all") === f.value ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-700 ring-line hover:bg-brand-50")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <Card>
          <EmptyState icon={<ShieldAlert className="size-6" aria-hidden="true" />} title="Keine Signale" description="Für diesen Filter liegen keine Risikosignale vor." />
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const severity = riskSeverityLabel[event.severity]!;
            const st = riskStatusLabel[event.status]!;
            return (
              <Card key={event.id}>
                <CardHeader
                  title={RISK_LABELS[event.kind as RiskKind] ?? event.kind}
                  description={`${formatDateTime(event.createdAt)} · ${event.username ? `Konto: ${event.username}` : "kein Konto zugeordnet"}`}
                  action={
                    <span className="flex gap-1.5">
                      <Badge tone={severity.tone}>{severity.label}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </span>
                  }
                />
                <div className="space-y-4 px-5 py-4 sm:px-6">
                  <pre className="overflow-x-auto rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-700">{JSON.stringify(event.details, null, 2)}</pre>
                  {event.userId ? (
                    <Link href={`/admin/users/${event.userId}`} className="text-sm font-medium text-brand-700 hover:underline">
                      Konto öffnen
                    </Link>
                  ) : null}
                  {event.status === "open" ? (
                    <ActionForm action={reviewRiskEventAction} submitLabel="Entscheidung speichern" submitSize="sm" className="grid gap-3 space-y-0 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                      <input type="hidden" name="riskEventId" value={event.id} />
                      <Field id={`note-${event.id}`} label="Prüfnotiz">
                        <Input id={`note-${event.id}`} name="note" required minLength={10} placeholder="z. B. Rücksprache gehalten, unauffällig" />
                      </Field>
                      <Field id={`decision-${event.id}`} label="Ergebnis">
                        <Select id={`decision-${event.id}`} name="decision" defaultValue="reviewed">
                          <option value="reviewed">Geprüft</option>
                          <option value="dismissed">Verworfen (Fehlalarm)</option>
                        </Select>
                      </Field>
                    </ActionForm>
                  ) : event.reviewNote ? (
                    <p className="text-sm text-ink-600">Notiz: {event.reviewNote}</p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
