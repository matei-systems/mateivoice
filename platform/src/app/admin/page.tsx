import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, Banknote, CalendarClock, CheckCircle2, Coins, Eye, Flag, LifeBuoy, Lock, Radio, ShieldAlert, ShieldCheck, UserPlus, UserRoundCheck, Users } from "lucide-react";
import { sweepSessionsAction } from "@/actions/admin";
import { requireStaff, toActor } from "@/server/auth/current";
import { hasPermission } from "@/server/auth/permissions";
import { getDashboardStats } from "@/server/admin/service";
import { reconcileLedger } from "@/server/ledger/service";
import { getSettings } from "@/server/settings/service";
import { isTestMode } from "@/config/env";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { formatCoins, formatDateTime, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Übersicht" };

export default async function AdminDashboardPage() {
  const session = await requireStaff(undefined, "/admin");
  const actor = toActor(session);
  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(actor, permission);
  const [stats, settings] = await Promise.all([getDashboardStats(), getSettings()]);
  const reconciliation = can("admin.ledger.view") ? await reconcileLedger() : null;
  const unit = isTestMode() ? "Testmünzen" : "Münzen";
  return (
    <>
      <PageHeader eyebrow="Mitarbeiterbereich" title="Übersicht" description="Kennzahlen direkt aus der Datenbank – keine Schätzungen. Du siehst nur Bereiche, für die deine Rolle berechtigt ist." />
      {settings.maintenance.enabled ? (
        <Alert tone="warning" title="Wartungsmodus aktiv" action={can("admin.settings.manage") ? <ButtonLink href="/admin/settings#maintenance" size="sm" variant="outline">Einstellungen</ButtonLink> : undefined}>
          Nur Mitarbeiter können die Plattform nutzen.
        </Alert>
      ) : null}
      {can("admin.reports.manage") && stats.reports.critical > 0 ? (
        <Alert tone="danger" title={`${stats.reports.critical} kritische Meldung(en) offen`} action={<ButtonLink href="/admin/reports" size="sm" variant="danger">Sofort prüfen</ButtonLink>}>
          Hinweise auf Minderjährige, nicht einvernehmliche oder rechtswidrige Inhalte haben Vorrang. Beweise wurden automatisch gesichert.
        </Alert>
      ) : null}
      {can("admin.risk.review") && stats.risk.high > 0 ? (
        <Alert tone="danger" title={`${stats.risk.high} Risikosignal(e) mit hoher Priorität`} action={<ButtonLink href="/admin/risk" size="sm" variant="outline">Prüfen</ButtonLink>} />
      ) : null}

      <section className="space-y-3" aria-labelledby="live-heading">
        <h2 id="live-heading" className="text-sm font-semibold tracking-wide text-ink-600 uppercase">Live-Betrieb</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aktuelle Zuschauer" value={stats.live.viewers} hint="Teilnehmer aktiver Sitzungen (Herzschlag < 2 Min.)" icon={<Eye className="size-5" aria-hidden="true" />} />
          <StatCard label="Live / im privaten Chat" value={`${stats.creators.live} / ${stats.creators.inPrivate}`} icon={<Radio className="size-5" aria-hidden="true" />} />
          <StatCard label="Aktive private Chats" value={stats.sessions.active} hint={`${stats.sessions.totalPrivate} beendet · ${stats.sessions.billedMinutes} berechnete Minuten`} icon={<CalendarClock className="size-5" aria-hidden="true" />} />
          <StatCard label="Neue Registrierungen heute" value={stats.registrationsToday} icon={<UserPlus className="size-5" aria-hidden="true" />} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="text-sm font-semibold tracking-wide text-ink-600 uppercase">Vertrauen & Sicherheit</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Kunden / Creator" value={`${stats.users.customers} / ${stats.users.creators}`} hint={`${stats.users.suspended} gesperrt · ${stats.users.unverifiedEmail} unbestätigt`} icon={<Users className="size-5" aria-hidden="true" />} />
          {can("admin.creators.review") ? (
            <StatCard tone={stats.creators.pendingReview > 0 ? "warning" : "default"} label="Profile in Prüfung" value={stats.creators.pendingReview} hint={<Link href="/admin/creators" className="text-brand-700 hover:underline">Zur Prüfung</Link>} icon={<UserRoundCheck className="size-5" aria-hidden="true" />} />
          ) : null}
          {can("admin.reports.manage") ? <StatCard tone={stats.reports.open > 0 ? "warning" : "default"} label="Offene Meldungen" value={stats.reports.open} icon={<Flag className="size-5" aria-hidden="true" />} /> : null}
          {can("admin.legal_holds.manage") ? <StatCard label="Aktive Beweissicherungen" value={stats.compliance.activeHolds} icon={<Lock className="size-5" aria-hidden="true" />} /> : null}
          {can("admin.support.manage") ? <StatCard label="Offene Support-Anfragen" value={stats.tickets.open} icon={<LifeBuoy className="size-5" aria-hidden="true" />} /> : null}
          {can("admin.privacy.manage") ? <StatCard label="Offene Datenschutzanfragen" value={stats.compliance.privacyOpen} icon={<ShieldCheck className="size-5" aria-hidden="true" />} /> : null}
        </div>
      </section>

      {can("admin.ledger.view") || can("admin.payouts.manage") || can("admin.risk.review") ? (
        <section className="space-y-3" aria-labelledby="finance-heading">
          <h2 id="finance-heading" className="text-sm font-semibold tracking-wide text-ink-600 uppercase">Finanzen {isTestMode() ? "(Sandbox)" : ""}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard tone="brand" label="Käufe heute" value={formatEuroCents(stats.finance.ordersTodayCents)} hint={`${stats.finance.ordersToday} bestätigte Bestellungen`} icon={<Coins className="size-5" aria-hidden="true" />} />
            <StatCard label="Plattformanteil gesamt" value={formatCoins(stats.ledger.platformRevenue)} hint={`${unit} · Creator-Anteile ${formatCoins(stats.ledger.creatorEarnings)}`} />
            <StatCard tone={stats.finance.openPayouts > 0 ? "warning" : "default"} label="Offene Auszahlungen" value={stats.finance.openPayouts} icon={<Banknote className="size-5" aria-hidden="true" />} />
            <StatCard tone={stats.risk.open > 0 ? "warning" : "default"} label="Offene Risikosignale" value={stats.risk.open} hint={`${stats.risk.high} mit hoher Priorität`} icon={<ShieldAlert className="size-5" aria-hidden="true" />} />
          </div>
        </section>
      ) : null}

      {reconciliation ? (
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
              Ausgegebene {unit}: {formatCoins(stats.ledger.issued)} · Kundensalden: {formatCoins(stats.ledger.customerBalances)}
            </p>
          </CardBody>
        </Card>
      ) : null}
      {can("admin.streams.manage") ? (
        <Card>
          <CardHeader title="Wartung" description="Abgelaufene Anfragen und verlorene Verbindungen werden auch automatisch bereinigt (Job-Endpunkt bzw. bei Zugriffen)." />
          <CardBody>
            <ActionForm action={sweepSessionsAction} submitLabel="Sitzungen jetzt bereinigen" submitVariant="outline" inlineSuccess />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
