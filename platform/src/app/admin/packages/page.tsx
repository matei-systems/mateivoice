import type { Metadata } from "next";
import { upsertPackageAction } from "@/actions/finance";
import { requireStaff } from "@/server/auth/current";
import { listCoinPackages, paymentMode } from "@/server/payments/service";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { formatCoins, formatEuroCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Münzpakete" };

function euro(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function AdminPackagesPage() {
  await requireStaff("admin.packages.manage", "/admin/packages");
  const packages = await listCoinPackages({ includeInactive: true });
  const mode = paymentMode();
  return (
    <>
      <PageHeader eyebrow="Finanzen" title="Münzpakete" description="Preise sind Bruttopreise in Euro (inkl. USt.). Änderungen gelten nur für neue Bestellungen; offene Bestellungen behalten ihren Preis." />
      {mode.simulated || !mode.available ? (
        <Alert tone="test" title={mode.available ? "Sandbox" : "Keine Echtzahlungen"}>
          {mode.available ? "Käufe laufen über die Sandbox und schreiben nur Testmünzen gut." : mode.reason}
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            <CardHeader
              title={pkg.name}
              description={`${formatCoins(pkg.coins)} Münzen · ${formatEuroCents(pkg.priceCents)} · ${formatEuroCents(Math.round((pkg.priceCents * 100) / pkg.coins))} je 100 Münzen`}
              action={pkg.active ? <Badge tone="success">aktiv</Badge> : <Badge tone="neutral">inaktiv</Badge>}
            />
            <CardBody>
              <ActionForm action={upsertPackageAction} submitLabel="Speichern" submitSize="sm" submitVariant="outline">
                <input type="hidden" name="code" value={pkg.code} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`name-${pkg.id}`} label="Name">
                    <Input id={`name-${pkg.id}`} name="name" defaultValue={pkg.name} required maxLength={40} />
                  </Field>
                  <Field id={`coins-${pkg.id}`} label="Münzen">
                    <Input id={`coins-${pkg.id}`} name="coins" type="number" min={10} defaultValue={pkg.coins} required />
                  </Field>
                  <Field id={`price-${pkg.id}`} label="Preis (EUR, brutto)">
                    <Input id={`price-${pkg.id}`} name="priceEuro" inputMode="decimal" defaultValue={euro(pkg.priceCents)} required pattern="\d{1,6}([.,]\d{1,2})?" />
                  </Field>
                  <Field id={`sort-${pkg.id}`} label="Reihenfolge">
                    <Input id={`sort-${pkg.id}`} name="sortOrder" type="number" min={0} defaultValue={pkg.sortOrder} />
                  </Field>
                </div>
                <Checkbox id={`active-${pkg.id}`} name="active" defaultChecked={pkg.active}>
                  Aktiv (für Kunden sichtbar und kaufbar)
                </Checkbox>
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Neues Paket" />
        <CardBody>
          <ActionForm action={upsertPackageAction} submitLabel="Paket anlegen" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field id="new-code" label="Kürzel" hint="z. B. paket-1000">
                <Input id="new-code" name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={40} />
              </Field>
              <Field id="new-name" label="Name">
                <Input id="new-name" name="name" required maxLength={40} />
              </Field>
              <Field id="new-coins" label="Münzen">
                <Input id="new-coins" name="coins" type="number" min={10} required />
              </Field>
              <Field id="new-price" label="Preis (EUR)">
                <Input id="new-price" name="priceEuro" inputMode="decimal" required pattern="\d{1,6}([.,]\d{1,2})?" />
              </Field>
              <Field id="new-sort" label="Reihenfolge">
                <Input id="new-sort" name="sortOrder" type="number" min={0} defaultValue={100} />
              </Field>
            </div>
            <Checkbox id="new-active" name="active" defaultChecked>
              Sofort aktiv
            </Checkbox>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
