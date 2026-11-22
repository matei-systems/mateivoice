import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { paymentOrders, riskEvents, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { AppError, notFound, validationError } from "@/server/errors";
import { log } from "@/server/log";
import { notifyStaff } from "@/server/notifications/service";

/**
 * Regelbasierte Betrugs- und Missbrauchssignale.
 *
 * Signale sperren NICHT automatisch Konten – sie werden Mitarbeitenden mit
 * „admin.risk.review“ zur Prüfung vorgelegt (menschliche Entscheidung, DSA-
 * konform begründbar). Ausnahme sind harte Grenzen (z. B. Kauflimits), die
 * direkt im jeweiligen Vorgang greifen.
 */

export type RiskKind =
  | "payment_failures"
  | "payment_velocity"
  | "payment_amount_mismatch"
  | "webhook_invalid_signature"
  | "chargeback"
  | "refund_after_consumption"
  | "tip_velocity"
  | "payout_destination_changed"
  | "payout_after_destination_change"
  | "new_account_large_purchase";

export type RiskSeverity = "low" | "medium" | "high";

export const RISK_LABELS: Record<RiskKind, string> = {
  payment_failures: "Mehrere fehlgeschlagene Zahlungen",
  payment_velocity: "Ungewöhnlich viele Käufe",
  payment_amount_mismatch: "Zahlungsbetrag weicht von Bestellung ab",
  webhook_invalid_signature: "Ungültige Webhook-Signatur",
  chargeback: "Rückbuchung (Chargeback)",
  refund_after_consumption: "Erstattung nach Verbrauch der Münzen",
  tip_velocity: "Ungewöhnlich viele Trinkgelder",
  payout_destination_changed: "Auszahlungskonto geändert",
  payout_after_destination_change: "Auszahlung kurz nach Kontoänderung",
  new_account_large_purchase: "Großer Kauf kurz nach Registrierung",
};

/** Schwellenwerte (bewusst konservativ; im Betrieb anhand echter Daten kalibrieren). */
export const RISK_THRESHOLDS = {
  failedPaymentsPerHour: 3,
  purchasesPerDay: 6,
  tipsPerTenMinutes: 15,
  tipCoinsPerTenMinutes: 5000,
  newAccountHours: 24,
  newAccountLargePurchaseCents: 10_000,
  payoutDestinationCooldownHours: 72,
} as const;

export async function recordRiskEvent(
  executor: Executor,
  input: { userId: string | null; kind: RiskKind; severity: RiskSeverity; details?: Record<string, unknown> },
) {
  // Gleiches offenes Signal für dieselbe Person innerhalb von 24 h nicht doppelt anlegen.
  if (input.userId) {
    const [existing] = await executor
      .select({ id: riskEvents.id })
      .from(riskEvents)
      .where(
        and(
          eq(riskEvents.userId, input.userId),
          eq(riskEvents.kind, input.kind),
          eq(riskEvents.status, "open"),
          gte(riskEvents.createdAt, sql`now() - interval '24 hours'`),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
  }
  const [row] = await executor
    .insert(riskEvents)
    .values({ userId: input.userId, kind: input.kind, severity: input.severity, details: input.details ?? {} })
    .returning({ id: riskEvents.id });
  log.warn("risk.event", { kind: input.kind, severity: input.severity });
  if (input.severity === "high") {
    await notifyStaff(executor, "admin.risk.review", {
      type: "risk.high",
      title: "Risikosignal mit hoher Priorität",
      body: RISK_LABELS[input.kind],
      linkPath: "/admin/risk",
    });
  }
  return row!.id;
}

/** Nach einer fehlgeschlagenen Zahlung: Häufung prüfen. */
export async function checkPaymentFailures(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.userId, userId), eq(paymentOrders.status, "failed"), gte(paymentOrders.updatedAt, sql`now() - interval '1 hour'`)));
  if ((row?.count ?? 0) >= RISK_THRESHOLDS.failedPaymentsPerHour) {
    await recordRiskEvent(executor, { userId, kind: "payment_failures", severity: "medium", details: { failedLastHour: row!.count } });
  }
}

/** Nach einem bestätigten Kauf: Häufung und Neukonten prüfen. */
export async function checkPurchasePatterns(executor: Executor, input: { userId: string; priceCents: number }) {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.userId, input.userId), eq(paymentOrders.status, "confirmed"), gte(paymentOrders.updatedAt, sql`now() - interval '24 hours'`)));
  if ((row?.count ?? 0) >= RISK_THRESHOLDS.purchasesPerDay) {
    await recordRiskEvent(executor, { userId: input.userId, kind: "payment_velocity", severity: "medium", details: { purchasesLast24h: row!.count } });
  }
  const [user] = await executor.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (
    user &&
    Date.now() - user.createdAt.getTime() < RISK_THRESHOLDS.newAccountHours * 3600_000 &&
    input.priceCents >= RISK_THRESHOLDS.newAccountLargePurchaseCents
  ) {
    await recordRiskEvent(executor, { userId: input.userId, kind: "new_account_large_purchase", severity: "low", details: { priceCents: input.priceCents } });
  }
}

// ── Prüfung durch Mitarbeiter ───────────────────────────────────────────────

export async function listRiskEvents(filter: { status?: "open" | "reviewed" | "dismissed" } = {}, limit = 100) {
  return getDb()
    .select({
      id: riskEvents.id,
      kind: riskEvents.kind,
      severity: riskEvents.severity,
      status: riskEvents.status,
      details: riskEvents.details,
      createdAt: riskEvents.createdAt,
      reviewedAt: riskEvents.reviewedAt,
      reviewNote: riskEvents.reviewNote,
      userId: riskEvents.userId,
      username: users.username,
    })
    .from(riskEvents)
    .leftJoin(users, eq(users.id, riskEvents.userId))
    .where(filter.status ? eq(riskEvents.status, filter.status) : undefined)
    .orderBy(sql`CASE ${riskEvents.status} WHEN 'open' THEN 0 ELSE 1 END`, sql`CASE ${riskEvents.severity} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`, desc(riskEvents.createdAt))
    .limit(limit);
}

export async function countOpenRiskEvents() {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int`, high: sql<number>`count(*) FILTER (WHERE ${riskEvents.severity} = 'high')::int` })
    .from(riskEvents)
    .where(eq(riskEvents.status, "open"));
  return { open: row?.count ?? 0, high: row?.high ?? 0 };
}

export async function reviewRiskEvent(input: {
  staffUserId: string;
  riskEventId: string;
  decision: "reviewed" | "dismissed";
  note: string;
  ipHash?: string | null;
}) {
  const note = input.note.trim();
  if (note.length < 10) throw validationError("Bitte dokumentiere die Prüfung (mind. 10 Zeichen).");
  await getDb().transaction(async (tx) => {
    const [event] = await tx.select().from(riskEvents).where(eq(riskEvents.id, input.riskEventId)).for("update");
    if (!event) throw notFound("Signal nicht gefunden.");
    if (event.status !== "open") throw new AppError("invalid_state", "Dieses Signal wurde bereits bearbeitet.");
    await tx
      .update(riskEvents)
      .set({ status: input.decision, reviewNote: note, reviewedById: input.staffUserId, reviewedAt: new Date() })
      .where(eq(riskEvents.id, event.id));
    await writeAuditLog(tx, {
      actorUserId: input.staffUserId,
      action: `risk.${input.decision}`,
      targetType: "risk_event",
      targetId: event.id,
      reason: note,
      metadata: { kind: event.kind, severity: event.severity },
      ipHash: input.ipHash,
    });
  });
}
