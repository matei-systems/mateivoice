import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bell, CalendarClock, Compass, Gift, Wallet } from "lucide-react";
import { isTestMode } from "@/config/env";
import { testCoins } from "@/config/platform";
import { requestTestCoinsAction } from "@/actions/account";
import { requireSession, toActor } from "@/server/auth/current";
import { homePathFor } from "@/server/auth/permissions";
import { getBalance, getStatement } from "@/server/ledger/service";
import { listNotifications } from "@/server/notifications/service";
import { getOpenSessionForCustomer, listSessionsForUser } from "@/server/video/service";
import { SessionsTable } from "@/components/account/sessions-table";
import { StatementTable } from "@/components/account/statement-table";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Mein Bereich" };

export default async function AccountOverviewPage() {
  const session = await requireSession("/account");
  if (session.user.role !== "customer") redirect(homePathFor(session.user.role));
  const actor = toActor(session)!;
  const [balance, statement, sessions, notifications, openSession] = await Promise.all([
    getBalance(actor.id, "customer_wallet"),
    getStatement(actor.id, "customer_wallet", { limit: 5 }),
    listSessionsForUser(actor, 5),
    listNotifications(actor.id, 3),
    getOpenSessionForCustomer(actor.id),
  ]);

  return (
    <>
      <PageHeader eyebrow="Mein Bereich" title={`Hallo, ${session.user.username}`} description="Dein Überblick über Testguthaben, Sitzungen und Hinweise." />
      {openSession ? (
        <Alert tone="brand" title="Du hast eine offene Sitzung" action={<ButtonLink href={`/sessions/${openSession.id}`} size="sm">Öffnen</ButtonLink>}>
          Status: {openSession.status === "active" ? "aktiv" : openSession.status === "accepted" ? "angenommen – bitte beitreten" : "wartet auf Antwort"}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          tone="brand"
          label="Testguthaben"
          value={<CoinAmount amount={balance} size="lg" />}
          hint="Simuliert, ohne Geldwert – nicht kaufbar, nicht auszahlbar."
          icon={<Wallet className="size-5" aria-hidden="true" />}
        />
        <StatCard label="Sitzungen" value={sessions.length} hint="Letzte private Chats" icon={<CalendarClock className="size-5" aria-hidden="true" />} />
        <StatCard
          label="Neue Hinweise"
          value={notifications.filter((n) => !n.readAt).length}
          hint="Ungelesene Benachrichtigungen"
          icon={<Bell className="size-5" aria-hidden="true" />}
        />
      </div>
      {isTestMode() ? (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-test-50 text-test-700">
                <Gift className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">Testguthaben anfordern</p>
                <p className="text-sm text-ink-600">
                  {testCoins.grantAmount} Testmünzen pro Tag, solange dein Guthaben unter {testCoins.maxBalanceForGrant} liegt.
                </p>
              </div>
            </div>
            <ActionForm action={requestTestCoinsAction} submitLabel="Testguthaben anfordern" submitVariant="secondary" />
          </CardBody>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Letzte Bewegungen" action={<Link href="/account/wallet" className="text-sm font-medium text-brand-700 hover:underline">Alle ansehen</Link>} />
          {statement.length ? (
            <StatementTable rows={statement} />
          ) : (
            <CardBody>
              <EmptyState title="Noch keine Bewegungen" description="Fordere Testguthaben an, um private Chats auszuprobieren." />
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Benachrichtigungen" action={<Link href="/account/notifications" className="text-sm font-medium text-brand-700 hover:underline">Alle ansehen</Link>} />
          <CardBody>
            {notifications.length ? (
              <ul className="divide-y divide-line">
                {notifications.map((n) => (
                  <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-sm text-ink-600">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-500">{formatDateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">Keine Benachrichtigungen.</p>
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Letzte Sitzungen" action={<Link href="/account/sessions" className="text-sm font-medium text-brand-700 hover:underline">Alle ansehen</Link>} />
        {sessions.length ? (
          <SessionsTable rows={sessions} perspective="customer" />
        ) : (
          <CardBody>
            <EmptyState
              icon={<Compass className="size-6" aria-hidden="true" />}
              title="Noch keine Sitzungen"
              description="Entdecke Creator und frage einen privaten Chat an."
              action={
                <ButtonLink href="/creators" icon={<ArrowRight className="size-4" aria-hidden="true" />}>
                  Creator entdecken
                </ButtonLink>
              }
            />
          </CardBody>
        )}
      </Card>
    </>
  );
}
