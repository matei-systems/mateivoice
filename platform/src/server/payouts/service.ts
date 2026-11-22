import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv, isTestMode } from "@/config/env";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { creatorPayoutProfiles, ledgerAccounts, ledgerEntries, payouts, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { decryptField, encryptField, randomToken } from "@/server/crypto";
import { queueEmail } from "@/server/email/service";
import { AppError, PG_UNIQUE_VIOLATION, featureUnavailable, forbidden, notFound, pgErrorCode, validationError } from "@/server/errors";
import { activeCoinCurrency, getOrCreateAccount, InsufficientFundsError, postTransaction, type CoinCurrency } from "@/server/ledger/service";
import { notify, notifyStaff } from "@/server/notifications/service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { RISK_THRESHOLDS, recordRiskEvent } from "@/server/risk/service";
import { getSettings } from "@/server/settings/service";
import { creatorMayOperate } from "@/server/video/service";
import { validateIban } from "@/lib/iban";
import { formatEuroCents } from "@/lib/utils";

/**
 * Creator-Auszahlungen.
 *
 * Ablauf: Antrag (Reservierung im Ledger) → Prüfung/Freigabe durch Finanzen →
 * Ausführung über den Auszahlungsanbieter (andere Person als die Freigabe,
 * Vier-Augen-Prinzip) → abgeschlossen. Ablehnung oder Fehlschlag gibt die
 * Reservierung wieder frei. Jeder Schritt ist im Ledger und Audit-Protokoll
 * nachvollziehbar.
 *
 * Buchungen:
 *   Antrag:      creator_earnings −X  →  system_payout_clearing +X
 *   Ausführung:  system_payout_clearing −X  →  system_payout_settled +X
 *   Freigabe der Reservierung (Ablehnung/Fehlschlag): Gegenbuchung des Antrags
 *
 * Testmodus: Anbieter „sandbox“, nur Testmünzen, es wird KEIN Geld bewegt
 * (per DB-Constraint erzwungen). Echte Auszahlungen erfordern einen
 * freigegebenen Auszahlungsanbieter und echte Münzen (derzeit gesperrt).
 */

export type PayoutAvailability = { available: boolean; simulated: boolean; reason?: string };

export function payoutAvailability(): PayoutAvailability {
  const provider = getEnv().PAYOUT_PROVIDER;
  if (provider === "none") return { available: false, simulated: false, reason: "Es ist noch kein Auszahlungsanbieter eingerichtet." };
  if (!isTestMode()) return { available: false, simulated: false, reason: "Echte Auszahlungen sind noch nicht freigegeben." };
  return { available: true, simulated: true };
}

const OPEN_STATUSES = ["requested", "approved", "processing"] as const;

// ── Auszahlungsprofil ───────────────────────────────────────────────────────

export async function getPayoutProfile(userId: string) {
  const [row] = await getDb().select().from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, userId)).limit(1);
  if (!row) return null;
  return {
    method: row.method,
    accountHolder: row.accountHolder,
    ibanMasked: `${row.country}•• •••• •••• ${row.ibanLast4}`,
    ibanLast4: row.ibanLast4,
    country: row.country,
    updatedAt: row.updatedAt,
  };
}

