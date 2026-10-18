"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, getRequestContext } from "@/server/auth/current";
import { revealUserEmail } from "@/server/admin/service";
import { reviewProfile } from "@/server/creators/service";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { adjustTestBalance, recordChargeback, refundTransaction } from "@/server/ledger/service";
import { moderateMedia } from "@/server/media/service";
import { createSanction, decideAppeal, liftSanction, updateReport } from "@/server/moderation/service";
import { buildSimulatedEvent, createSimulatedOrder, getOrder, handlePaymentWebhook } from "@/server/payments/service";
import { replyToTicket } from "@/server/support/service";
import { sweepSessions } from "@/server/video/service";
import { formBool, formString, runAction } from "./helpers";

async function admin(permission: Parameters<typeof assertPermission>[0]) {
  const { actor } = await assertPermission(permission);
  const { ipHash } = await getRequestContext();
  return { adminId: actor.id, ipHash };
}

export async function reviewProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.creators.review");
    const decision = formString(formData, "decision");
    if (decision !== "approve" && decision !== "request_changes" && decision !== "suspend") throw new AppError("validation", "Ungültige Entscheidung.");
    await reviewProfile({ adminUserId: adminId, profileId: formString(formData, "profileId"), decision, note: formString(formData, "reason"), ipHash });
    refresh();
  }, "Entscheidung gespeichert und protokolliert.");
}

export async function moderateMediaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.creators.review");
    await moderateMedia({
      adminUserId: adminId,
      mediaId: formString(formData, "mediaId"),
      decision: formString(formData, "decision") === "approved" ? "approved" : "rejected",
      note: formString(formData, "reason"),
      ipHash,
    });
    refresh();
  }, "Bildentscheidung gespeichert.");
}

export async function updateReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.reports.manage");
    const status = formString(formData, "status");
    if (!["in_review", "action_taken", "no_action", "dismissed"].includes(status)) throw new AppError("validation", "Ungültiger Status.");
    await updateReport({
      adminUserId: adminId,
      reportId: formString(formData, "reportId"),
      status: status as "in_review" | "action_taken" | "no_action" | "dismissed",
      note: formString(formData, "reason"),
      ipHash,
    });
    refresh();
  }, "Meldung aktualisiert.");
}

export async function createSanctionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.sanctions.manage");
    const duration = formString(formData, "durationDays");
    await createSanction(
      adminId,
      {
        userId: formString(formData, "userId"),
        kind: formString(formData, "kind"),
        reason: formString(formData, "reason"),
        durationDays: duration ? duration : undefined,
        reportId: formString(formData, "reportId") || undefined,
      },
      ipHash,
    );
    refresh();
  }, "Maßnahme gespeichert, protokolliert und dem Konto mitgeteilt.");
}

export async function liftSanctionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.sanctions.manage");
    await liftSanction({ adminUserId: adminId, sanctionId: formString(formData, "sanctionId"), reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Maßnahme aufgehoben.");
}

export async function decideAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.sanctions.manage");
    await decideAppeal({
      adminUserId: adminId,
      appealId: formString(formData, "appealId"),
      decision: formString(formData, "decision") === "overturned" ? "overturned" : "upheld",
      note: formString(formData, "reason"),
      ipHash,
    });
    refresh();
  }, "Entscheidung gespeichert.");
}

export async function reverseTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.ledger.adjust");
    const input = { originalTransactionId: formString(formData, "transactionId"), adminUserId: adminId, reason: formString(formData, "reason"), ipHash };
    if (formString(formData, "kind") === "chargeback") await recordChargeback(input);
    else await refundTransaction(input);
    refresh();
  }, "Gegenbuchung erstellt (simuliert) und protokolliert.");
}

export async function adjustBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.ledger.adjust");
    await adjustTestBalance({
      adminUserId: adminId,
      userId: formString(formData, "userId"),
      amount: Number(formString(formData, "amount")),
      reason: formString(formData, "reason"),
      requestId: formString(formData, "requestId"),
      ipHash,
    });
    refresh();
  }, "Testguthaben korrigiert und protokolliert.");
}

export async function simulateOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.payments.simulate");
    const username = formString(formData, "username").trim();
    const [customer] = await getDb().select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (!customer) throw new AppError("not_found", "Kein Konto mit diesem Nutzernamen gefunden.");
    const order = await createSimulatedOrder({ adminUserId: adminId, customerUserId: customer.id, packageId: formString(formData, "packageId"), ipHash });
    refresh();
    return { status: "success", message: "Simulierte Bestellung angelegt (Status: ausstehend).", data: { orderId: order.id } };
  });
}

export async function simulatePaymentEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await admin("admin.payments.simulate");
    const order = await getOrder(formString(formData, "orderId"));
    if (!order?.simulated) throw new AppError("not_found", "Simulierte Bestellung nicht gefunden.");
    const type = formString(formData, "type");
    if (type !== "payment.confirmed" && type !== "payment.failed" && type !== "payment.charged_back") throw new AppError("validation", "Ungültiges Ereignis.");
    // Läuft durch denselben Pfad wie ein echter Webhook (Signaturprüfung + Idempotenz).
    const { rawBody, signature } = buildSimulatedEvent(order, type, type === "payment.failed" ? "Simulierte Ablehnung" : undefined);
    const result = await handlePaymentWebhook(rawBody, signature);
    refresh();
    return { status: "success", message: `Simuliertes Ereignis verarbeitet: ${result}.` };
  });
}

export async function replyTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.support.manage");
    const status = formString(formData, "status");
    await replyToTicket({
      adminUserId: adminId,
      ticketId: formString(formData, "ticketId"),
      body: formString(formData, "body"),
      internal: formBool(formData, "internal"),
      status: status === "closed" ? "closed" : status === "open" ? "open" : "waiting_for_user",
      ipHash,
    });
    refresh();
  }, "Antwort gespeichert.");
}

export async function revealEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { adminId, ipHash } = await admin("admin.users.manage");
    const reason = formString(formData, "reason");
    if (reason.trim().length < 10) throw new AppError("validation", "Bitte gib eine Begründung an (mind. 10 Zeichen).");
    const email = await revealUserEmail(adminId, formString(formData, "userId"), reason, ipHash);
    return { status: "success", message: `E-Mail-Adresse: ${email} (Zugriff wurde protokolliert)` };
  });
}

export async function sweepSessionsAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await admin("admin.access");
    const result = await sweepSessions();
    refresh();
    return { status: "success", message: `Bereinigt: ${result.expired} abgelaufene Anfragen, ${result.connectionLost} Verbindungsabbrüche.` };
  });
}
