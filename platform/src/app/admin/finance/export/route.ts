import { getCurrentSession, getRequestContext, toActor } from "@/server/auth/current";
import { hasPermission, isStaffRole } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/audit";
import { getDb } from "@/server/db/client";
import { exportLedgerCsv, monthPeriod } from "@/server/finance/reports";

/** CSV-Export des Buchungsjournals (nur Finanzen/Admin, mit bestätigter 2FA; protokolliert). */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  const actor = toActor(session);
  if (!session || !actor || !isStaffRole(actor.role) || !session.user.totpEnabled || !session.mfaVerified || !hasPermission(actor, "admin.finance.reports")) {
    return new Response("forbidden", { status: 403 });
  }
  const period = monthPeriod(new URL(request.url).searchParams.get("month") ?? undefined);
  const csv = await exportLedgerCsv(period);
  const { ipHash } = await getRequestContext();
  await writeAuditLog(getDb(), { actorUserId: actor.id, action: "finance.export", targetType: "report", targetId: period.month, ipHash });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="buchungsjournal-${period.month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
