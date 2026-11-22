import { updateSettingAction } from "@/actions/staff";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SETTING_FIELDS } from "@/lib/settings-fields";

/** Formular für einen Einstellungsschlüssel (Felder aus SETTING_FIELDS, Validierung serverseitig). */
export function SettingForm({ settingKey, value }: { settingKey: string; value: Record<string, unknown> }) {
  const fields = SETTING_FIELDS[settingKey] ?? [];
  const id = (name: string) => `setting-${settingKey}-${name}`;
  const countries = Array.isArray(value.allowedCountries) ? (value.allowedCountries as string[]) : [];
  const policies = (value.policy as Record<string, string> | undefined) ?? {};
  return (
    <ActionForm action={updateSettingAction} submitLabel="Speichern" submitSize="sm">
      <input type="hidden" name="key" value={settingKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const current = value[field.name];
          switch (field.type) {
            case "int":
              return (
                <Field key={field.name} id={id(field.name)} label={field.label} hint={field.hint}>
                  <Input id={id(field.name)} name={field.name} type="number" min={field.min} max={field.max} defaultValue={String(current ?? "")} required />
                </Field>
              );
            case "bool":
              return (
                <div key={field.name} className="sm:col-span-2">
                  <Checkbox id={id(field.name)} name={field.name} defaultChecked={current === true}>
                    {field.label}
                    {field.hint ? <span className="block text-xs text-ink-500">{field.hint}</span> : null}
                  </Checkbox>
                </div>
              );
            case "text":
              return (
                <Field key={field.name} id={id(field.name)} label={field.label} hint={field.hint} className="sm:col-span-2">
                  <Textarea id={id(field.name)} name={field.name} rows={2} maxLength={field.maxLength} defaultValue={String(current ?? "")} />
                </Field>
              );
            case "countries":
              return (
                <Field key={field.name} id={id(field.name)} label={field.label} hint={field.hint}>
                  <Input id={id(field.name)} name={field.name} defaultValue={countries.join(", ")} required />
                </Field>
              );
            case "policy":
              return (
                <Field key={field.name} id={id(field.name)} label={field.label} hint={field.hint}>
                  <Select id={id(field.name)} name={field.name} defaultValue={String(current ?? "verified")}>
                    <option value="verified">Altersprüfung über Anbieter (verified)</option>
                    <option value="self_declaration">Selbstauskunft (self_declaration)</option>
                  </Select>
                </Field>
              );
            case "policyMap":
              return (
                <div key={field.name} className="space-y-3 sm:col-span-2">
                  <p className="text-sm font-medium text-ink-800">{field.label}</p>
                  {field.hint ? <p className="text-xs text-ink-600">{field.hint}</p> : null}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {countries.map((country) => (
                      <Field key={country} id={id(`policy-${country}`)} label={country}>
                        <Select id={id(`policy-${country}`)} name={`policy.${country}`} defaultValue={policies[country] ?? "verified"}>
                          <option value="verified">verified</option>
                          <option value="self_declaration">self_declaration</option>
                        </Select>
                      </Field>
                    ))}
                  </div>
                </div>
              );
          }
        })}
      </div>
      <Field id={id("reason")} label="Begründung der Änderung" hint="Pflichtfeld – wird mit altem und neuem Wert protokolliert.">
        <Input id={id("reason")} name="reason" required minLength={10} maxLength={500} />
      </Field>
    </ActionForm>
  );
}
