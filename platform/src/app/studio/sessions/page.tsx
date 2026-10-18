import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { requireRole, toActor } from "@/server/auth/current";
import { listSessionsForUser } from "@/server/video/service";
import { SessionsTable } from "@/components/account/sessions-table";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Sitzungen" };

export default async function StudioSessionsPage() {
  const session = await requireRole(["creator"], "/studio/sessions");
  const rows = await listSessionsForUser(toActor(session)!, 100);
  return (
    <>
      <PageHeader eyebrow="Verlauf" title="Sitzungen" description="Alle privaten Chats mit Dauer und Umsatz (Testmünzen, brutto)." />
      <Card>
        {rows.length ? (
          <SessionsTable rows={rows} perspective="creator" />
        ) : (
          <CardBody>
            <EmptyState icon={<CalendarClock className="size-6" aria-hidden="true" />} title="Noch keine Sitzungen" description="Gehe online, um Anfragen zu erhalten." />
          </CardBody>
        )}
      </Card>
    </>
  );
}
