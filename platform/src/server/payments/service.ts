import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv, isTestMode } from "@/config/env";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { coinPackages, ledgerAccounts, ledgerEntries, ledgerTransactions, paymentEvents, paymentOrders, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { assertViewerAgeAccess } from "@/server/age/service";
import { randomToken, safeEqual } from "@/server/crypto";
import { AppError, PG_UNIQUE_VIOLATION, featureUnavailable, forbidden, notFound, pgErrorCode, validationError } from "@/server/errors";
import { getOrCreateAccount, postTransaction, realCoinsEnabled } from "@/server/ledger/service";
import { log } from "@/server/log";
import { notify, notifyStaff } from "@/server/notifications/service";
import { consumeRateLimit, enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { checkPaymentFailures, checkPurchasePatterns, recordRiskEvent } from "@/server/risk/service";
import { getSettings } from "@/server/settings/service";
import { queueEmail } from "@/server/email/service";
import { formatEuroCents } from "@/lib/utils";
import {
  SANDBOX_SIGNATURE_HEADER,
  getPaymentProvider,
  getPaymentProviderByName,
  sandboxCheckoutToken,
  signSandboxPayload,
  type NormalizedPaymentEvent,
  type NormalizedPaymentEventType,
  type PaymentProvider,
  type SandboxEvent,
  type WebhookRequest,
  type WebhookResult,
} from "./provider";

/**
 * Kauf von Münzpaketen.
 *
 * Ablauf: Kunde wählt Paket → Bestellung „pending“ → Weiterleitung zum Anbieter
 * (bzw. zur Sandbox-Kasse) → signiertes Server-zu-Server-Ereignis → Gutschrift.
 * Die Rückkehr in den Browser zeigt nur den Status an und schreibt NIE etwas gut.
 *
 * Im Testmodus ist ausschließlich der Sandbox-Anbieter aktiv; es werden nur
 * Testmünzen (TEST_COIN) ohne Geldwert gutgeschrieben.
 */

export type PaymentMode = {
  provider: PaymentProvider | null;
  available: boolean;
  simulated: boolean;
  reason?: string;
};

/** Ist ein Kauf derzeit technisch und rechtlich zulässig? */
export function paymentMode(): PaymentMode {
  const provider = getPaymentProvider();
  if (!provider) return { provider: null, available: false, simulated: false, reason: "Es ist kein Zahlungsanbieter eingerichtet." };
  if (provider.movesRealMoney && !realCoinsEnabled()) {
    return {
      provider,
      available: false,
      simulated: false,
      reason:
        "Echtzahlungen sind gesperrt, bis der Zahlungsanbieter dieses Geschäftsmodell schriftlich freigegeben hat und die rechtliche Prüfung abgeschlossen ist.",
    };
  }
  if (!provider.movesRealMoney && !isTestMode()) {
    return { provider, available: false, simulated: true, reason: "Simulierte Zahlungen sind nur im Testmodus verfügbar." };
  }
  return { provider, available: true, simulated: !provider.movesRealMoney };
}

// ── Münzpakete ──────────────────────────────────────────────────────────────

export async function listCoinPackages(options: { includeInactive?: boolean } = {}) {
  const query = getDb().select().from(coinPackages);
  return (options.includeInactive ? query : query.where(eq(coinPackages.active, true))).orderBy(asc(coinPackages.sortOrder), asc(coinPackages.coins));
}

export const packageSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Kürzel: Kleinbuchstaben, Ziffern und Bindestriche.").max(40),
  name: z.string().trim().min(2, "Name zu kurz.").max(40, "Name zu lang."),
  coins: z.coerce.number().int().min(10, "Mindestens 10 Münzen.").max(1_000_000),
  priceCents: z.coerce.number().int().min(100, "Mindestens 1,00 €.").max(100_000, "Höchstens 1.000,00 €."),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean(),
});

