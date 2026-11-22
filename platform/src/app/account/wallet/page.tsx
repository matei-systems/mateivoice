import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptText, ShieldCheck } from "lucide-react";
import { isTestMode } from "@/config/env";
import { testCoins } from "@/config/platform";
import { requestTestCoinsAction } from "@/actions/account";
import { startCheckoutAction } from "@/actions/finance";
import { requireSession } from "@/server/auth/current";
import { getAgeAccess } from "@/server/age/service";
import { activeCoinCurrency, getBalance, getStatement } from "@/server/ledger/service";
import { listCoinPackages, paymentMode } from "@/server/payments/service";
import { getSettings } from "@/server/settings/service";
import { StatementTable } from "@/components/account/statement-table";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { formatCoins, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Guthaben" };

export default async function WalletPage() {
  const session = await requireSession("/account/wallet");
  if (session.user.role !== "customer") redirect("/account/settings");
  const currency = activeCoinCurrency();
  const test = currency === "TEST_COIN";
  const [balance, statement, packages, settings, age] = await Promise.all([
    getBalance(session.user.id, "customer_wallet", currency),
    getStatement(session.user.id, "customer_wallet", { limit: 100, currency }),
    listCoinPackages(),
    getSettings(),
    getAgeAccess(session.user.id),
  ]);
  const mode = paymentMode();
  const canBuy = mode.available && settings.featureFlags.purchases && session.user.emailVerified && age.allowed && session.user.status === "active";

  return (
    <>
      <PageHeader
        eyebrow="Münzen"
        title="Guthaben"
        description="Münzen sind die Zahlungseinheit für private Chats und Trinkgelder. Jede Bewegung wird serverseitig gebucht und ist nachvollziehbar."
        actions={<ButtonLink href="/account/purchases" variant="outline" size="sm">Kaufhistorie</ButtonLink>}
      />
      {test ? (
        <Alert tone="test" title="Testmodus: Münzen ohne Geldwert">
          Käufe laufen über eine Sandbox – es wird kein echtes Geld belastet. Testmünzen können nicht übertragen oder ausgezahlt werden.
        </Alert>
      ) : null}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 bg-gradient-to-br from-brand-50 via-surface to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-medium text-ink-600">Aktuelles Guthaben</p>
            <div className="mt-2">
              <CoinAmount amount={balance} size="xl" test={test} />
            </div>
          </div>
          {isTestMode() ? (
            <div className="space-y-2 sm:text-right">
              <ActionForm action={requestTestCoinsAction} submitLabel={`+${testCoins.grantAmount} Testmünzen gratis`} submitVariant="outline" />
              <p className="text-xs text-ink-600">1× pro Tag, solange das Guthaben unter {formatCoins(testCoins.maxBalanceForGrant)} liegt.</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Münzen kaufen"
          description={`Einmalkauf ohne Abo. Preise inkl. USt. Limits: ${formatEuroCents(settings.payments.dailyLimitCents)} pro Tag, ${formatEuroCents(settings.payments.monthlyLimitCents)} in 30 Tagen.`}
          action={mode.provider ? <Badge tone={mode.simulated ? "test" : "neutral"}>{mode.provider.label}</Badge> : undefined}
        />
        <CardBody className="space-y-4">
          {!mode.available ? <Alert tone="warning" title="Käufe derzeit nicht möglich">{mode.reason}</Alert> : null}
          {mode.available && !settings.featureFlags.purchases ? <Alert tone="warning">Käufe sind vorübergehend deaktiviert.</Alert> : null}
          {mode.available && !age.allowed ? (
            <Alert tone="brand" title="Altersprüfung erforderlich" action={<ButtonLink href="/account/age-verification" size="sm" icon={<ShieldCheck className="size-4" aria-hidden="true" />}>Jetzt prüfen</ButtonLink>}>
              Käufe, Live-Streams und private Chats sind erst nach einer Altersprüfung möglich.
            </Alert>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {packages.map((pkg) => (
              <li key={pkg.id} className="flex flex-col rounded-2xl border border-line bg-surface-2 p-5 transition hover:border-brand-300">
                <p className="text-sm font-medium text-ink-600">{pkg.name}</p>
                <div className="mt-2">
                  <CoinAmount amount={pkg.coins} size="lg" test={test} />
                </div>
                <p className="mt-1 text-lg font-semibold text-ink-950">{formatEuroCents(pkg.priceCents)}</p>
                <p className="text-xs text-ink-500">{formatEuroCents(Math.round((pkg.priceCents * 100) / pkg.coins))} je 100 Münzen · inkl. USt.</p>
                <ActionForm action={startCheckoutAction} submitLabel={mode.simulated ? "Kaufen (Sandbox)" : "Kaufen"} fullWidthSubmit disabledSubmit={!canBuy} className="mt-4 space-y-2">
                  <input type="hidden" name="packageId" value={pkg.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-500">
            Mit dem Kauf beginnt die Leistungserbringung sofort; für digitale Inhalte kann das Widerrufsrecht dadurch erlöschen (Entwurf, rechtlich zu prüfen). Details:{" "}
            <Link href="/pricing" className="text-brand-700 hover:underline">
              Preise & Münzen
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kontoauszug" description="Jede Buchung trägt eine eindeutige Referenz und kann nicht doppelt ausgeführt werden." />
        {statement.length ? (
          <StatementTable rows={statement} />
        ) : (
          <CardBody>
            <EmptyState icon={<ReceiptText className="size-6" aria-hidden="true" />} title="Noch keine Bewegungen" description="Sobald du Münzen erhältst oder einsetzt, erscheint es hier." />
          </CardBody>
        )}
      </Card>
    </>
  );
}
