import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/config/env";
import { brand } from "@/config/platform";
import { getDb, type Executor } from "@/server/db/client";
import { emailOutbox, notificationPreferences, users } from "@/server/db/schema";
import { hmacSha256, safeEqual } from "@/server/crypto";
import { log } from "@/server/log";
import { getSetting } from "@/server/settings/service";
import { renderEmail, templateCategory, type EmailCategory, type EmailTemplateData, type EmailTemplateKey } from "./templates";

/**
 * E-Mail-Versand über eine Warteschlange (Tabelle email_outbox).
 *
 * Adapter (EMAIL_PROVIDER):
 *  - dev-outbox: nur speichern, Anzeige unter /dev/mailbox – es wird NICHTS versendet.
 *  - smtp:       Versand über einen SMTP-Dienst (Zugangsdaten nur aus der Umgebung).
 *                Absender ausschließlich EMAIL_FROM – es wird keine Adresse erfunden.
 *  - disabled:   nichts versenden, keinen Inhalt speichern.
 *
 * Nachrichten werden innerhalb der fachlichen Transaktion eingereiht und erst
 * danach versendet (kein Versand für zurückgerollte Vorgänge). Fehlgeschlagene
 * Zustellungen werden mit Backoff bis zu MAX_ATTEMPTS-mal wiederholt.
 * Nach erfolgreichem Versand wird der Inhalt gelöscht (Datensparsamkeit).
 */

const MAX_ATTEMPTS = 6;

export type EmailProviderInfo = { name: string; deliversRealEmail: boolean };

export function emailProviderInfo(): EmailProviderInfo {
  const provider = getEnv().EMAIL_PROVIDER;
  return { name: provider, deliversRealEmail: provider === "smtp" };
}

// ── Abmelde-Token (nur für optionale Kategorien) ───────────────────────────

const OPTIONAL_CATEGORIES: ReadonlySet<EmailCategory> = new Set(["session_updates", "marketing"]);

function unsubscribeKey() {
  return hmacSha256(getEnv().AUTH_SECRET, "email-unsubscribe-v1");
}

export function createUnsubscribeToken(userId: string, category: EmailCategory): string {
  const payload = `${userId}.${category}`;
  const mac = hmacSha256(unsubscribeKey(), payload).toString("base64url").slice(0, 32);
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

export function verifyUnsubscribeToken(token: string): { userId: string; category: "session_updates" | "marketing" } | null {
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = hmacSha256(unsubscribeKey(), payload).toString("base64url").slice(0, 32);
  if (!safeEqual(expected, mac)) return null;
  const [userId, category] = payload.split(".");
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) return null;
  if (category !== "session_updates" && category !== "marketing") return null;
  return { userId, category };
}

export async function unsubscribe(token: string) {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return false;
  await getDb()
    .insert(notificationPreferences)
    .values({ userId: parsed.userId, ...(parsed.category === "marketing" ? { emailMarketing: false } : { emailSessionUpdates: false }) })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: parsed.category === "marketing" ? { emailMarketing: false } : { emailSessionUpdates: false },
    });
  return true;
}

// ── Einreihen ───────────────────────────────────────────────────────────────

export type QueueEmailInput<K extends EmailTemplateKey> = {
  template: K;
  data: EmailTemplateData[K];
} & ({ userId: string; to?: undefined } | { to: string; userId?: string });

/**
 * Reiht eine E-Mail ein. Gibt false zurück, wenn nichts eingereiht wurde
 * (gelöschtes Konto oder abbestellte optionale Kategorie).
 */
