import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireSession, toActor } from "@/server/auth/current";
import { listSessionsForUser } from "@/server/video/service";
import { SessionsTable } from "@/components/account/sessions-table";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Sitzungen" };

export default async function AccountSessionsPage() {
  const session = await requireSession("/account/sessions");
  if (session.user.role !== "customer") redirect("/studio/sessions");
  const rows = await listSessionsForUser(toActor(session)!, 100);
  return (
    <>
      <PageHeader eyebrow="Verlauf" title="Sitzungen" description="Alle Anfragen und privaten Chats mit Dauer und berechneten Testmünzen." />
      <Card>
        {rows.length ? (
          <SessionsTable rows={rows} perspective="customer" />
        ) : (
          <CardBody>
            <EmptyState
              icon={<CalendarClock className="size-6" aria-hidden="true" />}
              title="Noch keine Sitzungen"
              description="Frage auf einem Creator-Profil einen privaten Chat an."
              action={<ButtonLink href="/creators">Creator entdecken</ButtonLink>}
            />
          </CardBody>
        )}
      </Card>
    </>
  );
}