/** Anlegen/Ändern von Paketen. Laufende Bestellungen behalten ihren Preis-Snapshot. */
export async function upsertCoinPackage(staffUserId: string, raw: unknown, ipHash?: string | null) {
  const parsed = packageSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiges Paket.");
  const input = parsed.data;
  try {
    await getDb().transaction(async (tx) => {
      const [previous] = await tx.select().from(coinPackages).where(eq(coinPackages.code, input.code)).limit(1);
      await tx
        .insert(coinPackages)
        .values({ ...input, currency: "EUR", isExample: false })
        .onConflictDoUpdate({
          target: coinPackages.code,
          set: { name: input.name, coins: input.coins, priceCents: input.priceCents, sortOrder: input.sortOrder, active: input.active, isExample: false },
        });
      await writeAuditLog(tx, {
        actorUserId: staffUserId,
        action: previous ? "package.update" : "package.create",
        targetType: "coin_package",
        targetId: input.code,
        metadata: { previous: previous ? { coins: previous.coins, priceCents: previous.priceCents, active: previous.active } : null, next: input },
        ipHash,
      });
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new AppError("conflict", "Kürzel bereits vergeben.");
    throw error;
  }
}

// ── Checkout ────────────────────────────────────────────────────────────────

/** Summe bestätigter bzw. offener Käufe seit `since` (für Kauflimits). */
async function purchasedSince(userId: string, since: Date, executor: Executor = getDb()) {
  const [row] = await executor
    .select({ total: sql<number>`coalesce(sum(${paymentOrders.priceCents}), 0)::int` })
    .from(paymentOrders)
    .where(and(eq(paymentOrders.userId, userId), inArray(paymentOrders.status, ["confirmed", "pending"]), gte(paymentOrders.createdAt, since)));
  return row?.total ?? 0;
}

export async function createCheckout(actor: Actor, packageId: string, context: { ipHash?: string | null } = {}) {
  if (!hasPermission(actor, "wallet.purchase")) {
    throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  if (actor.role !== "customer") throw forbidden("Münzen können nur mit einem Kundenkonto gekauft werden.");
  const settings = await getSettings();
  if (!settings.featureFlags.purchases) throw featureUnavailable("Käufe sind derzeit deaktiviert.");
  const mode = paymentMode();
  if (!mode.available || !mode.provider) throw featureUnavailable(mode.reason ?? "Käufe sind derzeit nicht möglich.");
  await assertViewerAgeAccess(actor);
  await enforceRateLimit(`checkout:${actor.id}`, RATE_LIMITS.checkoutPerUser);
  if (!z.uuid().safeParse(packageId).success) throw notFound("Münzpaket nicht gefunden.");

  const [pkg] = await getDb().select().from(coinPackages).where(eq(coinPackages.id, packageId)).limit(1);
  if (!pkg?.active) throw notFound("Münzpaket nicht gefunden.");

  const now = Date.now();
  const [daily, monthly] = await Promise.all([
    purchasedSince(actor.id, new Date(now - 24 * 3600_000)),
    purchasedSince(actor.id, new Date(now - 30 * 24 * 3600_000)),
  ]);
  if (daily + pkg.priceCents > settings.payments.dailyLimitCents) {
    throw new AppError("invalid_state", `Dein Tageslimit von ${formatEuroCents(settings.payments.dailyLimitCents)} wäre überschritten.`);
  }
  if (monthly + pkg.priceCents > settings.payments.monthlyLimitCents) {
    throw new AppError("invalid_state", `Dein Monatslimit von ${formatEuroCents(settings.payments.monthlyLimitCents)} wäre überschritten.`);
  }

  const provider = mode.provider;
  const appUrl = getEnv().APP_URL;
  const order = await getDb().transaction(async (tx) => {
    // Parallele Checkouts derselben Person serialisieren und Limits unter Sperre erneut prüfen.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.id)).for("update");
    const [lockedDaily, lockedMonthly] = await Promise.all([
      purchasedSince(actor.id, new Date(now - 24 * 3600_000), tx),
      purchasedSince(actor.id, new Date(now - 30 * 24 * 3600_000), tx),
    ]);
    if (lockedDaily + pkg.priceCents > settings.payments.dailyLimitCents || lockedMonthly + pkg.priceCents > settings.payments.monthlyLimitCents) {
      throw new AppError("invalid_state", "Dein Kauflimit wäre überschritten.");
    }
    const [created] = await tx
      .insert(paymentOrders)
      .values({
        userId: actor.id,
        packageId: pkg.id,
        coins: pkg.coins,
        priceCents: pkg.priceCents,
        currency: pkg.currency,
        provider: provider.name,
        status: "created",
        idempotencyKey: `order:${randomToken(16)}`,
        simulated: mode.simulated,
      })
      .returning();
    const checkout = provider.createCheckout({
      orderId: created!.id,
      priceCents: pkg.priceCents,
      currency: pkg.currency,
      description: `${pkg.coins} Münzen – ${pkg.name}`,
      successUrl: `${appUrl}/account/wallet/return?order=${created!.id}`,
      declineUrl: `${appUrl}/account/wallet/return?order=${created!.id}`,
    });
    const [pending] = await tx
      .update(paymentOrders)
      .set({ status: "pending", providerReference: checkout.providerReference })
      .where(eq(paymentOrders.id, created!.id))
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "payment.checkout_started",
      targetType: "payment_order",
      targetId: created!.id,
      metadata: { packageCode: pkg.code, coins: pkg.coins, priceCents: pkg.priceCents, provider: provider.name, simulated: mode.simulated },
      ipHash: context.ipHash,
    });
    return { order: pending!, redirectUrl: checkout.redirectUrl };
  });
  return order;
}

export async function getOrderForUser(actor: Actor, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) return null;
  const [row] = await getDb()
    .select({ order: paymentOrders, packageName: coinPackages.name })
    .from(paymentOrders)
    .innerJoin(coinPackages, eq(coinPackages.id, paymentOrders.packageId))
    .where(eq(paymentOrders.id, orderId))
    .limit(1);
  // Fremde Bestellungen sind nicht auffindbar (kein Hinweis auf Existenz).
  if (!row || row.order.userId !== actor.id) return null;
  return row;
}