export const payoutProfileSchema = z.object({
  accountHolder: z
    .string()
    .trim()
    .min(2, "Bitte gib den Namen der Kontoinhaberin bzw. des Kontoinhabers an.")
    .max(70, "Höchstens 70 Zeichen.")
    .regex(/^[\p{L}\p{M}' .,-]+$/u, "Der Name enthält ungültige Zeichen."),
  iban: z.string().trim().min(15).max(42),
});

export async function savePayoutProfile(actor: Actor, raw: unknown, context: { ipHash?: string | null } = {}) {
  if (!hasPermission(actor, "studio.payouts.manage")) throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  const parsed = payoutProfileSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const check = validateIban(parsed.data.iban);
  if (!check.valid) throw validationError(check.reason);
  await enforceRateLimit(`sensitive:${actor.id}`, RATE_LIMITS.sensitiveActionPerUser);
  await getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ userId: creatorPayoutProfiles.userId }).from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, actor.id)).for("update");
    const values = {
      method: "sepa" as const,
      accountHolder: parsed.data.accountHolder,
      ibanEncrypted: encryptField(check.iban),
      ibanLast4: check.iban.slice(-4),
      country: check.country,
      updatedAt: new Date(),
    };
    await tx.insert(creatorPayoutProfiles).values({ userId: actor.id, ...values }).onConflictDoUpdate({ target: creatorPayoutProfiles.userId, set: values });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: existing ? "payout_profile.changed" : "payout_profile.created",
      targetType: "user",
      targetId: actor.id,
      metadata: { country: check.country, last4: check.iban.slice(-4) },
      ipHash: context.ipHash,
    });
    if (existing) {
      await recordRiskEvent(tx, { userId: actor.id, kind: "payout_destination_changed", severity: "low", details: { country: check.country } });
      await queueEmail({ userId: actor.id, template: "security_notice", data: { kind: "payout_destination_changed" } }, tx);
    }
  });
}

/** Nur für die Ausführung durch Finanzen: entschlüsselte IBAN (wird nicht geloggt). */
async function decryptedIban(tx: Transaction, userId: string) {
  const [row] = await tx.select().from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, userId)).limit(1);
  return row ? { iban: decryptField(row.ibanEncrypted), accountHolder: row.accountHolder } : null;
}

// ── Guthaben ────────────────────────────────────────────────────────────────

