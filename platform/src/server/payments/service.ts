import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { isTestMode } from "@/config/env";
import { getDb } from "@/server/db/client";
import { coinPackages, ledgerEntries, ledgerTransactions, paymentEvents, paymentOrders, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { randomToken } from "@/server/crypto";
import { AppError, featureUnavailable, notFound } from "@/server/errors";
import { InsufficientFundsError, getOrCreateAccount, postTransaction } from "@/server/ledger/service";
import { log } from "@/server/log";
import { notify, notifyAdmins } from "@/server/notifications/service";
import { getPaymentProvider, signSimulatedPayload, type PaymentEvent } from "./provider";

/**
 * Kaufabwicklung von Münzpaketen.
 *
 * Im Prototyp gibt es KEINE echten Käufe. Nur Admins können im Testmodus den
 * Zahlungsfluss simulieren; gutgeschrieben werden ausschließlich Testmünzen.
 * Webhooks werden über (provider, providerEventId) idempotent verarbeitet.
 */

export async function listCoinPackages() {
  return getDb().select().from(coinPackages).where(eq(coinPackages.active, true)).orderBy(asc(coinPackages.sortOrder));
}

/** Legt eine simulierte Bestellung an (nur Admin, nur Testmodus). */
export async function createSimulatedOrder(input: { adminUserId: string; customerUserId: string; packageId: string; ipHash?: string | null }) {
  const provider = getPaymentProvider();
  if (!provider || provider.isReal || !isTestMode()) {
    throw featureUnavailable("Der simulierte Zahlungsfluss ist nur im Testmodus verfügbar.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const [customer] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.customerUserId)).limit(1);
    if (customer?.role !== "customer") throw new AppError("invalid_state", "Bestellungen sind nur für Kundenkonten möglich.");
    const [pkg] = await tx.select().from(coinPackages).where(eq(coinPackages.id, input.packageId)).limit(1);
    if (!pkg?.active) throw notFound("Münzpaket nicht gefunden.");
    const [order] = await tx
      .insert(paymentOrders)
      .values({
        userId: input.customerUserId,
        packageId: pkg.id,
        coins: pkg.coins,
        priceCents: pkg.priceCents,
        currency: pkg.currency,
        provider: provider.name,
        status: "created",
        idempotencyKey: `order:${randomToken(16)}`,
        simulated: true,
      })
      .returning();
    const checkout = await provider.createCheckout({ orderId: order!.id, priceCents: pkg.priceCents, currency: pkg.currency });
    const [pending] = await tx
      .update(paymentOrders)
      .set({ status: "pending", providerReference: checkout.providerReference })
      .where(eq(paymentOrders.id, order!.id))
      .returning();
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: "payment.simulated_order_created",
      targetType: "payment_order",
      targetId: order!.id,
      metadata: { packageCode: pkg.code, coins: pkg.coins, simulated: true },
      ipHash: input.ipHash,
    });
    return pending!;
  });
}

