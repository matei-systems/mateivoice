import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/auth/current";
import { getSettingHistory, getSettings, SETTING_KEYS, SETTING_LABELS } from "@/server/settings/service";
import { SettingForm } from "@/components/admin/setting-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AdminSettingsPage() {
  await requireStaff("admin.settings.manage", "/admin/settings");
  const [settings, history] = await Promise.all([getSettings(), getSettingHistory(undefined, 30)]);
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Plattform-Einstellungen"
        description="Provision, Auszahlungsregeln, Kauflimits, Funktionen, Wartungsmodus, Länder & Altersprüfung, Streaming, Chat und Aufbewahrung. Änderungen gelten sofort für neue Vorgänge und werden mit Begründung protokolliert."
        actions={
          <Link href="/admin/config" className="text-sm font-medium text-brand-700 hover:underline">
            Technische Konfiguration ansehen
          </Link>
        }
      />
      <Alert tone="info" title="Geheimnisse gehören nicht hierher">Zugangsdaten (Zahlungs-, Mail-, Streaming-Anbieter) werden ausschließlich über Umgebungsvariablen bzw. einen Secret-Manager gesetzt und hier nie angezeigt.</Alert>
      <div className="space-y-6">
        {SETTING_KEYS.map((key) => (
          <Card key={key} id={key}>
            <CardHeader title={SETTING_LABELS[key]} />
            <CardBody>
              <SettingForm settingKey={key} value={settings[key] as Record<string, unknown>} />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Änderungshistorie" description="Unveränderlich gespeichert." />
        <Table>
          <THead>
            <tr>
              <TH>Zeitpunkt</TH>
              <TH>Einstellung</TH>
              <TH>Begründung</TH>
              <TH>Neuer Wert</TH>
            </tr>
          </THead>
          <TBody>
            {history.map((entry) => (
              <TR key={entry.id}>
                <TD className="whitespace-nowrap text-ink-600">{formatDateTime(entry.createdAt)}</TD>
                <TD>{SETTING_LABELS[entry.key as keyof typeof SETTING_LABELS] ?? entry.key}</TD>
                <TD className="max-w-xs text-ink-700">{entry.reason}</TD>
                <TD>
                  <code className="block max-w-sm overflow-x-auto text-xs text-ink-600">{JSON.stringify(entry.value)}</code>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {history.length === 0 ? <p className="px-6 py-6 text-center text-sm text-ink-600">Noch keine Änderungen – es gelten die Standardwerte.</p> : null}
      </Card>
    </>
  );
}
