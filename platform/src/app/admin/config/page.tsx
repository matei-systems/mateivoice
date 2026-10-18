import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/current";
import { getConfigOverview } from "@/server/admin/service";
import { formatBps } from "@/server/ledger/commission";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Konfiguration" };

export default async function AdminConfigPage() {
  await requireAdmin("/admin/config");
  const config = getConfigOverview();
  return (
    <>
      <PageHeader eyebrow="System" title="Konfiguration" description="Nur nicht geheime Werte. Änderungen erfolgen über Umgebungsvariablen bzw. config/platform.ts und ein Deployment." />
      <Alert tone={config.testMode ? "test" : "info"} title={`Umgebung: ${config.environment}${config.testMode ? " · Testmodus aktiv" : ""}`}>
        In Produktion verhindert die Konfigurationsprüfung den Start mit Testmodus oder Mock-Anbietern.
      </Alert>
      <Card>
        <CardHeader title="Anbieter" description="Jeder Anbieter ist über eine austauschbare Schnittstelle angebunden." />
        <CardBody>
          <DescriptionList
            items={Object.entries(config.providers).map(([key, provider]) => ({
              term: { email: "E-Mail", payment: "Zahlung", payout: "Auszahlung", video: "Video", identity: "Alters-/ID-Prüfung", storage: "Dateispeicher" }[key] ?? key,
              detail: (
                <span className="flex flex-wrap items-center gap-2">
                  {provider.name}
                  {provider.real ? <Badge tone="success">echt</Badge> : <Badge tone="test">Simulation / nicht aktiv</Badge>}
                  {"note" in provider ? <span className="text-xs text-ink-600">{provider.note}</span> : null}
                </span>
              ),
            }))}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Geschäftsregeln" />
        <CardBody>
          <DescriptionList
            items={[
              { term: "Plattformprovision", detail: `${formatBps(config.commission.platformBps)} (${config.commission.status === "provisional" ? "vorläufig" : config.commission.status})` },
              { term: "Bemessungsgrundlage", detail: config.commission.basis },
              { term: "Preisgrenzen privater Chat", detail: `${config.pricing.privateChat.minCoinsPerMinute}–${config.pricing.privateChat.maxCoinsPerMinute} Münzen/Min.` },
              { term: "Testguthaben", detail: `${config.testCoins.grantAmount} pro Tag bis Saldo ${config.testCoins.maxBalanceForGrant}` },
              { term: "Anfrage-Gültigkeit", detail: `${config.videoSessions.requestTtlSeconds} s` },
              { term: "Verbindungs-Timeout", detail: `${config.videoSessions.heartbeatTimeoutSeconds} s` },
              { term: "Uploads", detail: `${config.uploads.maxBytes / 1024 / 1024} MB, ${config.uploads.allowedMimeTypes.join(", ")}, max. ${config.uploads.maxGalleryImages} Galeriebilder` },
              { term: "App-URL", detail: config.appUrl },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
