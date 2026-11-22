"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, getRequestContext } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { completeSandboxCheckout, createCheckout, requestOrderRefund, simulateChargeback, upsertCoinPackage } from "@/server/payments/service";
import { approvePayout, cancelPayout, processPayout, rejectPayout, requestPayout, savePayoutProfile } from "@/server/payouts/service";
import { reviewRiskEvent } from "@/server/risk/service";
import { sendTip } from "@/server/tips/service";
import { formBool, formString, runAction } from "./helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** „9,99“ / „9.99“ / „10“ → Cent (ohne Gleitkomma); ungültig → NaN (Validierung im Service). */
function parseEuroToCents(value: string): number {
  const match = /^\s*(\d{1,6})(?:[.,](\d{1,2}))?\s*$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function requireId(value: string, label: string) {
  if (!UUID.test(value)) throw new AppError("validation", `${label} ungültig.`);
  return value;
}

// ── Kunden: Kauf ────────────────────────────────────────────────────────────

export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const state = await runAction(async () => {
    const { actor } = await assertPermission("wallet.purchase");
    const { ipHash } = await getRequestContext();
    const checkout = await createCheckout(actor, requireId(formString(formData, "packageId"), "Paket"), { ipHash });
    target = checkout.redirectUrl;
  });
  if (target) redirect(target);
  return state;
}

export async function completeSandboxCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const state = await runAction(async () => {
    const { actor } = await assertPermission("wallet.purchase");
    const outcome = formString(formData, "outcome");
    if (outcome !== "success" && outcome !== "failure" && outcome !== "cancel") throw new AppError("validation", "Ungültige Auswahl.");
    const result = await completeSandboxCheckout(actor, {
      orderId: requireId(formString(formData, "orderId"), "Bestellung"),
      token: formString(formData, "token"),
      outcome,
    });
    target = `/account/wallet/return?order=${result.orderId}`;
  });
  if (target) redirect(target);
  return state;
}

export async function sendTipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("tips.send");
    const result = await sendTip(actor, {
      sessionId: formString(formData, "sessionId"),
      amount: formString(formData, "amount"),
      requestId: formString(formData, "requestId"),
      message: formString(formData, "message") || undefined,
    });
    return {
      status: "success",
      message: result.duplicate ? "Dieses Trinkgeld wurde bereits gesendet." : `Danke! ${result.gross} Münzen Trinkgeld gesendet.`,
    };
  });
}

// ── Creator: Auszahlungen ───────────────────────────────────────────────────

export async function savePayoutProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.payouts.manage");
    const { ipHash } = await getRequestContext();
    await savePayoutProfile(actor, { accountHolder: formString(formData, "accountHolder"), iban: formString(formData, "iban") }, { ipHash });
    refresh();
  }, "Auszahlungskonto gespeichert. Die IBAN wird verschlüsselt gespeichert und nur maskiert angezeigt.");
}

export async function requestPayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.payouts.manage");
    const { ipHash } = await getRequestContext();
    await requestPayout(actor, formString(formData, "amount"), { ipHash });
    refresh();
  }, "Auszahlungsantrag eingereicht. Der Betrag ist bis zur Entscheidung reserviert.");
}

export async function cancelPayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await assertPermission("studio.payouts.manage");
    await cancelPayout(actor, requireId(formString(formData, "payoutId"), "Auszahlung"));
    refresh();
  }, "Antrag zurückgezogen. Die Münzen stehen wieder zur Verfügung.");
}

// ── Mitarbeiter: Finanzen ───────────────────────────────────────────────────

async function staff(permission: Parameters<typeof assertPermission>[0]) {
  const { actor } = await assertPermission(permission);
  const { ipHash } = await getRequestContext();
  return { staffId: actor.id, ipHash };
}

export async function approvePayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.payouts.manage");
    await approvePayout({ staffUserId: staffId, payoutId: requireId(formString(formData, "payoutId"), "Auszahlung"), note: formString(formData, "note"), ipHash });
    refresh();
  }, "Auszahlung freigegeben. Die Ausführung erfolgt durch eine zweite Person.");
}

export async function rejectPayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.payouts.manage");
    await rejectPayout({ staffUserId: staffId, payoutId: requireId(formString(formData, "payoutId"), "Auszahlung"), reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Auszahlung abgelehnt, Reservierung freigegeben.");
}

export async function processPayoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.payouts.manage");
    const outcome = formString(formData, "outcome") === "failure" ? "failure" : "success";
    await processPayout({ staffUserId: staffId, payoutId: requireId(formString(formData, "payoutId"), "Auszahlung"), outcome, note: formString(formData, "note") || formString(formData, "reason"), ipHash });
    refresh();
  }, "Auszahlung verarbeitet.");
}

export async function refundOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.ledger.adjust");
    const result = await requestOrderRefund({ staffUserId: staffId, orderId: requireId(formString(formData, "orderId"), "Bestellung"), reason: formString(formData, "reason"), ipHash });
    refresh();
    return { status: "success", message: result.message };
  });
}

export async function simulateChargebackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.payments.simulate");
    await simulateChargeback({ staffUserId: staffId, orderId: requireId(formString(formData, "orderId"), "Bestellung"), ipHash });
    refresh();
  }, "Rückbuchung simuliert (Sandbox).");
}

export async function upsertPackageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.packages.manage");
    await upsertCoinPackage(
      staffId,
      {
        code: formString(formData, "code"),
        name: formString(formData, "name"),
        coins: formString(formData, "coins"),
        priceCents: parseEuroToCents(formString(formData, "priceEuro")),
        sortOrder: formString(formData, "sortOrder") || "0",
        active: formBool(formData, "active"),
      },
      ipHash,
    );
    refresh();
  }, "Paket gespeichert.");
}

export async function reviewRiskEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.risk.review");
    const decision = formString(formData, "decision") === "dismissed" ? "dismissed" : "reviewed";
    await reviewRiskEvent({ staffUserId: staffId, riskEventId: requireId(formString(formData, "riskEventId"), "Signal"), decision, note: formString(formData, "note") || formString(formData, "reason"), ipHash });
    refresh();
  }, "Signal bearbeitet.");
}
