import type { Metadata } from "next";
import { commission, pricing } from "@/config/platform";
import { requireRole } from "@/server/auth/current";
import { getOwnProfile } from "@/server/creators/service";
import { formatBps } from "@/server/ledger/commission";
import { currentCommissionBps } from "@/server/ledger/service";
import { PricingForm } from "@/components/studio/pricing-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Preise" };

export default async function StudioPricingPage() {
  const session = await requireRole(["creator"], "/studio/pricing");
  const own = await getOwnProfile(session.user.id);
  if (!own) return null;
  const bps = currentCommissionBps();
  return (
    <>
      <PageHeader eyebrow="Angebot" title="Preise" description="Lege deinen Minutenpreis innerhalb der Plattformgrenzen fest." />
      <Card>
        <CardHeader title="Privater 1:1-Videochat" />
        <CardBody>
          <PricingForm
            initialPrice={own.offer?.coinsPerMinute ?? pricing.privateChat.defaultCoinsPerMinute}
            enabled={own.offer?.enabled ?? false}
            min={pricing.privateChat.minCoinsPerMinute}
            max={pricing.privateChat.maxCoinsPerMinute}
            platformBps={bps}
          />
        </CardBody>
      </Card>
      <Alert tone="info" title={`So wird gerechnet (vorläufig ${formatBps(bps)} Provision)`}>
        {commission.basisDescription} {commission.roundingDescription} Preisänderungen gelten nur für neue Anfragen – laufende Sitzungen behalten den
        vereinbarten Preis.
      </Alert>
    </>
  );
}