export async function listOrdersForUser(userId: string, limit = 50) {
  return getDb()
    .select({
      id: paymentOrders.id,
      status: paymentOrders.status,
      coins: paymentOrders.coins,
      priceCents: paymentOrders.priceCents,
      currency: paymentOrders.currency,
      simulated: paymentOrders.simulated,
      provider: paymentOrders.provider,
      failureReason: paymentOrders.failureReason,
      createdAt: paymentOrders.createdAt,
      updatedAt: paymentOrders.updatedAt,
      packageName: coinPackages.name,
    })
    .from(paymentOrders)
    .innerJoin(coinPackages, eq(coinPackages.id, paymentOrders.packageId))
    .where(eq(paymentOrders.userId, userId))
    .orderBy(desc(paymentOrders.createdAt))
    .limit(limit);
}

// ── Ereignisverarbeitung (Webhooks) ─────────────────────────────────────────

type OrderRow = typeof paymentOrders.$inferSelect;

async function markEventProcessed(tx: Transaction, eventRowId: string) {
  await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, eventRowId));
}

/**
 * Macht einen bestätigten Kauf rückgängig (Erstattung oder Rückbuchung beim
 * Anbieter). Sind die Münzen bereits verbraucht, trägt die Plattform den
 * Fehlbetrag (Konto platform_revenue) – Creator-Einnahmen bleiben unberührt.
 */
async function reversePurchase(tx: Transaction, order: OrderRow, kind: "refund" | "chargeback") {
  const currency = order.simulated ? "TEST_COIN" : "COIN";
  const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: order.userId, currency });
  const clearing = await getOrCreateAccount(tx, { kind: "system_payment_clearing", currency });
  const platform = await getOrCreateAccount(tx, { kind: "platform_revenue", currency });
  const [lockedWallet] = await tx.select({ balance: ledgerAccounts.balance }).from(ledgerAccounts).where(eq(ledgerAccounts.id, wallet.id)).for("update");
  const fromWallet = Math.min(Math.max(lockedWallet?.balance ?? 0, 0), order.coins);
  const shortfall = order.coins - fromWallet;
  const entries = [{ accountId: clearing.id, amount: order.coins }];
  if (fromWallet > 0) entries.push({ accountId: wallet.id, amount: -fromWallet });
  if (shortfall > 0) entries.push({ accountId: platform.id, amount: -shortfall });
  const label = kind === "refund" ? "Erstattung durch Zahlungsanbieter" : "Rückbuchung durch Zahlungsanbieter";
  const posted = await postTransaction(tx, {
    idempotencyKey: `${kind}:${order.ledgerTransactionId}`,
    kind,
    currency,
    description: `${label}${order.simulated ? " (simuliert)" : ""}${shortfall > 0 ? ` – ${shortfall} Münzen bereits verbraucht` : ""}`,
    referenceType: "payment_order",
    referenceId: order.id,
    reversalOfId: order.ledgerTransactionId!,
    entries,
  });
  return { transactionId: posted.transactionId, shortfall };
}

