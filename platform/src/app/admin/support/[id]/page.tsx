import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { replyTicketAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { maskEmail } from "@/server/admin/service";
import { getTicketForAdmin } from "@/server/support/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { supportCategoryLabel, ticketStatus } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support-Anfrage" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/support/${id}`);
  const data = await getTicketForAdmin(id);
  if (!data) notFound();
  const st = ticketStatus[data.ticket.status]!;
  return (
    <>
      <Link href="/admin/support" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Alle Anfragen
      </Link>
      <Card>
        <CardHeader
          title={data.ticket.subject}
          description={`${supportCategoryLabel[data.ticket.category]} · von ${data.username ?? (data.ticket.contactEmail ? `Gast (${maskEmail(data.ticket.contactEmail)})` : "–")}`}
          action={<Badge tone={st.tone}>{st.label}</Badge>}
        />
        <CardBody className="space-y-3">
          {data.messages.map(({ message, authorName }) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                message.isInternalNote ? "border border-dashed border-warning-600/50 bg-warning-50" : message.isStaff ? "ml-auto bg-brand-50" : "bg-ink-100",
              )}
            >
              <p className="mb-1 text-xs font-semibold text-ink-600">
                {message.isInternalNote ? "Interne Notiz · " : ""}
                {authorName ?? "Gast"} · {formatDateTime(message.createdAt)}
              </p>
              <p className="whitespace-pre-line">{message.body}</p>
            </div>
          ))}
        </CardBody>
      </Card>
      {!data.ticket.userId ? (
        <Alert tone="warning" title="Gast-Anfrage">Antworten erscheinen nicht automatisch beim Gast – es ist noch kein E-Mail-Versand aktiv.</Alert>
      ) : null}
      <Card>
        <CardHeader title="Antworten" />
        <CardBody>
          <ActionForm action={replyTicketAction} submitLabel="Speichern" resetOnSuccess>
            <input type="hidden" name="ticketId" value={data.ticket.id} />
            <Field id="ticket-body" label="Nachricht">
              <Textarea id="ticket-body" name="body" required rows={4} maxLength={5000} />
            </Field>
            <div className="flex flex-wrap items-center gap-6">
              <Checkbox id="ticket-internal" name="internal">
                Interne Notiz (für Nutzer unsichtbar)
              </Checkbox>
              <label className="flex items-center gap-2 text-sm">
                Status
                <Select name="status" defaultValue="waiting_for_user" className="h-9 w-48">
                  <option value="waiting_for_user">Antwort gesendet</option>
                  <option value="open">Offen</option>
                  <option value="closed">Geschlossen</option>
                </Select>
              </label>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
