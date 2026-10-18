import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, CalendarClock, CheckCircle2, Coins, Flag, LifeBuoy, Radio, UserRoundCheck, Users } from "lucide-react";
import { sweepSessionsAction } from "@/actions/admin";
import { requireAdmin } from "@/server/auth/current";
import { getDashboardStats } from "@/server/admin/service";
import { reconcileLedger } from "@/server/ledger/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { formatCoins, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin-Dashboard" };

export default async function AdminDashboardPage() {
  await requireAdmin("/admin");
  const [stats, reconciliation] = await Promise.all([getDashboardStats(), reconcileLedger()]);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Dashboard" description="Kennzahlen aus der Datenbank (Testdaten). Keine geschätzten oder erfundenen Werte." />
      {stats.reports.critical > 0 ? (
        <Alert tone="danger" title={`${stats.reports.critical} kritische Meldung(en) offen`} action={<ButtonLink href="/admin/reports" size="sm" variant="danger">Sofort prüfen</ButtonLink>}>
          Hinweise auf Minderjährige, nicht einvernehmliche oder rechtswidrige Inhalte haben Vorrang.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kunden" value={stats.users.customers} hint={`${stats.users.unverifiedEmail} Konten mit unbestätigter E-Mail`} icon={<Users className="size-5" aria-hidden="true" />} />
        <StatCard label="Creator" value={stats.users.creators} hint={`${stats.creators.approved} freigegeben`} icon={<UserRoundCheck className="size-5" aria-hidden="true" />} />
        <StatCard
          tone={stats.creators.pendingReview > 0 ? "warning" : "default"}
          label="Profile in Prüfung"
          value={stats.creators.pendingReview}
          hint={<Link href="/admin/creators" className="text-brand-700 hover:underline">Zur Prüfung</Link>}
        />
        <StatCard tone={stats.reports.open > 0 ? "warning" : "default"} label="Offene Meldungen" value={stats.reports.open} icon={<Flag className="size-5" aria-hidden="true" />} />
        <StatCard label="Live / im privaten Chat" value={`${stats.creators.live} / ${stats.creators.inPrivate}`} icon={<Radio className="size-5" aria-hidden="true" />} />
        <StatCard label="Aktive private Chats" value={stats.sessions.active} hint={`${stats.sessions.totalPrivate} beendet · ${stats.sessions.billedMinutes} berechnete Minuten`} icon={<CalendarClock className="size-5" aria-hidden="true" />} />
        <StatCard tone="brand" label="Plattformanteil (Testmünzen)" value={formatCoins(stats.ledger.platformRevenue)} hint={`Creator-Anteile: ${formatCoins(stats.ledger.creatorEarnings)}`} icon={<Coins className="size-5" aria-hidden="true" />} />
        <StatCard label="Offene Support-Anfragen" value={stats.tickets.open} icon={<LifeBuoy className="size-5" aria-hidden="true" />} />
      </div>
      <Card>
        <CardHeader title="Integrität des Buchungsjournals" description={`Abgleich aller Kontosalden mit der Summe ihrer Buchungen · ${formatDateTime(reconciliation.checkedAt)}`} />
        <CardBody className="space-y-3">
          {reconciliation.ok ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success-700">
              <CheckCircle2 className="size-5" aria-hidden="true" /> Alle Salden stimmen, alle Buchungen sind ausgeglichen.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-danger-700">
              <AlertOctagon className="size-5" aria-hidden="true" /> {reconciliation.accountMismatches.length} Konto-Abweichung(en), {reconciliation.unbalancedTransactions.length} unausgeglichene Buchung(en). Bitte sofort prüfen.
            </p>
          )}
          <p className="text-xs text-ink-600">
            Ausgegebene Testmünzen gesamt: {formatCoins(stats.ledger.issued)} · Kundensalden: {formatCoins(stats.ledger.customerBalances)}
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Wartung" description="Abgelaufene Anfragen und verlorene Verbindungen werden auch automatisch bei Zugriffen bereinigt." />
        <CardBody>
          <ActionForm action={sweepSessionsAction} submitLabel="Sitzungen jetzt bereinigen" submitVariant="outline" inlineSuccess />
        </CardBody>
      </Card>
    </>
  );
}
