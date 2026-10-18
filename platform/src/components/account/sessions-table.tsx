import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CoinIcon } from "@/components/ui/coins";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { endReasonLabel, sessionStatus } from "@/lib/labels";
import { formatCoins, formatDateTime, formatDuration } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
  requestedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  chargedMinutes: number;
  totalCoins: number;
  coinsPerMinute: number | null;
  creatorName: string;
  customerName: string | null;
};

export function SessionsTable({ rows, perspective }: { rows: Row[]; perspective: "customer" | "creator" }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Datum</TH>
          <TH>{perspective === "customer" ? "Creator" : "Kunde"}</TH>
          <TH>Status</TH>
          <TH className="text-right">Dauer</TH>
          <TH className="text-right">Münzen</TH>
          <TH />
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const status = sessionStatus[row.status] ?? { label: row.status, tone: "neutral" as const };
          const duration = row.startedAt ? ((row.endedAt ?? new Date()).getTime() - row.startedAt.getTime()) / 1000 : 0;
          return (
            <TR key={row.id}>
              <TD className="whitespace-nowrap text-ink-600">{formatDateTime(row.requestedAt)}</TD>
              <TD className="font-medium">{perspective === "customer" ? row.creatorName : (row.customerName ?? "–")}</TD>
              <TD>
                <Badge tone={status.tone}>{status.label}</Badge>
                {row.endReason ? <p className="mt-1 text-xs text-ink-600">{endReasonLabel[row.endReason] ?? row.endReason}</p> : null}
              </TD>
              <TD className="text-right tabular-nums">{row.startedAt ? formatDuration(duration) : "–"}</TD>
              <TD className="text-right whitespace-nowrap tabular-nums">
                <span className="inline-flex items-center gap-1">
                  {formatCoins(row.totalCoins)} <CoinIcon className="size-3.5" />
                </span>
                <p className="text-xs text-ink-500">
                  {row.chargedMinutes} Min. × {row.coinsPerMinute ?? "–"}
                </p>
              </TD>
              <TD className="text-right">
                <Link href={`/sessions/${row.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  Details
                </Link>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
