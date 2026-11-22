import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { chatMessages, ledgerEntries, ledgerTransactions, videoSessions } from "@/server/db/schema";
import { assertViewerAgeAccess } from "@/server/age/service";
import { hasPermission, type Actor } from "@/server/auth/permissions";
import { AppError, featureUnavailable, forbidden, notFound, validationError } from "@/server/errors";
import { splitCommission } from "@/server/ledger/commission";
import { activeCoinCurrency, currentCommissionBps, getOrCreateAccount, InsufficientFundsError, postTransaction } from "@/server/ledger/service";
import { notify } from "@/server/notifications/service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { publish, sessionTopic } from "@/server/realtime/hub";
import { RISK_THRESHOLDS, recordRiskEvent } from "@/server/risk/service";
import { getSettings } from "@/server/settings/service";
import { isBlockedBetween } from "@/server/social/service";
import { creatorMayOperate } from "@/server/video/service";

/**
 * Trinkgelder in Live-Streams und privaten Sitzungen.
 *
 * Aufteilung wie bei allen Leistungen: Creator-Anteil = floor(Betrag × (1 − Provision)),
 * Rest Plattform. Der Provisionssatz wird als Snapshot mit der Buchung gespeichert.
 * Wiederholte Anfragen (gleiche requestId) erzeugen keine doppelte Buchung.
 */

export const tipInputSchema = z.object({
  sessionId: z.uuid(),
  amount: z.coerce.number().int(),
  requestId: z.uuid(),
  message: z.string().trim().max(120).optional(),
});

export async function sendTip(actor: Actor, raw: unknown) {
  const parsed = tipInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError("Ungültige Eingabe.");
  const input = parsed.data;
  if (!hasPermission(actor, "tips.send")) throw forbidden(actor.emailVerified ? undefined : "Bitte bestätige zuerst deine E-Mail-Adresse.");
  const settings = await getSettings();
  if (!settings.featureFlags.tips) throw featureUnavailable("Trinkgelder sind derzeit deaktiviert.");
  if (input.amount < settings.pricing.tipMin || input.amount > settings.pricing.tipMax) {
    throw validationError(`Trinkgelder sind zwischen ${settings.pricing.tipMin} und ${settings.pricing.tipMax} Münzen möglich.`);
  }
  await assertViewerAgeAccess(actor);
  await enforceRateLimit(`tips:${actor.id}`, RATE_LIMITS.tipsPerUser);

  const [session] = await getDb().select().from(videoSessions).where(eq(videoSessions.id, input.sessionId)).limit(1);
  if (!session) throw notFound("Sitzung nicht gefunden.");
  if (session.status !== "active") throw new AppError("invalid_state", "Trinkgelder sind nur während einer laufenden Sitzung möglich.");
  if (session.kind === "private_chat" && session.customerUserId !== actor.id) throw notFound("Sitzung nicht gefunden.");
  if (session.creatorUserId === actor.id) throw forbidden();

  const currency = activeCoinCurrency();
  const commissionBps = session.commissionBps ?? (await currentCommissionBps());
  const split = splitCommission(input.amount, commissionBps);

  const result = await getDb().transaction(async (tx) => {
    if (await isBlockedBetween(tx, actor.id, session.creatorUserId)) throw forbidden("Ein Trinkgeld ist hier nicht möglich.");
    if (!(await creatorMayOperate(tx, session.creatorUserId))) throw new AppError("invalid_state", "Dieser Creator kann derzeit keine Trinkgelder empfangen.");
    const wallet = await getOrCreateAccount(tx, { kind: "customer_wallet", ownerUserId: actor.id, currency });
    const earnings = await getOrCreateAccount(tx, { kind: "creator_earnings", ownerUserId: session.creatorUserId, currency });
    const platform = await getOrCreateAccount(tx, { kind: "platform_revenue", currency });
    const entries = [
      { accountId: wallet.id, amount: -split.gross },
      ...(split.creatorShare > 0 ? [{ accountId: earnings.id, amount: split.creatorShare }] : []),
      ...(split.platformShare > 0 ? [{ accountId: platform.id, amount: split.platformShare }] : []),
    ];
    let posted;
    try {
      posted = await postTransaction(tx, {
        idempotencyKey: `tip:${actor.id}:${input.requestId}`,
        kind: "tip",
        currency,
        description: currency === "TEST_COIN" ? "Trinkgeld (Testmünzen)" : "Trinkgeld",
        referenceType: "video_session",
        referenceId: session.id,
        actorUserId: actor.id,
        commissionBps,
        entries,
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) throw new InsufficientFundsError("Dein Guthaben reicht für dieses Trinkgeld nicht aus.");
      throw error;
    }
    if (posted.duplicate) return { duplicate: true, transactionId: posted.transactionId };
    const body = input.message && input.message.length > 0 ? input.message.replace(/\s+/g, " ") : `${split.gross} Münzen Trinkgeld`;
    const [message] = await tx
      .insert(chatMessages)
      .values({ sessionId: session.id, senderUserId: actor.id, kind: "tip", body: body.slice(0, 120), tipAmount: split.gross })
      .returning({ id: chatMessages.id });
    await publish(tx, { topic: sessionTopic(session.id), type: "chat.message", id: message!.id });
    await notify(tx, {
      userId: session.creatorUserId,
      type: "tip.received",
      title: "Trinkgeld erhalten",
      body: `${split.gross} ${currency === "TEST_COIN" ? "Testmünzen" : "Münzen"} Trinkgeld (dein Anteil: ${split.creatorShare}).`,
      linkPath: "/studio/earnings",
    });

    // Auffällige Häufung (z. B. gestohlene Zahlungsmittel, Geldwäsche über Absprachen)
    const [velocity] = await tx
      .select({ count: sql<number>`count(DISTINCT ${ledgerTransactions.id})::int`, coins: sql<number>`coalesce(-sum(${ledgerEntries.amount}) FILTER (WHERE ${ledgerEntries.accountId} = ${wallet.id}), 0)::int` })
      .from(ledgerTransactions)
      .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(and(eq(ledgerTransactions.kind, "tip"), eq(ledgerTransactions.actorUserId, actor.id), gte(ledgerTransactions.createdAt, sql`now() - interval '10 minutes'`)));
    if ((velocity?.count ?? 0) >= RISK_THRESHOLDS.tipsPerTenMinutes || (velocity?.coins ?? 0) >= RISK_THRESHOLDS.tipCoinsPerTenMinutes) {
      await recordRiskEvent(tx, { userId: actor.id, kind: "tip_velocity", severity: "medium", details: { tipsLast10Min: velocity?.count, coinsLast10Min: velocity?.coins, creatorUserId: session.creatorUserId } });
    }
    return { duplicate: false, transactionId: posted.transactionId };
  });
  return { ...result, ...split };
}