/** Verarbeitet ein signaturgeprüftes Anbieter-Ereignis genau einmal. */
export async function processPaymentEvent(providerName: string, event: NormalizedPaymentEvent): Promise<Exclude<WebhookResult, "invalid">> {
  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, event.orderId)).for("update");
    const [stored] = await tx
      .insert(paymentEvents)
      .values({
        provider: providerName,
        providerEventId: event.id,
        type: event.type,
        orderId: order ? order.id : null,
        payload: {
          type: event.type,
          orderId: event.orderId,
          providerReference: event.providerReference,
          amountCents: event.amountCents,
          currency: event.currency,
          failureReason: event.failureReason ?? null,
        },
      })
      .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] })
      .returning({ id: paymentEvents.id });
    if (!stored) return { result: "duplicate" as const };

    if (!order || order.provider !== providerName) {
      log.warn("payment.event_unknown_order", { eventId: event.id });
      await markEventProcessed(tx, stored.id);
      return { result: "ignored" as const };
    }
    if (order.providerReference && event.providerReference && order.providerReference !== event.providerReference) {
      log.warn("payment.event_reference_mismatch", { eventId: event.id });
      await recordRiskEvent(tx, { userId: order.userId, kind: "payment_amount_mismatch", severity: "high", details: { orderId: order.id, reason: "reference" } });
      await markEventProcessed(tx, stored.id);
      return { result: "ignored" as const };
    }

    let result: Exclude<WebhookResult, "invalid" | "duplicate"> = "processed";
    let after: (() => Promise<void>) | undefined;
    switch (event.type) {
      case "payment.confirmed": {
        if (order.status !== "pending" && order.status !== "created" && order.status !== "failed") {
          result = "ignored";
          break;
        }
        // Betrag und Währung MÜSSEN der Bestellung entsprechen.
        if (event.amountCents !== order.priceCents || event.currency !== order.currency) {
          await tx
            .update(paymentOrders)
            .set({ status: "failed", failureReason: "Betrag/Währung weicht ab – manuelle Prüfung erforderlich" })
            .where(eq(paymentOrders.id, order.id));
          await recordRiskEvent(tx, {
            userId: order.userId,
            kind: "payment_amount_mismatch",
            severity: "high",
            details: { orderId: order.id, expectedCents: order.priceCents, reportedCents: event.amountCents, currency: event.currency },
          });
          result = "ignored";
          break;
        }
        const currency = order.simulated ? "TEST_COIN" : "COIN";
        const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: order.userId, currency });
        const clearing = await getOrCreateAccount(tx, { kind: "system_payment_clearing", currency });
        const posted = await postTransaction(tx, {
          idempotencyKey: `purchase:${order.id}`,
          kind: "purchase",
          currency,
          description: order.simulated ? "Münzkauf (Sandbox – keine echte Zahlung)" : "Münzkauf",
          referenceType: "payment_order",
          referenceId: order.id,
          actorUserId: order.userId,
          entries: [
            { accountId: clearing.id, amount: -order.coins },
            { accountId: wallet.id, amount: order.coins },
          ],
        });
        await tx
          .update(paymentOrders)
          .set({ status: "confirmed", ledgerTransactionId: posted.transactionId, providerReference: order.providerReference ?? event.providerReference, failureReason: null })
          .where(eq(paymentOrders.id, order.id));
        await notify(tx, {
          userId: order.userId,
          type: "payment.confirmed",
          title: order.simulated ? "Sandbox-Kauf bestätigt" : "Kauf bestätigt",
          body: order.simulated
            ? `${order.coins} Testmünzen wurden gutgeschrieben. Es wurde kein echtes Geld bewegt.`
            : `${order.coins} Münzen wurden gutgeschrieben.`,
          linkPath: "/account/wallet",
        });
        await checkPurchasePatterns(tx, { userId: order.userId, priceCents: order.priceCents });
        after = () => sendPaymentEmail(order, "confirmed");
        break;
      }
      case "payment.failed": {
        if (order.status !== "pending" && order.status !== "created") {
          result = "ignored";
          break;
        }
        await tx
          .update(paymentOrders)
          .set({ status: "failed", failureReason: (event.failureReason ?? "Zahlung fehlgeschlagen").slice(0, 200) })
          .where(eq(paymentOrders.id, order.id));
        await checkPaymentFailures(tx, order.userId);
        break;
      }
      case "payment.refunded":
      case "payment.charged_back": {
        if (order.status !== "confirmed" || !order.ledgerTransactionId) {
          if (event.type === "payment.charged_back") {
            await recordRiskEvent(tx, { userId: order.userId, kind: "chargeback", severity: "high", details: { orderId: order.id, orderStatus: order.status } });
          }
          result = "ignored";
          break;
        }
        const kind = event.type === "payment.refunded" ? "refund" : "chargeback";
        const reversal = await reversePurchase(tx, order, kind);
        await tx
          .update(paymentOrders)
          .set({ status: kind === "refund" ? "refunded" : "charged_back" })
          .where(eq(paymentOrders.id, order.id));
        if (kind === "chargeback") {
          await recordRiskEvent(tx, { userId: order.userId, kind: "chargeback", severity: "high", details: { orderId: order.id, shortfall: reversal.shortfall } });
        } else if (reversal.shortfall > 0) {
          await recordRiskEvent(tx, { userId: order.userId, kind: "refund_after_consumption", severity: "medium", details: { orderId: order.id, shortfall: reversal.shortfall } });
        }
        if (reversal.shortfall > 0) {
          await notifyStaff(tx, "admin.finance.reports", {
            type: "payment.reversal_shortfall",
            title: kind === "refund" ? "Erstattung nach Verbrauch" : "Rückbuchung nach Verbrauch",
            body: `Bestellung ${order.id}: ${reversal.shortfall} Münzen waren bereits verbraucht. Der Fehlbetrag wurde der Plattform belastet.`,
            linkPath: "/admin/finance",
          });
        }
        await notify(tx, {
          userId: order.userId,
          type: `payment.${kind}`,
          title: kind === "refund" ? "Kauf erstattet" : "Zahlung zurückgebucht",
          body:
            kind === "refund"
              ? `Der Kauf über ${order.coins} ${order.simulated ? "Testmünzen" : "Münzen"} wurde erstattet.`
              : "Die Zahlung wurde von deiner Bank zurückgebucht. Bitte wende dich bei Fragen an den Support.",
          linkPath: "/account/purchases",
        });
        if (kind === "refund") after = () => sendPaymentEmail(order, "refunded");
        break;
      }
      default:
        result = "ignored";
    }
    await markEventProcessed(tx, stored.id);
    return { result, after };
  });
  if ("after" in outcome && outcome.after) {
    await outcome.after().catch((error: unknown) => log.error("payment.email_failed", { error }));
  }
  return outcome.result;
}

