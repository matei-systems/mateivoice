import "server-only";
import { getEnv } from "@/config/env";
import { brand } from "@/config/platform";
import { getDb, type Executor } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";

/**
 * Austauschbare E-Mail-Schnittstelle.
 *
 *  - "dev-outbox": Nachrichten werden nur in der Datenbank gespeichert und in
 *    der Entwicklungs-Mailbox (/dev/mailbox) angezeigt. Es wird NICHTS versendet.
 *  - "disabled": Es wird nichts versendet und kein Inhalt gespeichert.
 *
 * Ein echter Anbieter wird erst nach Prüfung der Anbieterbedingungen
 * (Adult-Geschäftsmodell!) und ausdrücklicher Freigabe angebunden.
 */

export type EmailTemplate =
  | "email_verification"
  | "password_reset"
  | "registration_attempt_existing"
  | "password_changed";

export type EmailMessage = {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
};

export interface EmailAdapter {
  readonly name: string;
  readonly deliversRealEmail: boolean;
  send(executor: Executor, message: EmailMessage): Promise<void>;
}

const devOutboxAdapter: EmailAdapter = {
  name: "dev-outbox",
  deliversRealEmail: false,
  async send(executor, message) {
    await executor.insert(emailOutbox).values({
      toAddress: message.to,
      template: message.template,
      subject: message.subject,
      bodyText: message.text,
      status: "stored_dev",
    });
  },
};

const disabledAdapter: EmailAdapter = {
  name: "disabled",
  deliversRealEmail: false,
  async send(executor, message) {
    await executor.insert(emailOutbox).values({
      toAddress: message.to,
      template: message.template,
      subject: message.subject,
      bodyText: null,
      status: "suppressed",
    });
  },
};

export function getEmailAdapter(): EmailAdapter {
  return getEnv().EMAIL_PROVIDER === "dev-outbox" ? devOutboxAdapter : disabledAdapter;
}

function absoluteUrl(path: string) {
  return new URL(path, getEnv().APP_URL).toString();
}

export const emailTemplates = {
  emailVerification(token: string): Omit<EmailMessage, "to"> {
    return {
      template: "email_verification",
      subject: `${brand.name}: Bitte bestätige deine E-Mail-Adresse`,
      text: [
        "Hallo,",
        "",
        `bitte bestätige deine E-Mail-Adresse für ${brand.name}:`,
        absoluteUrl(`/verify-email?token=${encodeURIComponent(token)}`),
        "",
        "Der Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese Nachricht ignorieren.",
      ].join("\n"),
    };
  },
  passwordReset(token: string): Omit<EmailMessage, "to"> {
    return {
      template: "password_reset",
      subject: `${brand.name}: Passwort zurücksetzen`,
      text: [
        "Hallo,",
        "",
        "über folgenden Link kannst du ein neues Passwort festlegen:",
        absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`),
        "",
        "Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden.",
        "Wenn du das nicht angefordert hast, ignoriere diese Nachricht – dein Passwort bleibt unverändert.",
      ].join("\n"),
    };
  },
  registrationAttemptExisting(): Omit<EmailMessage, "to"> {
    return {
      template: "registration_attempt_existing",
      subject: `${brand.name}: Registrierungsversuch mit deiner E-Mail-Adresse`,
      text: [
        "Hallo,",
        "",
        "jemand hat versucht, mit deiner E-Mail-Adresse ein neues Konto zu erstellen. Du hast bereits ein Konto.",
        `Falls du dein Passwort vergessen hast: ${absoluteUrl("/forgot-password")}`,
        "Wenn du das nicht warst, musst du nichts tun.",
      ].join("\n"),
    };
  },
  passwordChanged(): Omit<EmailMessage, "to"> {
    return {
      template: "password_changed",
      subject: `${brand.name}: Dein Passwort wurde geändert`,
      text: [
        "Hallo,",
        "",
        "dein Passwort wurde soeben geändert. Alle anderen Sitzungen wurden abgemeldet.",
        `Warst du das nicht? Bitte setze sofort dein Passwort zurück: ${absoluteUrl("/forgot-password")}`,
      ].join("\n"),
    };
  },
};

export async function sendEmail(message: EmailMessage, executor: Executor = getDb()) {
  await getEmailAdapter().send(executor, message);
}