export async function getPayoutSummary(userId: string, db: Executor = getDb()) {
  const settings = await getSettings();
  const currency = activeCoinCurrency();
  const [account] = await db
    .select({ id: ledgerAccounts.id, balance: ledgerAccounts.balance })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.ownerUserId, userId), eq(ledgerAccounts.kind, "creator_earnings"), eq(ledgerAccounts.currency, currency)))
    .limit(1);
  const balance = account?.balance ?? 0;
  let pending = 0;
  if (account && settings.payout.holdDays > 0) {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint` })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.accountId, account.id),
          sql`${ledgerEntries.amount} > 0`,
          gte(ledgerEntries.createdAt, sql`now() - make_interval(days => ${settings.payout.holdDays})`),
        ),
      );
    pending = Number(row?.total ?? 0);
  }
  const available = Math.max(0, balance - pending);
  const [open] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.creatorUserId, userId), inArray(payouts.status, [...OPEN_STATUSES])))
    .orderBy(desc(payouts.createdAt))
    .limit(1);
  return {
    currency,
    balance,
    pending: Math.min(pending, Math.max(balance, 0)),
    available,
    availableCents: coinsToCents(available, settings.payout.centsPer100Coins),
    minimumCoins: settings.payout.minimumCoins,
    holdDays: settings.payout.holdDays,
    centsPer100Coins: settings.payout.centsPer100Coins,
    openPayout: open ?? null,
  };
}

export function coinsToCents(coins: number, centsPer100Coins: number): number {
  return Number((BigInt(Math.max(0, coins)) * BigInt(centsPer100Coins)) / 100n);
}

// ── Antrag ──────────────────────────────────────────────────────────────────

export async function requestPayout(actor: Actor, rawAmount: unknown, context: { ipHash?: string | null } = {}) {
  if (!hasPermission(actor, "studio.payouts.manage")) throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  const settings = await getSettings();
  if (!settings.featureFlags.payouts) throw featureUnavailable("Auszahlungen sind derzeit deaktiviert.");
  const availability = payoutAvailability();
  if (!availability.available) throw featureUnavailable(availability.reason ?? "Auszahlungen sind nicht verfügbar.");
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw validationError("Bitte gib einen ganzzahligen Betrag in Münzen an.");
  if (amount < settings.payout.minimumCoins) throw validationError(`Der Mindestbetrag für Auszahlungen beträgt ${settings.payout.minimumCoins} Münzen.`);
  await enforceRateLimit(`payout:${actor.id}`, RATE_LIMITS.payoutRequestsPerUser);

  const profile = await getDb().select().from(creatorPayoutProfiles).where(eq(creatorPayoutProfiles.userId, actor.id)).limit(1);
  if (!profile[0]) throw new AppError("invalid_state", "Bitte hinterlege zuerst ein Auszahlungskonto.");
  const summary = await getPayoutSummary(actor.id);
  if (summary.openPayout) throw new AppError("conflict", "Es gibt bereits einen offenen Auszahlungsantrag.");
  if (amount > summary.available) {
    throw validationError(`Verfügbar sind derzeit ${summary.available} Münzen (Einnahmen der letzten ${settings.payout.holdDays} Tage sind noch in der Haltefrist).`);
  }

  const currency: CoinCurrency = summary.currency;
  const simulated = availability.simulated;
  const fiatAmountCents = coinsToCents(amount, settings.payout.centsPer100Coins);
  const payoutId = crypto.randomUUID();

  const created = await getDb()
    .transaction(async (tx) => {
    if (!(await creatorMayOperate(tx, actor.id))) throw new AppError("invalid_state", "Auszahlungen setzen eine abgeschlossene Alters- und Identitätsprüfung voraus.");
    // Sperre auf das Konto serialisiert parallele Anträge; danach unter Sperre erneut prüfen.
    const [user] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, actor.id)).for("update");
    if (user?.role !== "creator" || user.status !== "active") throw forbidden();
    const locked = await getPayoutSummary(actor.id, tx);
    if (locked.openPayout) throw new AppError("conflict", "Es gibt bereits einen offenen Auszahlungsantrag.");
    if (amount > locked.available) throw validationError(`Verfügbar sind derzeit ${locked.available} Münzen.`);
    const earnings = await getOrCreateAccount(tx, { kind: "creator_earnings", ownerUserId: actor.id, currency });
    const clearing = await getOrCreateAccount(tx, { kind: "system_payout_clearing", currency });
    let hold;
    try {
      hold = await postTransaction(tx, {
        idempotencyKey: `payout:${payoutId}:hold`,
        kind: "payout",
        currency,
        description: simulated ? "Auszahlungsantrag (Sandbox – kein Geld)" : "Auszahlungsantrag (reserviert)",
        referenceType: "payout",
        referenceId: payoutId,
        actorUserId: actor.id,
        entries: [
          { accountId: earnings.id, amount: -amount },
          { accountId: clearing.id, amount },
        ],
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) throw new InsufficientFundsError("Dein Guthaben reicht für diesen Betrag nicht aus.");
      throw error;
    }
    const [row] = await tx
      .insert(payouts)
      .values({
        id: payoutId,
        creatorUserId: actor.id,
        amount,
        currency,
        status: "requested",
        provider: simulated ? "sandbox" : getEnv().PAYOUT_PROVIDER,
        ledgerTransactionId: hold.transactionId,
        simulated,
        idempotencyKey: `payout:${payoutId}`,
        destinationMasked: `${profile[0]!.country} ••• ${profile[0]!.ibanLast4}`,
        fiatAmountCents,
        fiatCurrency: "EUR",
        centsPer100Coins: settings.payout.centsPer100Coins,
      })
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "payout.requested",
      targetType: "payout",
      targetId: payoutId,
      metadata: { amount, currency, fiatAmountCents, simulated },
      ipHash: context.ipHash,
    });
    // Auszahlung kurz nach Kontoänderung → zusätzliche Prüfung durch Finanzen
    if (Date.now() - profile[0]!.updatedAt.getTime() < RISK_THRESHOLDS.payoutDestinationCooldownHours * 3600_000) {
      const [first] = await tx.select({ count: sql<number>`count(*)::int` }).from(payouts).where(eq(payouts.creatorUserId, actor.id));
      if ((first?.count ?? 0) > 1) {
        await recordRiskEvent(tx, { userId: actor.id, kind: "payout_after_destination_change", severity: "medium", details: { payoutId, amount } });
      }
    }
    await notifyStaff(tx, "admin.payouts.manage", {
      type: "payout.requested",
      title: "Neuer Auszahlungsantrag",
      body: `${amount} ${currency === "TEST_COIN" ? "Testmünzen" : "Münzen"} (${formatEuroCents(fiatAmountCents)}${simulated ? ", Sandbox" : ""}).`,
      linkPath: `/admin/payouts/${payoutId}`,
    });
    await queueEmail({ userId: actor.id, template: "payout_requested", data: { coins: amount, amount: formatEuroCents(fiatAmountCents), simulated } }, tx);
    return row!;
    })
    .catch((error: unknown) => {
      // Datenbankregel „ein offener Antrag je Creator“ als letzte Absicherung
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new AppError("conflict", "Es gibt bereits einen offenen Auszahlungsantrag.");
      throw error;
    });
  return created;
}

/** Creator zieht einen noch nicht freigegebenen Antrag zurück. */
export async function cancelPayout(actor: Actor, payoutId: string) {
  if (!hasPermission(actor, "studio.payouts.manage")) throw forbidden();
  await releaseHold({ payoutId, actorUserId: actor.id, ownerUserId: actor.id, from: ["requested"], status: "cancelled", reason: "Vom Creator zurückgezogen" });
}

// ── Prüfung und Ausführung (Finanzen) ───────────────────────────────────────

async function lockPayout(tx: Transaction, payoutId: string) {
  if (!z.uuid().safeParse(payoutId).success) throw notFound("Auszahlung nicht gefunden.");
  const [row] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for("update");
  if (!row) throw notFound("Auszahlung nicht gefunden.");
  return row;
}

async function releaseHold(input: {
  payoutId: string;
  actorUserId: string;
  ownerUserId?: string;
  from: readonly ("requested" | "approved" | "processing")[];
  status: "rejected" | "failed" | "cancelled";
  reason: string;
  ipHash?: string | null;
}) {
  await getDb().transaction(async (tx) => {
    const payout = await lockPayout(tx, input.payoutId);
    if (input.ownerUserId && payout.creatorUserId !== input.ownerUserId) throw notFound("Auszahlung nicht gefunden.");
    if (!input.from.includes(payout.status as "requested")) throw new AppError("invalid_state", "Die Auszahlung kann in diesem Status nicht geändert werden.");
    const earnings = await getOrCreateAccount(tx, { kind: "creator_earnings", ownerUserId: payout.creatorUserId, currency: payout.currency });
    const clearing = await getOrCreateAccount(tx, { kind: "system_payout_clearing", currency: payout.currency });
    const release = await postTransaction(tx, {
      idempotencyKey: `payout:${payout.id}:release`,
      kind: "payout",
      currency: payout.currency,
      description: `Auszahlung nicht ausgeführt – Reservierung freigegeben (${input.status === "cancelled" ? "zurückgezogen" : input.status === "rejected" ? "abgelehnt" : "fehlgeschlagen"})`,
      referenceType: "payout",
      referenceId: payout.id,
      actorUserId: input.actorUserId,
      reversalOfId: payout.ledgerTransactionId ?? undefined,
      entries: [
        { accountId: clearing.id, amount: -payout.amount },
        { accountId: earnings.id, amount: payout.amount },
      ],
    });
    await tx
      .update(payouts)
      .set({
        status: input.status,
        settlementTransactionId: release.transactionId,
        ...(input.status === "rejected" ? { rejectionReason: input.reason, reviewedById: input.actorUserId, reviewedAt: new Date() } : {}),
        ...(input.status === "failed" ? { failureReason: input.reason, processedById: input.actorUserId, processedAt: new Date() } : {}),
      })
      .where(eq(payouts.id, payout.id));
    await writeAuditLog(tx, { actorUserId: input.actorUserId, action: `payout.${input.status}`, targetType: "payout", targetId: payout.id, reason: input.reason, ipHash: input.ipHash });
    if (input.status !== "cancelled") {
      await notify(tx, {
        userId: payout.creatorUserId,
        type: `payout.${input.status}`,
        title: "Auszahlung nicht ausgeführt",
        body: `Begründung: ${input.reason}. Die Münzen stehen dir wieder zur Verfügung.`,
        linkPath: "/studio/payouts",
      });
      await queueEmail({ userId: payout.creatorUserId, template: "payout_rejected", data: { coins: payout.amount, reason: input.reason, simulated: payout.simulated } }, tx);
    }
  });
}

export async function approvePayout(input: { staffUserId: string; payoutId: string; note: string; ipHash?: string | null }) {
  await getDb().transaction(async (tx) => {
    const payout = await lockPayout(tx, input.payoutId);
    if (payout.status !== "requested") throw new AppError("invalid_state", "Nur beantragte Auszahlungen können freigegeben werden.");
    if (payout.creatorUserId === input.staffUserId) throw forbidden();
    await tx.update(payouts).set({ status: "approved", reviewedById: input.staffUserId, reviewedAt: new Date() }).where(eq(payouts.id, payout.id));
    await writeAuditLog(tx, { actorUserId: input.staffUserId, action: "payout.approved", targetType: "payout", targetId: payout.id, reason: input.note.trim() || undefined, ipHash: input.ipHash });
  });
}

export async function rejectPayout(input: { staffUserId: string; payoutId: string; reason: string; ipHash?: string | null }) {
  const reason = input.reason.trim();
  if (reason.length < 10) throw validationError("Bitte begründe die Ablehnung (mind. 10 Zeichen).");
  await releaseHold({ payoutId: input.payoutId, actorUserId: input.staffUserId, from: ["requested", "approved"], status: "rejected", reason, ipHash: input.ipHash });
}

/**
 * Ausführung über den Auszahlungsanbieter. Im Testmodus führt der Sandbox-Anbieter
 * die Auszahlung nur simuliert aus (Ergebnis wählbar: Erfolg oder Fehlschlag).
 */
export async function processPayout(input: { staffUserId: string; payoutId: string; outcome: "success" | "failure"; note: string; ipHash?: string | null }) {
  const settings = await getSettings();
  const availability = payoutAvailability();
  if (!availability.available) throw featureUnavailable(availability.reason ?? "Auszahlungen sind nicht verfügbar.");
  const note = input.note.trim();
  if (input.outcome === "failure") {
    if (note.length < 10) throw validationError("Bitte beschreibe den Fehler (mind. 10 Zeichen).");
    const [current] = await getDb().select().from(payouts).where(eq(payouts.id, input.payoutId)).limit(1);
    if (current && settings.payout.requireFourEyes && current.reviewedById === input.staffUserId) {
      throw forbidden("Vier-Augen-Prinzip: Die Ausführung muss eine andere Person als die Freigabe vornehmen.");
    }
    await releaseHold({ payoutId: input.payoutId, actorUserId: input.staffUserId, from: ["approved"], status: "failed", reason: note, ipHash: input.ipHash });
    return;
  }
  await getDb().transaction(async (tx) => {
    const payout = await lockPayout(tx, input.payoutId);
    if (payout.status !== "approved") throw new AppError("invalid_state", "Nur freigegebene Auszahlungen können ausgeführt werden.");
    if (settings.payout.requireFourEyes && payout.reviewedById === input.staffUserId) {
      throw forbidden("Vier-Augen-Prinzip: Die Ausführung muss eine andere Person als die Freigabe vornehmen.");
    }
    if (!payout.simulated || payout.provider !== "sandbox") throw featureUnavailable("Für echte Auszahlungen ist kein Anbieter freigegeben.");
    const destination = await decryptedIban(tx, payout.creatorUserId);
    if (!destination) throw new AppError("invalid_state", "Das Auszahlungskonto fehlt.");
    // Sandbox-Anbieter: keine Geldbewegung, nur eine Referenz.
    const providerReference = `sandbox_po_${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;
    const clearing = await getOrCreateAccount(tx, { kind: "system_payout_clearing", currency: payout.currency });
    const settled = await getOrCreateAccount(tx, { kind: "system_payout_settled", currency: payout.currency });
    const settlement = await postTransaction(tx, {
      idempotencyKey: `payout:${payout.id}:settle`,
      kind: "payout_settlement",
      currency: payout.currency,
      description: payout.simulated ? "Auszahlung ausgeführt (Sandbox – kein Geld bewegt)" : "Auszahlung ausgeführt",
      referenceType: "payout",
      referenceId: payout.id,
      actorUserId: input.staffUserId,
      entries: [
        { accountId: clearing.id, amount: -payout.amount },
        { accountId: settled.id, amount: payout.amount },
      ],
    });
    await tx
      .update(payouts)
      .set({ status: "completed", providerReference, settlementTransactionId: settlement.transactionId, processedById: input.staffUserId, processedAt: new Date() })
      .where(eq(payouts.id, payout.id));
    await writeAuditLog(tx, {
      actorUserId: input.staffUserId,
      action: "payout.completed",
      targetType: "payout",
      targetId: payout.id,
      reason: note || undefined,
      metadata: { providerReference, simulated: payout.simulated },
      ipHash: input.ipHash,
    });
    const amountText = formatEuroCents(payout.fiatAmountCents ?? 0);
    await notify(tx, {
      userId: payout.creatorUserId,
      type: "payout.completed",
      title: payout.simulated ? "Sandbox-Auszahlung ausgeführt" : "Auszahlung ausgeführt",
      body: `${payout.amount} Münzen (${amountText})${payout.simulated ? " – simuliert, es wurde kein Geld überwiesen." : "."}`,
      linkPath: "/studio/payouts",
    });
    await queueEmail({ userId: payout.creatorUserId, template: "payout_completed", data: { coins: payout.amount, amount: amountText, simulated: payout.simulated, reference: providerReference } }, tx);
  });
}