async function sendPaymentEmail(order: OrderRow, kind: "confirmed" | "refunded") {
  await queueEmail({
    userId: order.userId,
    template: kind === "confirmed" ? "payment_confirmed" : "payment_refunded",
    data: {
      coins: order.coins,
      price: formatEuroCents(order.priceCents),
      simulated: order.simulated,
      orderId: order.id,
    },
  });
}

/** Einstieg für die Webhook-Route: Anbieter auflösen, Signatur prüfen, idempotent verarbeiten. */
export async function handlePaymentWebhook(providerName: string, request: WebhookRequest) {
  const provider = getPaymentProviderByName(providerName);
  if (!provider) return { result: "invalid" as const, response: { status: 404, body: "not found" } };
  const event = provider.parseWebhook(request);
  if (!event) {
    log.warn("payment.webhook_invalid", { provider: providerName });
    // Höchstens ein Risikosignal je 10 Minuten (Schutz vor Überflutung).
    const gate = await consumeRateLimit(`risk:webhook-invalid:${providerName}`, { limit: 1, windowSeconds: 600 });
    if (gate.allowed) {
      await recordRiskEvent(getDb(), { userId: null, kind: "webhook_invalid_signature", severity: "high", details: { provider: providerName } });
    }
    return { result: "invalid" as const, response: provider.webhookResponse("invalid") };
  }
  const result = await processPaymentEvent(provider.name, event);
  return { result, response: provider.webhookResponse(result) };
}

