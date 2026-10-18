import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction } from "@/actions/account";
import { requireSession } from "@/server/auth/current";
import { listNotifications } from "@/server/notifications/service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { cn, formatDateTime, safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function NotificationsPage() {
  const session = await requireSession("/account/notifications");
  const items = await listNotifications(session.user.id, 100);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        eyebrow="Hinweise"
        title="Benachrichtigungen"
        description="In-App-Benachrichtigungen. E-Mail- und Push-Kanäle sind vorbereitet, aber noch nicht aktiv."
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm" icon={<CheckCheck className="size-4" aria-hidden="true" />}>
                Alle als gelesen markieren
              </Button>
            </form>
          ) : null
        }
      />
      {items.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cn("flex gap-4 px-5 py-4 sm:px-6", !n.readAt && "bg-brand-25")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-950">
                    {n.title}
                    {!n.readAt ? <span className="sr-only"> (ungelesen)</span> : null}
                  </p>
                  <p className="text-sm text-ink-700">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-500">{formatDateTime(n.createdAt)}</p>
                </div>
                {n.linkPath ? (
                  <Link href={safeRedirectPath(n.linkPath)} className="self-center text-sm font-medium whitespace-nowrap text-brand-700 hover:underline">
                    Öffnen
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<BellOff className="size-6" aria-hidden="true" />} title="Keine Benachrichtigungen" description="Hier erscheinen Hinweise zu Sitzungen, Support-Antworten und deinem Konto." />
      )}
    </>
  );
}
