import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supportReplyAction } from "@/actions/support";
import { requireSession } from "@/server/auth/current";
import { getTicketForUser } from "@/server/support/service";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { supportCategoryLabel, ticketStatus } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support-Anfrage" };

export default async function TicketPage({ params }: PageProps<"/account/support/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/account/support/${id}`);
  const data = await getTicketForUser(session.user.id, id);
  if (!data) notFound();
  const status = ticketStatus[data.ticket.status]!;
  return (
    <>
      <Link href="/account/support" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Zurück
      </Link>
      <Card>
        <CardHeader title={data.ticket.subject} description={supportCategoryLabel[data.ticket.category]} action={<Badge tone={status.tone}>{status.label}</Badge>} />
        <CardBody className="space-y-4">
          {data.messages.map((message) => (
            <div key={message.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", message.isStaff ? "bg-brand-50 text-ink-900" : "ml-auto bg-ink-100 text-ink-900")}>
              <p className="mb-1 text-xs font-semibold text-ink-600">{message.isStaff ? "Support-Team" : "Du"} · {formatDateTime(message.createdAt)}</p>
              <p className="whitespace-pre-line">{message.body}</p>
            </div>
          ))}
        </CardBody>
      </Card>
      {data.ticket.status !== "closed" ? (
        <Card>
          <CardBody>
            <ActionForm action={supportReplyAction} submitLabel="Nachricht senden" resetOnSuccess>
              <input type="hidden" name="ticketId" value={data.ticket.id} />
              <Field id="reply" label="Antwort">
                <Textarea id="reply" name="body" required maxLength={5000} rows={4} />
              </Field>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
