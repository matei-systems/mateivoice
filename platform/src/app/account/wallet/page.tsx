import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock, ReceiptText } from "lucide-react";
import { isTestMode } from "@/config/env";
import { testCoins } from "@/config/platform";
import { requestTestCoinsAction } from "@/actions/account";
import { requireSession } from "@/server/auth/current";
import { getBalance, getStatement } from "@/server/ledger/service";
import { listCoinPackages } from "@/server/payments/service";
import { StatementTable } from "@/components/account/statement-table";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CoinAmount } from "@/components/ui/coins";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { formatCoins, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Testguthaben" };

export default async function WalletPage() {
  const session = await requireSession("/account/wallet");
  if (session.user.role !== "customer") redirect("/account/settings");
  const [balance, statement, packages] = await Promise.all([
    getBalance(session.user.id, "customer_wallet"),
    getStatement(session.user.id, "customer_wallet", { limit: 100 }),
    listCoinPackages(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Münzen" title="Testguthaben" description="Alle Bewegungen deines Testguthabens – serverseitig gebucht und vollständig nachvollziehbar." />
      <Alert tone="test" title="Testmodus: Münzen ohne Geldwert">
        Testmünzen sind simulierte Nutzungseinheiten. Sie können nicht gekauft, übertragen oder ausgezahlt werden und haben keinen rechtlich gesicherten
        Geldwert.
      </Alert>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 bg-gradient-to-br from-brand-50 via-surface to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-medium text-ink-600">Aktuelles Testguthaben</p>
            <div className="mt-2">
              <CoinAmount amount={balance} size="xl" />
            </div>
          </div>
          {isTestMode() ? (
            <div className="space-y-2 sm:text-right">
              <ActionForm action={requestTestCoinsAction} submitLabel={`+${testCoins.grantAmount} Testmünzen anfordern`} />
              <p className="text-xs text-ink-600">1× pro Tag, solange das Guthaben unter {formatCoins(testCoins.maxBalanceForGrant)} liegt.</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Münzpakete" description="Beispielpreise zur Vorschau. Der Kauf ist noch nicht möglich – es ist kein Zahlungsanbieter angebunden." />
        <CardBody>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {packages.map((pkg) => (
              <li key={pkg.id} className="relative rounded-2xl border border-line bg-brand-25 p-5">
                <Badge tone="neutral" className="absolute top-4 right-4">
                  Beispiel
                </Badge>
                <p className="text-sm font-medium text-ink-600">{pkg.name}</p>
                <div className="mt-2">
                  <CoinAmount amount={pkg.coins} size="lg" test={false} />
                </div>
                <p className="mt-1 text-sm text-ink-600">{formatEuroCents(pkg.priceCents)} (Beispielpreis)</p>
                <button
                  type="button"
                  disabled
                  className="mt-4 inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink-100 text-sm font-medium text-ink-500"
                >
                  <Lock className="size-4" aria-hidden="true" /> Noch nicht verfügbar
                </button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kontoauszug" description="Jede Buchung trägt eine eindeutige Referenz und kann nicht doppelt ausgeführt werden." />
        {statement.length ? (
          <StatementTable rows={statement} />
        ) : (
          <CardBody>
            <EmptyState icon={<ReceiptText className="size-6" aria-hidden="true" />} title="Noch keine Bewegungen" description="Sobald du Testguthaben anforderst oder einen Chat führst, erscheint es hier." />
          </CardBody>
        )}
      </Card>
    </>
  );
}
