import type { Metadata } from "next";
import { upsertCategoryAction } from "@/actions/staff";
import { requireStaff } from "@/server/auth/current";
import { listCategories } from "@/server/settings/service";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Kategorien" };

export default async function AdminCategoriesPage() {
  await requireStaff("admin.categories.manage", "/admin/categories");
  const categories = await listCategories({ includeInactive: true });
  return (
    <>
      <PageHeader eyebrow="Inhalte" title="Kategorien" description="Feste Themen für Creator-Profile und die Suche. Freitext-Tags sind bewusst nicht erlaubt (Moderationsrisiko). Inaktive Kategorien verschwinden aus Auswahl und Filter." />
      <div className="grid gap-4 md:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.slug}>
            <CardHeader title={category.label} description={category.slug} action={category.active ? <Badge tone="success">aktiv</Badge> : <Badge tone="neutral">inaktiv</Badge>} />
            <CardBody>
              <ActionForm action={upsertCategoryAction} submitLabel="Speichern" submitSize="sm" submitVariant="outline">
                <input type="hidden" name="slug" value={category.slug} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`label-${category.slug}`} label="Bezeichnung">
                    <Input id={`label-${category.slug}`} name="label" defaultValue={category.label} required minLength={2} maxLength={40} />
                  </Field>
                  <Field id={`sort-${category.slug}`} label="Reihenfolge">
                    <Input id={`sort-${category.slug}`} name="sortOrder" type="number" min={0} defaultValue={category.sortOrder} />
                  </Field>
                </div>
                <Checkbox id={`active-${category.slug}`} name="active" defaultChecked={category.active}>
                  Aktiv
                </Checkbox>
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Neue Kategorie" />
        <CardBody>
          <ActionForm action={upsertCategoryAction} submitLabel="Anlegen" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="new-slug" label="Kürzel" hint="Kleinbuchstaben, Ziffern, Bindestriche">
                <Input id="new-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={40} />
              </Field>
              <Field id="new-label" label="Bezeichnung">
                <Input id="new-label" name="label" required minLength={2} maxLength={40} />
              </Field>
              <Field id="new-sort" label="Reihenfolge">
                <Input id="new-sort" name="sortOrder" type="number" min={0} defaultValue={500} />
              </Field>
            </div>
            <Checkbox id="new-active" name="active" defaultChecked>
              Aktiv
            </Checkbox>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
