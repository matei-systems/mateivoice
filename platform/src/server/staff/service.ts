import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { notificationPreferences, users } from "@/server/db/schema";
import { writeAuditLog } from "@/server/audit";
import { consumeToken, emailSchema, issueToken, usernameSchema } from "@/server/auth/service";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { isStaffRole, ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/server/auth/permissions";
import { invalidateAllUserSessions } from "@/server/auth/session";
import { queueEmail } from "@/server/email/service";
import { AppError, PG_UNIQUE_VIOLATION, forbidden, notFound, pgErrorCode, validationError } from "@/server/errors";

/**
 * Mitarbeiterverwaltung (nur „admin.staff.manage“).
 *
 * - Persönliche Einladung per E-Mail (Einmal-Link, 72 h), eigenes Passwort,
 *   verpflichtende Zwei-Faktor-Anmeldung beim ersten Login – keine geteilten Zugänge.
 * - Rollen nach dem Prinzip der minimalen Rechte (siehe auth/permissions.ts).
 * - Es bleibt immer mindestens ein aktives Admin-Konto bestehen.
 */

export const inviteSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  role: z.enum(STAFF_ROLES as unknown as [StaffRole, ...StaffRole[]]),
});

export async function inviteStaff(input: { adminUserId: string; adminUsername: string; raw: unknown; ipHash?: string | null }) {
  const parsed = inviteSchema.safeParse(input.raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const { email, username, role } = parsed.data;
  try {
    return await getDb().transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          username,
          passwordHash: null,
          role,
          status: "active",
          emailVerifiedAt: null,
          adultSelfDeclaredAt: new Date(),
        })
        .returning({ id: users.id });
      await tx.insert(notificationPreferences).values({ userId: user!.id }).onConflictDoNothing();
      const token = await issueToken(tx, user!.id, "staff_invite");
      await queueEmail({ to: email, userId: user!.id, template: "staff_invite", data: { token, roleLabel: ROLE_LABELS[role], invitedBy: input.adminUsername } }, tx);
      await writeAuditLog(tx, { actorUserId: input.adminUserId, action: "staff.invited", targetType: "user", targetId: user!.id, metadata: { role }, ipHash: input.ipHash });
      return { userId: user!.id };
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new AppError("conflict", "E-Mail-Adresse oder Nutzername ist bereits vergeben.");
    throw error;
  }
}

export async function acceptStaffInvite(input: { token: string; password: string; passwordConfirm: string }) {
  if (input.password !== input.passwordConfirm) throw validationError("Die Passwörter stimmen nicht überein.");
  const parsed = passwordSchema.safeParse(input.password);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiges Passwort.");
  const passwordHash = await hashPassword(parsed.data);
  return getDb().transaction(async (tx) => {
    const consumed = await consumeToken(tx, input.token, "staff_invite");
    if (!consumed) throw new AppError("invalid_state", "Der Einladungslink ist ungültig oder abgelaufen. Bitte fordere eine neue Einladung an.");
    const [user] = await tx.select().from(users).where(eq(users.id, consumed.userId)).for("update");
    if (!user || !isStaffRole(user.role) || user.status !== "active") throw new AppError("invalid_state", "Die Einladung ist nicht mehr gültig.");
    await tx.update(users).set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() }).where(eq(users.id, user.id));
    await writeAuditLog(tx, { actorUserId: user.id, action: "staff.invite_accepted", targetType: "user", targetId: user.id });
    return { email: user.email };
  });
}

export async function listStaff() {
  return getDb()
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      mfa: sql<boolean>`${users.totpEnabledAt} IS NOT NULL`,
      invitePending: sql<boolean>`${users.passwordHash} IS NULL`,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(inArray(users.role, [...STAFF_ROLES]), ne(users.status, "deleted")))
    .orderBy(asc(users.role), asc(users.username));
}

async function activeAdminCount(excludingUserId: string) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, excludingUserId)));
  return row?.count ?? 0;
}

export async function changeStaffRole(input: { adminUserId: string; userId: string; role: string; reason: string; ipHash?: string | null }) {
  if (!STAFF_ROLES.includes(input.role as StaffRole)) throw validationError("Ungültige Rolle.");
  if (input.userId === input.adminUserId) throw forbidden("Die eigene Rolle kann nicht geändert werden.");
  if (input.reason.trim().length < 10) throw validationError("Bitte begründe die Änderung (mind. 10 Zeichen).");
  const [target] = await getDb().select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target || !isStaffRole(target.role)) throw notFound("Mitarbeiterkonto nicht gefunden.");
  if (target.role === "admin" && input.role !== "admin" && (await activeAdminCount(target.id)) === 0) {
    throw new AppError("invalid_state", "Es muss mindestens ein aktives Admin-Konto bestehen bleiben.");
  }
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ role: input.role as StaffRole }).where(eq(users.id, target.id));
    // Rechteänderung wirkt sofort: bestehende Anmeldungen beenden.
    await invalidateAllUserSessions(tx, target.id);
    await writeAuditLog(tx, { actorUserId: input.adminUserId, action: "staff.role_changed", targetType: "user", targetId: target.id, reason: input.reason.trim(), metadata: { from: target.role, to: input.role }, ipHash: input.ipHash });
  });
}

export async function setStaffActive(input: { adminUserId: string; userId: string; active: boolean; reason: string; ipHash?: string | null }) {
  if (input.userId === input.adminUserId) throw forbidden("Das eigene Konto kann nicht deaktiviert werden.");
  if (input.reason.trim().length < 10) throw validationError("Bitte begründe die Änderung (mind. 10 Zeichen).");
  const [target] = await getDb().select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target || !isStaffRole(target.role) || target.status === "deleted") throw notFound("Mitarbeiterkonto nicht gefunden.");
  if (!input.active && target.role === "admin" && (await activeAdminCount(target.id)) === 0) {
    throw new AppError("invalid_state", "Es muss mindestens ein aktives Admin-Konto bestehen bleiben.");
  }
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ status: input.active ? "active" : "suspended" }).where(eq(users.id, target.id));
    if (!input.active) await invalidateAllUserSessions(tx, target.id);
    await writeAuditLog(tx, {
      actorUserId: input.adminUserId,
      action: input.active ? "staff.reactivated" : "staff.deactivated",
      targetType: "user",
      targetId: target.id,
      reason: input.reason.trim(),
      ipHash: input.ipHash,
    });
  });
}