// ── Übersichten ─────────────────────────────────────────────────────────────

export async function listPayoutsForCreator(userId: string, limit = 50) {
  return getDb().select().from(payouts).where(eq(payouts.creatorUserId, userId)).orderBy(desc(payouts.createdAt)).limit(limit);
}

export async function listPayoutsForStaff(filter: { status?: (typeof payouts.$inferSelect)["status"] } = {}, limit = 100) {
  return getDb()
    .select({ payout: payouts, username: users.username })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.creatorUserId))
    .where(filter.status ? eq(payouts.status, filter.status) : undefined)
    .orderBy(sql`CASE ${payouts.status} WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END`, desc(payouts.createdAt))
    .limit(limit);
}

export async function getPayoutForStaff(payoutId: string) {
  if (!z.uuid().safeParse(payoutId).success) return null;
  const [row] = await getDb()
    .select({ payout: payouts, username: users.username, userStatus: users.status })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.creatorUserId))
    .where(eq(payouts.id, payoutId))
    .limit(1);
  if (!row) return null;
  const profile = await getPayoutProfile(row.payout.creatorUserId);
  return { ...row, profile };
}

/** Übersicht für das Studio (Kompatibilität mit bestehender Seite). */
export async function getPayoutOverview(creatorUserId: string) {
  const [summary, history, profile] = await Promise.all([getPayoutSummary(creatorUserId), listPayoutsForCreator(creatorUserId, 20), getPayoutProfile(creatorUserId)]);
  return { availability: payoutAvailability(), summary, history, profile };
}