// ── Sandbox: simulierte Anbieter-Ereignisse ─────────────────────────────────

/** Erzeugt ein signiertes Sandbox-Ereignis, wie es ein Anbieter senden würde. */
export function buildSandboxEvent(
  order: { id: string; providerReference: string | null; priceCents: number; currency: string },
  type: NormalizedPaymentEventType,
  options: { failureReason?: string; amountCents?: number; timestamp?: number } = {},
) {
  const event: SandboxEvent = {
    id: `evt_${randomToken(12).replace(/[^A-Za-z0-9_-]/g, "")}`,
    type,
    orderId: order.id,
    providerReference: order.providerReference ?? `sim_${order.id.replace(/-/g, "").slice(0, 20)}`,
    amountCents: options.amountCents ?? order.priceCents,
    currency: order.currency,
    failureReason: options.failureReason,
  };
  const rawBody = JSON.stringify(event);
  return { rawBody, signature: signSandboxPayload(rawBody, options.timestamp), event };
}

export type SandboxTransport = (rawBody: string, signature: string) => Promise<{ status: number; body: string }>;

/** Zustellung wie bei einem echten Anbieter: HTTP-POST an die eigene Webhook-Route. */
const httpTransport: SandboxTransport = async (rawBody, signature) => {
  const response = await fetch(new URL("/api/webhooks/payments/simulated", getEnv().APP_URL), {
    method: "POST",
    headers: { "content-type": "application/json", [SANDBOX_SIGNATURE_HEADER]: signature },
    body: rawBody,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return { status: response.status, body: await response.text() };
};

function assertSandboxActive() {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== "simulated" || !isTestMode()) throw featureUnavailable("Die Sandbox-Kasse ist nur im Testmodus verfügbar.");
}

/** Sandbox-Kasse: Ergebnis der „Zahlung“ wird als signierter Webhook zugestellt. */
export async function completeSandboxCheckout(
  actor: Actor,
  input: { orderId: string; token: string; outcome: "success" | "failure" | "cancel" },
  transport: SandboxTransport = httpTransport,
) {
  assertSandboxActive();
  if (!safeEqual(sandboxCheckoutToken(input.orderId), input.token)) throw notFound("Bestellung nicht gefunden.");
  const row = await getOrderForUser(actor, input.orderId);
  if (!row) throw notFound("Bestellung nicht gefunden.");
  if (row.order.status !== "pending") throw new AppError("invalid_state", "Diese Bestellung ist bereits abgeschlossen.");
  const type: NormalizedPaymentEventType = input.outcome === "success" ? "payment.confirmed" : "payment.failed";
  const failureReason = input.outcome === "failure" ? "Zahlung abgelehnt (Sandbox)" : input.outcome === "cancel" ? "Zahlung abgebrochen" : undefined;
  const { rawBody, signature } = buildSandboxEvent(row.order, type, { failureReason });
  const delivered = await transport(rawBody, signature);
  if (delivered.status !== 200) {
    log.error("payment.sandbox_delivery_failed", { status: delivered.status });
    throw new AppError("invalid_state", "Die Sandbox-Benachrichtigung konnte nicht zugestellt werden. Bitte versuche es erneut.");
  }
  return { orderId: row.order.id };
}

/**
 * Erstattung eines Kaufs veranlassen (Mitarbeiter mit Ledger-Berechtigung).
 * Die Gutschrift-Umkehr erfolgt erst mit dem Ereignis des Anbieters.
 */
export async function requestOrderRefund(
  input: { staffUserId: string; orderId: string; reason: string; ipHash?: string | null },
  transport: SandboxTransport = httpTransport,
) {
  if (input.reason.trim().length < 10) throw validationError("Bitte begründe die Erstattung (mind. 10 Zeichen).");
  const [order] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, input.orderId)).limit(1);
  if (!order) throw notFound("Bestellung nicht gefunden.");
  if (order.status !== "confirmed") throw new AppError("invalid_state", "Nur bestätigte Käufe können erstattet werden.");
  const provider = getPaymentProviderByName(order.provider);
  if (!provider) throw featureUnavailable("Der Zahlungsanbieter dieser Bestellung ist nicht mehr konfiguriert.");
  await writeAuditLog(getDb(), {
    actorUserId: input.staffUserId,
    action: "payment.refund_requested",
    targetType: "payment_order",
    targetId: order.id,
    reason: input.reason.trim(),
    metadata: { provider: provider.name, priceCents: order.priceCents, simulated: order.simulated },
    ipHash: input.ipHash,
  });
  if (!provider.supportsRefundApi) {
    return {
      delivered: false,
      message: `Bitte die Erstattung im Händlerportal von ${provider.label} auslösen. Die Gutschrift wird nach Eingang der Anbieter-Benachrichtigung automatisch umgebucht.`,
    };
  }
  assertSandboxActive();
  const { rawBody, signature } = buildSandboxEvent(order, "payment.refunded");
  const delivered = await transport(rawBody, signature);
  if (delivered.status !== 200) throw new AppError("invalid_state", "Die Sandbox-Benachrichtigung konnte nicht zugestellt werden.");
  return { delivered: true, message: "Erstattung ausgeführt (Sandbox)." };
}

