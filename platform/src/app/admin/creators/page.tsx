import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/current";
import { listProfilesForAdmin } from "@/server/creators/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { AvailabilityBadge, VerificationBadge } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { reviewStatus } from "@/lib/labels";
import { verificationDisplay, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Creator-Prüfung" };

export default async function AdminCreatorsPage() {
  await requireAdmin("/admin/creators");
  const rows = await listProfilesForAdmin();
  return (
    <>
      <PageHeader eyebrow="Administration" title="Creator-Prüfung" description="Profile und Bilder prüfen. Profile in Prüfung stehen oben." />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Profil</TH>
              <TH>Prüfstatus</TH>
              <TH>Verifizierung</TH>
              <TH>Verfügbarkeit</TH>
              <TH>Bilder offen</TH>
              <TH>Aktualisiert</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const review = reviewStatus[row.reviewStatus]!;
              return (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/admin/creators/${row.id}`} className="font-medium text-brand-700 hover:underline">
                      {row.displayName}
                    </Link>
                    <p className="text-xs text-ink-600">@{row.username}{row.isTestProfile ? " · Testprofil" : ""}</p>
                  </TD>
                  <TD>
                    <Badge tone={review.tone}>{review.label}</Badge>
                  </TD>
                  <TD>
                    <VerificationBadge verification={verificationDisplay(row.verificationStatus as VerificationStatus | null, row.verificationProvider)} />
                  </TD>
                  <TD>
                    <AvailabilityBadge availability={row.availability} />
                  </TD>
                  <TD>{row.pendingMedia > 0 ? <Badge tone="warning">{row.pendingMedia}</Badge> : <span className="text-ink-500">0</span>}</TD>
                  <TD className="text-ink-600">{formatDateTime(row.updatedAt)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
