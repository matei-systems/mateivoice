import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { notificationPreferences, notifications, users } from "@/server/db/schema";
import { safeRedirectPath } from "@/lib/utils";

/**
 * In-App-Benachrichtigungen. Weitere Kanäle (E-Mail, Push) werden über
 * Adapter ergänzt und berücksichtigen die Präferenzen bzw. Einwilligungen.
 */

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath?: string;
};

export async function notify(executor: Executor, input: NotificationInput) {
  await executor.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title.slice(0, 140),
    body: input.body.slice(0, 1000),
    linkPath: input.linkPath ? safeRedirectPath(input.linkPath, "/") : null,
  });
}

export async function notifyAdmins(executor: Executor, input: Omit<NotificationInput, "userId">) {
  const admins = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")));
  for (const admin of admins) await notify(executor, { ...input, userId: admin.id });
}

export async function listNotifications(userId: string, limit = 50) {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** Markiert nur Benachrichtigungen des angegebenen Nutzers (IDOR-Schutz über userId-Bedingung). */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids && ids.length > 0) conditions.push(inArray(notifications.id, ids));
  await getDb().update(notifications).set({ readAt: new Date() }).where(and(...conditions));
}

export async function getNotificationPreferences(userId: string) {
  const [row] = await getDb()
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return (
    row ?? {
      userId,
      emailAccount: true,
      emailSessionUpdates: false,
      emailMarketing: false,
      inAppSessionUpdates: true,
      updatedAt: new Date(),
    }
  );
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: { emailSessionUpdates: boolean; emailMarketing: boolean; inAppSessionUpdates: boolean },
) {
  await getDb()
    .insert(notificationPreferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
}
