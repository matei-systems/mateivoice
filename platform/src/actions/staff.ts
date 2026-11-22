"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { assertPermission, getRequestContext } from "@/server/auth/current";
import { createLegalHold, releaseLegalHold } from "@/server/compliance/holds";
import { recordPrivacyRequest, updatePrivacyRequest } from "@/server/compliance/privacy";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { terminateStream } from "@/server/moderation/service";
import { categorySchema, updateSetting, upsertCategory, type SettingKey } from "@/server/settings/service";
import { acceptStaffInvite, changeStaffRole, inviteStaff, setStaffActive } from "@/server/staff/service";
import { parseSettingForm, SETTING_FIELDS } from "@/lib/settings-fields";
import { eq } from "drizzle-orm";
import { formBool, formString, runAction } from "./helpers";

async function staff(permission: Parameters<typeof assertPermission>[0]) {
  const { actor, session } = await assertPermission(permission);
  const { ipHash } = await getRequestContext();
  return { staffId: actor.id, username: session.user.username, ipHash };
}

// ── Einstellungen ───────────────────────────────────────────────────────────

export async function updateSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.settings.manage");
    const key = formString(formData, "key") as SettingKey;
    if (!(key in SETTING_FIELDS)) throw new AppError("validation", "Unbekannte Einstellung.");
    const value = parseSettingForm(key, formData);
    await updateSetting({ actorUserId: staffId, key, value, reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Einstellung gespeichert und protokolliert. Sie gilt ab sofort für neue Vorgänge.");
}

export async function upsertCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.categories.manage");
    const raw = { slug: formString(formData, "slug"), label: formString(formData, "label"), sortOrder: formString(formData, "sortOrder") || "0", active: formBool(formData, "active") };
    categorySchema.parse(raw);
    await upsertCategory(staffId, raw, ipHash);
    refresh();
  }, "Kategorie gespeichert.");
}

// ── Mitarbeiter ─────────────────────────────────────────────────────────────

export async function inviteStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, username, ipHash } = await staff("admin.staff.manage");
    await inviteStaff({
      adminUserId: staffId,
      adminUsername: username,
      raw: { email: formString(formData, "email"), username: formString(formData, "username"), role: formString(formData, "role") },
      ipHash,
    });
    refresh();
  }, "Einladung versendet. Die Person legt ein eigenes Passwort fest und muss 2FA einrichten.");
}

export async function changeStaffRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.staff.manage");
    await changeStaffRole({ adminUserId: staffId, userId: formString(formData, "userId"), role: formString(formData, "role"), reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Rolle geändert. Bestehende Anmeldungen der Person wurden beendet.");
}

export async function setStaffActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.staff.manage");
    await setStaffActive({ adminUserId: staffId, userId: formString(formData, "userId"), active: formBool(formData, "active"), reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Status geändert.");
}

/** Öffentlich (per Einladungslink): Passwort festlegen. */
export async function acceptStaffInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let done = false;
  const state = await runAction(async () => {
    await acceptStaffInvite({ token: formString(formData, "token"), password: formString(formData, "password"), passwordConfirm: formString(formData, "passwordConfirm") });
    done = true;
  });
  if (done) redirect("/login?invited=1&next=/admin");
  return state;
}

// ── Compliance ──────────────────────────────────────────────────────────────

export async function createLegalHoldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId } = await staff("admin.legal_holds.manage");
    let targetId = formString(formData, "targetId").trim();
    const targetType = formString(formData, "targetType");
    // Komfort: Konten auch über den Nutzernamen sperrbar
    if (targetType === "user" && !/^[0-9a-f-]{36}$/i.test(targetId)) {
      const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.username, targetId)).limit(1);
      if (!user) throw new AppError("not_found", "Kein Konto mit diesem Nutzernamen gefunden.");
      targetId = user.id;
    }
    await createLegalHold(staffId, { targetType, targetId, reason: formString(formData, "reason"), reportId: formString(formData, "reportId") || undefined });
    refresh();
  }, "Beweissicherung eingerichtet.");
}

export async function releaseLegalHoldAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.legal_holds.manage");
    await releaseLegalHold({ staffUserId: staffId, holdId: formString(formData, "holdId"), reason: formString(formData, "reason"), ipHash });
    refresh();
  }, "Beweissicherung freigegeben.");
}

export async function recordPrivacyRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.privacy.manage");
    await recordPrivacyRequest(staffId, { username: formString(formData, "username"), kind: formString(formData, "kind"), note: formString(formData, "note") }, ipHash);
    refresh();
  }, "Anfrage erfasst.");
}

export async function updatePrivacyRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.privacy.manage");
    const status = formString(formData, "status");
    if (status !== "completed" && status !== "rejected" && status !== "on_hold") throw new AppError("validation", "Ungültiger Status.");
    await updatePrivacyRequest({ staffUserId: staffId, requestId: formString(formData, "requestId"), status, note: formString(formData, "note") || formString(formData, "reason"), ipHash });
    refresh();
  }, "Anfrage aktualisiert.");
}

export async function terminateStreamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staffId, ipHash } = await staff("admin.streams.manage");
    await terminateStream({ staffUserId: staffId, sessionId: formString(formData, "sessionId"), statement: formString(formData, "statement") || formString(formData, "reason"), ruleReference: formString(formData, "ruleReference") || undefined, ipHash });
    refresh();
  }, "Sitzung beendet und Begründung an den Creator übermittelt.");
}