export async function queueEmail<K extends EmailTemplateKey>(input: QueueEmailInput<K>, executor: Executor = getDb()): Promise<boolean> {
  const env = getEnv();
  const category = templateCategory(input.template);
  let toAddress = input.to ?? null;
  const userId = input.userId ?? null;

  if (userId) {
    const [user] = await executor
      .select({ email: users.email, status: users.status, emailSessionUpdates: notificationPreferences.emailSessionUpdates, emailMarketing: notificationPreferences.emailMarketing })
      .from(users)
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.status === "deleted") return false;
    if (category === "session_updates" && user.emailSessionUpdates === false) return false;
    if (category === "marketing" && user.emailMarketing !== true) return false;
    toAddress ??= user.email;
  }
  if (!toAddress) return false;

  const senderName = (await getSetting("email")).senderName;
  const rendered = renderEmail(input.template, input.data, {
    appUrl: env.APP_URL,
    brandName: brand.name,
    unsubscribePath: userId && OPTIONAL_CATEGORIES.has(category) ? `/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId, category))}` : null,
  });
  void senderName; // Anzeigename wird beim Versand verwendet

  const provider = env.EMAIL_PROVIDER;
  await executor.insert(emailOutbox).values({
    userId,
    toAddress,
    template: input.template,
    category,
    subject: rendered.subject,
    bodyText: provider === "disabled" ? null : rendered.text,
    bodyHtml: provider === "disabled" ? null : rendered.html,
    status: provider === "dev-outbox" ? "stored_dev" : provider === "disabled" ? "suppressed" : "queued",
    nextAttemptAt: provider === "smtp" ? new Date() : null,
  });
  if (provider === "smtp") scheduleDelivery();
  return true;
}

// ── Versand ─────────────────────────────────────────────────────────────────

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  const env = getEnv();
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // In Produktion nur verschlüsselt (STARTTLS), außer bei implizitem TLS (Port 465).
    requireTLS: env.APP_ENV === "production" && !env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Nur für Tests: Transport neu aufbauen (z. B. nach Änderung der Umgebung). */
export function resetEmailTransportForTests() {
  transporter = undefined;
}

let deliveryScheduled = false;

/** Versand nach Abschluss der aktuellen Anfrage anstoßen (bestmöglich; Wiederholung über Job). */
function scheduleDelivery() {
  if (deliveryScheduled) return;
  deliveryScheduled = true;
  setTimeout(() => {
    deliveryScheduled = false;
    deliverQueuedEmails().catch((error: unknown) => log.error("email.delivery_failed", { error }));
  }, 50);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Keine Zugangsdaten oder Adressen in Fehlermeldungen speichern.
  return message.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[adresse]").slice(0, 300);
}

export async function deliverQueuedEmails(limit = 20): Promise<{ sent: number; failed: number; retried: number }> {
  const env = getEnv();
  if (env.EMAIL_PROVIDER !== "smtp") return { sent: 0, failed: 0, retried: 0 };
  const db = getDb();
  // Einträge atomar beanspruchen (mehrere Instanzen können parallel arbeiten).
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE email_outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes'
     WHERE id IN (
       SELECT id FROM email_outbox
        WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  const ids = claimed.rows.map((row) => row.id);
  if (ids.length === 0) return { sent: 0, failed: 0, retried: 0 };
  const rows = await db.select().from(emailOutbox).where(inArray(emailOutbox.id, ids));
  const senderName = (await getSetting("email")).senderName;
  const result = { sent: 0, failed: 0, retried: 0 };
  for (const row of rows) {
    try {
      const info = await getTransporter().sendMail({
        from: { name: senderName, address: env.EMAIL_FROM! },
        replyTo: env.EMAIL_REPLY_TO,
        to: row.toAddress,
        subject: row.subject,
        text: row.bodyText ?? "",
        html: row.bodyHtml ?? undefined,
        headers:
          OPTIONAL_CATEGORIES.has(row.category as EmailCategory) && row.userId
            ? {
                "List-Unsubscribe": `<${new URL(`/api/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(row.userId, row.category as EmailCategory))}`, env.APP_URL).toString()}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : undefined,
      });
      await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: new Date(), providerMessageId: String(info.messageId ?? "").slice(0, 200) || null, bodyText: null, bodyHtml: null, lastError: null, nextAttemptAt: null })
        .where(eq(emailOutbox.id, row.id));
      result.sent += 1;
    } catch (error) {
      const finalFailure = row.attempts >= MAX_ATTEMPTS;
      await db
        .update(emailOutbox)
        .set({
          status: finalFailure ? "failed" : "queued",
          lastError: sanitizeError(error),
          nextAttemptAt: finalFailure ? null : new Date(Date.now() + Math.min(2 ** row.attempts, 240) * 60_000),
        })
        .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "queued")));
      log.warn("email.send_failed", { id: row.id, attempts: row.attempts, final: finalFailure });
      if (finalFailure) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}
