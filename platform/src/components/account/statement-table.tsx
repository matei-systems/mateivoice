import { Badge } from "@/components/ui/badge";
import { CoinIcon } from "@/components/ui/coins";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { transactionKindLabel } from "@/lib/labels";
import { cn, formatCoins, formatDateTime } from "@/lib/utils";
import type { AccountStatementRow } from "@/server/ledger/service";

/** Kontoauszug – jede Bewegung mit Saldo danach, simuliert gekennzeichnet. */
export function StatementTable({ rows }: { rows: AccountStatementRow[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Datum</TH>
          <TH>Vorgang</TH>
          <TH className="text-right">Betrag</TH>
          <TH className="text-right">Saldo danach</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.entryId}>
            <TD className="whitespace-nowrap text-ink-600">{formatDateTime(row.createdAt)}</TD>
            <TD>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{transactionKindLabel[row.kind] ?? row.kind}</span>
                {row.simulated ? <Badge tone="test">simuliert</Badge> : null}
              </div>
              <p className="text-xs text-ink-600">{row.description}</p>
            </TD>
            <TD className={cn("text-right font-semibold whitespace-nowrap tabular-nums", row.amount > 0 ? "text-success-700" : "text-ink-900")}>
              <span className="inline-flex items-center gap-1">
                {row.amount > 0 ? "+" : "−"}
                {formatCoins(Math.abs(row.amount))}
                <CoinIcon className="size-3.5" />
              </span>
            </TD>
            <TD className="text-right whitespace-nowrap text-ink-700 tabular-nums">{formatCoins(row.balanceAfter)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