/** Erzeugt ein signiertes simuliertes Anbieter-Ereignis (wie es ein Webhook liefern würde). */
export function buildSimulatedEvent(order: { id: string; providerReference: string | null }, type: PaymentEvent["type"], failureReason?: string) {
  const event: PaymentEvent = {
    id: `evt_${randomToken(12)}`,
    type,
    orderId: order.id,
    providerReference: order.providerReference ?? "",
    failureReason,
    createdAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(event);
  return { rawBody, signature: signSimulatedPayload(rawBody), event };
}

export type WebhookResult = "processed" | "duplicate" | "ignored";

/** Verarbeitet ein Anbieter-Ereignis idempotent. Signatur muss vorab geprüft sein. */
export async function processPaymentEvent(providerName: string, event: PaymentEvent): Promise<WebhookResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [stored] = await tx
      .insert(paymentEvents)
      .values({
        provider: providerName,
        providerEventId: event.id,
        type: event.type,
        orderId: event.orderId,
        payload: { type: event.type, orderId: event.orderId, failureReason: event.failureReason ?? null },
      })
      .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] })
      .returning({ id: paymentEvents.id });
    if (!stored) return "duplicate";

    const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, event.orderId)).for("update");
    if (!order || order.provider !== providerName || order.providerReference !== event.providerReference) {
      log.warn("payment.event_order_mismatch", { eventId: event.id });
      await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, stored.id));
      return "ignored";
    }

    let result: WebhookResult = "processed";
    if (event.type === "payment.confirmed") {
      if (order.status === "pending" || order.status === "created") {
        const currency = order.simulated ? "TEST_COIN" : "COIN";
        const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: order.userId, currency });
        const clearing = await getOrCreateAccount(tx, { kind: "system_payment_clearing", currency });
        const posted = await postTransaction(tx, {
          idempotencyKey: `purchase:${order.id}`,
          kind: "purchase",
          currency,
          description: order.simulated ? "Simulierter Kauf (keine echte Zahlung)" : "Münzkauf",
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
          .set({ status: "confirmed", ledgerTransactionId: posted.transactionId })
          .where(eq(paymentOrders.id, order.id));
        await notify(tx, {
          userId: order.userId,
          type: "payment.confirmed",
          title: "Simulierter Kauf bestätigt",
          body: `${order.coins} Testmünzen wurden gutgeschrieben. Es wurde kein echtes Geld bewegt.`,
          linkPath: "/account/wallet",
        });
      } else {
        result = "ignored";
      }
    } else if (event.type === "payment.failed") {
      if (order.status === "pending" || order.status === "created") {
        await tx
          .update(paymentOrders)
          .set({ status: "failed", failureReason: event.failureReason ?? "Zahlung fehlgeschlagen" })
          .where(eq(paymentOrders.id, order.id));
      } else {
        result = "ignored";
      }
    } else if (event.type === "payment.charged_back") {
      if (order.status === "confirmed" && order.ledgerTransactionId) {
        const entries = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, order.ledgerTransactionId));
        try {
          await tx.transaction((sp) =>
            postTransaction(sp, {
              idempotencyKey: `chargeback:${order.ledgerTransactionId}`,
              kind: "chargeback",
              currency: order.simulated ? "TEST_COIN" : "COIN",
              description: "Rückbuchung durch Zahlungsanbieter (simuliert)",
              referenceType: "payment_order",
              referenceId: order.id,
              reversalOfId: order.ledgerTransactionId!,
              entries: entries.map((entry) => ({ accountId: entry.accountId, amount: -entry.amount })),
            }),
          );
        } catch (error) {
          if (!(error instanceof InsufficientFundsError)) throw error;
          // Guthaben bereits verbraucht → Klärungsfall für Admins (Geschäftsregel offen).
          await notifyAdmins(tx, {
            type: "payment.chargeback_shortfall",
            title: "Rückbuchung mit Fehlbetrag",
            body: `Bestellung ${order.id}: Das Guthaben reicht für die Rückbuchung nicht aus. Manuelle Prüfung erforderlich.`,
            linkPath: "/admin/transactions",
          });
        }
        await tx.update(paymentOrders).set({ status: "charged_back" }).where(eq(paymentOrders.id, order.id));
      } else {
        result = "ignored";
      }
    } else {
      // payment.pending: Status bleibt, Ereignis wird nur protokolliert.
      result = "ignored";
    }
    await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, stored.id));
    return result;
  });
}

/** Einstieg für Webhook-Route: Signatur prüfen, dann idempotent verarbeiten. */
export async function handlePaymentWebhook(rawBody: string, signature: string | null): Promise<WebhookResult | "invalid"> {
  const provider = getPaymentProvider();
  if (!provider) return "invalid";
  const event = provider.verifyWebhook(rawBody, signature);
  if (!event) return "invalid";
  return processPaymentEvent(provider.name, event);
}

export async function listRecentOrders(limit = 50) {
  return getDb()
    .select({
      id: paymentOrders.id,
      status: paymentOrders.status,
      coins: paymentOrders.coins,
      priceCents: paymentOrders.priceCents,
      currency: paymentOrders.currency,
      simulated: paymentOrders.simulated,
      createdAt: paymentOrders.createdAt,
      username: users.username,
      packageName: coinPackages.name,
    })
    .from(paymentOrders)
    .innerJoin(users, eq(users.id, paymentOrders.userId))
    .innerJoin(coinPackages, eq(coinPackages.id, paymentOrders.packageId))
    .orderBy(desc(paymentOrders.createdAt))
    .limit(limit);
}

export async function getOrder(orderId: string) {
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