/** Nur Sandbox: Rückbuchung (Chargeback) durch den Anbieter simulieren. */
export async function simulateChargeback(
  input: { staffUserId: string; orderId: string; ipHash?: string | null },
  transport: SandboxTransport = httpTransport,
) {
  assertSandboxActive();
  const [order] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, input.orderId)).limit(1);
  if (!order?.simulated) throw notFound("Bestellung nicht gefunden.");
  await writeAuditLog(getDb(), {
    actorUserId: input.staffUserId,
    action: "payment.chargeback_simulated",
    targetType: "payment_order",
    targetId: order.id,
    ipHash: input.ipHash,
  });
  const { rawBody, signature } = buildSandboxEvent(order, "payment.charged_back");
  const delivered = await transport(rawBody, signature);
  if (delivered.status !== 200) throw new AppError("invalid_state", "Die Sandbox-Benachrichtigung konnte nicht zugestellt werden.");
}

// ── Übersichten ─────────────────────────────────────────────────────────────

export async function listRecentOrders(limit = 50, filter: { status?: OrderRow["status"] } = {}) {
  return getDb()
    .select({
      id: paymentOrders.id,
      status: paymentOrders.status,
      coins: paymentOrders.coins,
      priceCents: paymentOrders.priceCents,
      currency: paymentOrders.currency,
      simulated: paymentOrders.simulated,
      provider: paymentOrders.provider,
      providerReference: paymentOrders.providerReference,
      failureReason: paymentOrders.failureReason,
      createdAt: paymentOrders.createdAt,
      userId: paymentOrders.userId,
      username: users.username,
      packageName: coinPackages.name,
    })
    .from(paymentOrders)
    .innerJoin(users, eq(users.id, paymentOrders.userId))
    .innerJoin(coinPackages, eq(coinPackages.id, paymentOrders.packageId))
    .where(filter.status ? eq(paymentOrders.status, filter.status) : undefined)
    .orderBy(desc(paymentOrders.createdAt))
    .limit(limit);
}

export async function getOrder(orderId: string) {
  if (!z.uuid().safeParse(orderId).success) return null;
  const [order] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).limit(1);
  return order ?? null;
}

export async function hasPurchaseTransaction(orderId: string) {
  const rows = await getDb()
    .select({ id: ledgerTransactions.id })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.referenceType, "payment_order"), eq(ledgerTransactions.referenceId, orderId), eq(ledgerTransactions.kind, "purchase")));
  return rows.length;
}

/** Ledger-Einträge einer Bestellung (für die Admin-Detailansicht). */
export async function getOrderLedger(orderId: string) {
  return getDb()
    .select({ transactionId: ledgerTransactions.id, kind: ledgerTransactions.kind, createdAt: ledgerTransactions.createdAt, amount: ledgerEntries.amount, accountKind: ledgerAccounts.kind })
    .from(ledgerTransactions)
    .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, ledgerTransactions.id))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(and(eq(ledgerTransactions.referenceType, "payment_order"), eq(ledgerTransactions.referenceId, orderId)))
    .orderBy(asc(ledgerTransactions.createdAt));
}
