import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updateReportAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { getReport, resolveReportTargetUser } from "@/server/moderation/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { reportCategoryLabel, reportPriority, reportStatus } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Meldung" };

export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/reports/${id}`);
  const data = await getReport(id);
  if (!data) notFound();
  const { report } = data;
  const targetUserId = await resolveReportTargetUser(report.targetType, report.targetId);
  const priority = reportPriority[report.priority]!;
  const status = reportStatus[report.status]!;
  const targetLink =
    report.targetType === "creator_profile" ? `/admin/creators/${report.targetId}` : report.targetType === "video_session" ? `/sessions/${report.targetId}` : null;

  return (
    <>
      <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Alle Meldungen
      </Link>
      <PageHeader eyebrow="Meldung" title={reportCategoryLabel[report.category] ?? report.category} actions={<><Badge tone={priority.tone}>{priority.label}</Badge><Badge tone={status.tone}>{status.label}</Badge></>} />
      {report.priority === "critical" ? (
        <Alert tone="danger" title="Kritische Meldung">
          Bei konkretem Verdacht auf Minderjährige oder strafbare Inhalte: betroffene Inhalte/Konten sofort sperren, Beweise sichern und die rechtlich
          vorgesehenen Meldewege nutzen (Prozess rechtlich abzustimmen, siehe Dokumentation).
        </Alert>
      ) : null}
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <DescriptionList
            items={[
              { term: "Eingang", detail: formatDateTime(report.createdAt) },
              { term: "Gemeldet von", detail: data.reporterName ?? "–" },
              { term: "Ziel", detail: <span>{report.targetType} {targetLink ? <Link href={targetLink} className="ml-2 text-brand-700 hover:underline">öffnen</Link> : null}</span> },
              { term: "Beschreibung", detail: <span className="whitespace-pre-line">{report.description}</span> },
              { term: "Bisherige Notiz", detail: report.resolutionNote ?? "–" },
            ]}
          />
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bearbeitung" description="Jede Statusänderung wird mit Begründung protokolliert." />
          <CardBody>
            <ActionForm action={updateReportAction} submitLabel="Speichern">
              <input type="hidden" name="reportId" value={report.id} />
              <Field id="report-status" label="Neuer Status">
                <Select id="report-status" name="status" defaultValue="in_review">
                  <option value="in_review">In Bearbeitung</option>
                  <option value="action_taken">Maßnahme ergriffen</option>
                  <option value="no_action">Kein Verstoß</option>
                  <option value="dismissed">Verworfen</option>
                </Select>
              </Field>
              <Field id="report-reason" label="Begründung / Notiz" hint="Pflicht beim Abschluss (mind. 10 Zeichen).">
                <Textarea id="report-reason" name="reason" rows={3} />
              </Field>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Maßnahme gegen Konto" description="Sperre, Verwarnung oder Profil ausblenden – mit Verknüpfung zu dieser Meldung." />
          <CardBody>
            {targetUserId ? (
              <ButtonLink href={`/admin/users/${targetUserId}?reportId=${report.id}`} variant="danger">
                Zum betroffenen Konto
              </ButtonLink>
            ) : (
              <p className="text-sm text-ink-600">Kein zugeordnetes Konto gefunden.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
