/**
 * Transaktionale E-Mail-Vorlagen (Deutsch, de-AT) – reine Funktionen.
 *
 * Jede Vorlage liefert Betreff, Klartext und HTML. Alle eingesetzten Werte
 * werden im HTML maskiert. Links sind absolut (APP_URL). Es werden keine
 * Absenderadressen erfunden – der Absender kommt ausschließlich aus EMAIL_FROM.
 */

export type EmailCategory = "transactional" | "security" | "session_updates" | "marketing";

type TemplateDefinition<D> = {
  category: EmailCategory;
  render(data: D, ctx: RenderContext): { subject: string; paragraphs: string[]; action?: { label: string; path: string }; footnote?: string };
};

export type RenderContext = { appUrl: string; brandName: string };

export type EmailTemplateData = {
  email_verification: { token: string };
  password_reset: { token: string };
  registration_attempt_existing: Record<string, never>;
  password_changed: Record<string, never>;
  welcome: { username: string; role: "customer" | "creator" };
  security_notice: { kind: "mfa_enabled" | "mfa_disabled" | "payout_destination_changed" | "email_changed" | "new_staff_login"; detail?: string };
  creator_application_received: { displayName: string };
  creator_review_result: { decision: "approve" | "request_changes" | "suspend"; note?: string };
  creator_verification_status: { status: "pending" | "verified" | "test_passed" | "rejected" | "expired" };
  payment_confirmed: { coins: number; price: string; simulated: boolean; orderId: string };
  payment_refunded: { coins: number; price: string; simulated: boolean; orderId: string };
  payout_requested: { coins: number; amount: string; simulated: boolean };
  payout_completed: { coins: number; amount: string; simulated: boolean; reference: string };
  payout_rejected: { coins: number; reason: string; simulated: boolean };
  support_ticket_received: { subject: string; ticketId: string };
  account_suspended: { statement: string; until?: string | null };
  staff_invite: { token: string; roleLabel: string; invitedBy: string };
};

export type EmailTemplateKey = keyof EmailTemplateData;

const simulatedNote = (simulated: boolean) =>
  simulated ? "Hinweis: Dies ist ein Vorgang im Testmodus (Sandbox). Es wurde KEIN echtes Geld bewegt." : undefined;

const templates: { [K in EmailTemplateKey]: TemplateDefinition<EmailTemplateData[K]> } = {
  email_verification: {
    category: "transactional",
    render: ({ token }, { brandName }) => ({
      subject: `${brandName}: Bitte bestätige deine E-Mail-Adresse`,
      paragraphs: [`bitte bestätige deine E-Mail-Adresse für ${brandName}.`, "Der Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese Nachricht ignorieren."],
      action: { label: "E-Mail-Adresse bestätigen", path: `/verify-email?token=${encodeURIComponent(token)}` },
    }),
  },
  password_reset: {
    category: "security",
    render: ({ token }, { brandName }) => ({
      subject: `${brandName}: Passwort zurücksetzen`,
      paragraphs: [
        "über den folgenden Link kannst du ein neues Passwort festlegen.",
        "Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden. Wenn du das nicht angefordert hast, ignoriere diese Nachricht – dein Passwort bleibt unverändert.",
      ],
      action: { label: "Neues Passwort festlegen", path: `/reset-password?token=${encodeURIComponent(token)}` },
    }),
  },
  registration_attempt_existing: {
    category: "security",
    render: (_data, { brandName }) => ({
      subject: `${brandName}: Registrierungsversuch mit deiner E-Mail-Adresse`,
      paragraphs: ["jemand hat versucht, mit deiner E-Mail-Adresse ein neues Konto zu erstellen. Du hast bereits ein Konto.", "Wenn du das nicht warst, musst du nichts tun."],
      action: { label: "Passwort vergessen?", path: "/forgot-password" },
    }),
  },
  password_changed: {
    category: "security",
    render: (_data, { brandName }) => ({
      subject: `${brandName}: Dein Passwort wurde geändert`,
      paragraphs: ["dein Passwort wurde soeben geändert. Alle anderen Sitzungen wurden abgemeldet.", "Warst du das nicht? Bitte setze sofort dein Passwort zurück und kontaktiere den Support."],
      action: { label: "Passwort zurücksetzen", path: "/forgot-password" },
    }),
  },
  welcome: {
    category: "transactional",
    render: ({ username, role }, { brandName }) => ({
      subject: `Willkommen bei ${brandName}`,
      paragraphs:
        role === "creator"
          ? [
              `schön, dass du dabei bist, ${username}. Deine E-Mail-Adresse ist bestätigt.`,
              "Nächste Schritte im Creator-Studio: Profil ausfüllen, Erklärungen abgeben und die Alters- und Identitätsprüfung starten. Erst danach kann dein Profil geprüft und veröffentlicht werden.",
            ]
          : [
              `schön, dass du dabei bist, ${username}. Deine E-Mail-Adresse ist bestätigt.`,
              "Für Live-Streams, private Chats und Käufe ist eine Altersprüfung erforderlich. Du findest sie in deinem Konto.",
            ],
      action: { label: role === "creator" ? "Zum Creator-Studio" : "Zu meinem Konto", path: role === "creator" ? "/studio" : "/account" },
    }),
  },
  security_notice: {
    category: "security",
    render: ({ kind, detail }, { brandName }) => {
      const texts: Record<EmailTemplateData["security_notice"]["kind"], [string, string]> = {
        mfa_enabled: ["Zwei-Faktor-Anmeldung aktiviert", "für dein Konto wurde die Zwei-Faktor-Anmeldung aktiviert."],
        mfa_disabled: ["Zwei-Faktor-Anmeldung deaktiviert", "für dein Konto wurde die Zwei-Faktor-Anmeldung deaktiviert."],
        payout_destination_changed: ["Auszahlungskonto geändert", "das Bankkonto für Auszahlungen wurde geändert. Aus Sicherheitsgründen werden Auszahlungen in den nächsten Tagen zusätzlich geprüft."],
        email_changed: ["E-Mail-Adresse geändert", "die E-Mail-Adresse deines Kontos wurde geändert."],
        new_staff_login: ["Neue Anmeldung im Mitarbeiterbereich", "es gab eine neue Anmeldung in deinem Mitarbeiterkonto."],
      };
      const [title, text] = texts[kind];
      return {
        subject: `${brandName}: ${title}`,
        paragraphs: [text, ...(detail ? [detail] : []), "Warst du das nicht? Ändere sofort dein Passwort und kontaktiere den Support."],
        action: { label: "Sicherheitseinstellungen öffnen", path: "/account/security" },
      };
    },
  },
  creator_application_received: {
    category: "transactional",
    render: ({ displayName }, { brandName }) => ({
      subject: `${brandName}: Dein Profil wurde zur Prüfung eingereicht`,
      paragraphs: [
        `danke – das Profil „${displayName}“ ist bei uns eingegangen und wird geprüft.`,
        "Wir prüfen Profilinhalte, Erklärungen und das Ergebnis der Alters- und Identitätsprüfung. Du wirst per E-Mail und im Studio über das Ergebnis informiert.",
      ],
      action: { label: "Status im Studio ansehen", path: "/studio" },
    }),
  },
  creator_review_result: {
    category: "transactional",
    render: ({ decision, note }, { brandName }) => ({
      subject:
        decision === "approve"
          ? `${brandName}: Dein Profil wurde freigegeben`
          : decision === "request_changes"
            ? `${brandName}: Änderungen an deinem Profil erforderlich`
            : `${brandName}: Dein Profil wurde gesperrt`,
      paragraphs:
        decision === "approve"
          ? ["dein Profil wurde geprüft und freigegeben."]
          : [decision === "request_changes" ? "dein Profil benötigt Änderungen, bevor es veröffentlicht werden kann." : "dein Profil wurde gesperrt.", ...(note ? [`Begründung: ${note}`] : []), "Du kannst im Studio Einspruch einlegen oder den Support kontaktieren."],
      action: { label: "Zum Creator-Studio", path: "/studio/profile" },
    }),
  },
  creator_verification_status: {
    category: "transactional",
    render: ({ status }, { brandName }) => {
      const map: Record<EmailTemplateData["creator_verification_status"]["status"], string> = {
        pending: "deine Alters- und Identitätsprüfung wurde gestartet und ist noch nicht abgeschlossen.",
        verified: "deine Alters- und Identitätsprüfung wurde vom Prüfanbieter erfolgreich abgeschlossen.",
        test_passed: "die SIMULIERTE Prüfung im Testmodus wurde abgeschlossen. Es hat KEINE echte Alters- oder Identitätsprüfung stattgefunden.",
        rejected: "deine Alters- und Identitätsprüfung war nicht erfolgreich. Bitte wende dich an den Support.",
        expired: "deine Alters- und Identitätsprüfung ist abgelaufen und muss erneuert werden.",
      };
      return {
        subject: `${brandName}: Status deiner Verifizierung`,
        paragraphs: [map[status]],
        action: { label: "Verifizierung ansehen", path: "/studio/verification" },
      };
    },
  },
  payment_confirmed: {
    category: "transactional",
    render: ({ coins, price, simulated, orderId }, { brandName }) => ({
      subject: `${brandName}: Kaufbestätigung`,
      paragraphs: [
        `dein Kauf wurde bestätigt: ${coins} ${simulated ? "Testmünzen" : "Münzen"} für ${price}.`,
        `Bestellnummer: ${orderId}`,
      ],
      action: { label: "Kaufhistorie ansehen", path: "/account/purchases" },
      footnote: simulatedNote(simulated),
    }),
  },
  payment_refunded: {
    category: "transactional",
    render: ({ coins, price, simulated, orderId }, { brandName }) => ({
      subject: `${brandName}: Erstattung`,
      paragraphs: [`dein Kauf über ${coins} ${simulated ? "Testmünzen" : "Münzen"} (${price}) wurde erstattet.`, `Bestellnummer: ${orderId}`],
      action: { label: "Kaufhistorie ansehen", path: "/account/purchases" },
      footnote: simulatedNote(simulated),
    }),
  },
  payout_requested: {
    category: "transactional",
    render: ({ coins, amount, simulated }, { brandName }) => ({
      subject: `${brandName}: Auszahlungsantrag eingegangen`,
      paragraphs: [`dein Auszahlungsantrag über ${coins} Münzen (${amount}) ist eingegangen und wird geprüft.`, "Du wirst informiert, sobald die Auszahlung freigegeben oder ausgeführt wurde."],
      action: { label: "Auszahlungen ansehen", path: "/studio/payouts" },
      footnote: simulatedNote(simulated),
    }),
  },
  payout_completed: {
    category: "transactional",
    render: ({ coins, amount, simulated, reference }, { brandName }) => ({
      subject: `${brandName}: Auszahlung ausgeführt`,
      paragraphs: [`deine Auszahlung über ${coins} Münzen (${amount}) wurde ausgeführt.`, `Referenz: ${reference}`],
      action: { label: "Auszahlungen ansehen", path: "/studio/payouts" },
      footnote: simulatedNote(simulated),
    }),
  },
  payout_rejected: {
    category: "transactional",
    render: ({ coins, reason, simulated }, { brandName }) => ({
      subject: `${brandName}: Auszahlung nicht ausgeführt`,
      paragraphs: [`dein Auszahlungsantrag über ${coins} Münzen wurde nicht ausgeführt. Die Münzen stehen dir wieder zur Verfügung.`, `Begründung: ${reason}`],
      action: { label: "Auszahlungen ansehen", path: "/studio/payouts" },
      footnote: simulatedNote(simulated),
    }),
  },
  support_ticket_received: {
    category: "transactional",
    render: ({ subject, ticketId }, { brandName }) => ({
      subject: `${brandName}: Deine Anfrage ist eingegangen`,
      paragraphs: [`deine Anfrage „${subject}“ ist bei uns eingegangen (Nummer ${ticketId.slice(0, 8)}).`, "Wir melden uns so bald wie möglich. Antworten findest du in deinem Konto unter „Support“."],
      action: { label: "Anfrage ansehen", path: `/account/support/${ticketId}` },
    }),
  },
  account_suspended: {
    category: "transactional",
    render: ({ statement, until }, { brandName }) => ({
      subject: `${brandName}: Dein Konto wurde gesperrt`,
      paragraphs: [
        `dein Konto wurde ${until ? `bis ${until}` : "bis auf Weiteres"} gesperrt.`,
        `Begründung: ${statement}`,
        "Du kannst dich weiterhin anmelden, um Einspruch einzulegen oder den Support zu kontaktieren.",
      ],
      action: { label: "Einspruch einlegen", path: "/account" },
    }),
  },
  staff_invite: {
    category: "security",
    render: ({ token, roleLabel, invitedBy }, { brandName }) => ({
      subject: `${brandName}: Einladung in den Mitarbeiterbereich`,
      paragraphs: [
        `${invitedBy} hat dich als „${roleLabel}“ in den Mitarbeiterbereich eingeladen.`,
        "Über den Link legst du ein persönliches Passwort fest. Danach ist die Einrichtung der Zwei-Faktor-Anmeldung verpflichtend. Der Link ist 72 Stunden gültig und nur einmal verwendbar.",
      ],
      action: { label: "Einladung annehmen", path: `/staff/accept?token=${encodeURIComponent(token)}` },
    }),
  },
};

export function templateCategory(key: EmailTemplateKey): EmailCategory {
  return templates[key].category;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export type RenderedEmail = { subject: string; text: string; html: string; category: EmailCategory };

export function renderEmail<K extends EmailTemplateKey>(
  key: K,
  data: EmailTemplateData[K],
  ctx: RenderContext & { unsubscribePath?: string | null },
): RenderedEmail {
  const definition = templates[key];
  const content = definition.render(data, ctx);
  const actionUrl = content.action ? new URL(content.action.path, ctx.appUrl).toString() : null;
  const unsubscribeUrl = ctx.unsubscribePath ? new URL(ctx.unsubscribePath, ctx.appUrl).toString() : null;
  const reason =
    definition.category === "transactional" || definition.category === "security"
      ? `Du erhältst diese Nachricht, weil sie für dein Konto bei ${ctx.brandName} erforderlich ist.`
      : `Du erhältst diese Nachricht aufgrund deiner Benachrichtigungseinstellungen bei ${ctx.brandName}.`;

  const text = [
    "Hallo,",
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(actionUrl ? [`${content.action!.label}: ${actionUrl}`, ""] : []),
    ...(content.footnote ? [content.footnote, ""] : []),
    "—",
    reason,
    ...(unsubscribeUrl ? [`Abmelden: ${unsubscribeUrl}`] : []),
  ].join("\n");

  const p = (inner: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f1a24">${inner}</p>`;
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#16111c;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px">${escapeHtml(ctx.brandName)}</td></tr>
<tr><td style="padding:28px">
${p("Hallo,")}
${content.paragraphs.map((para) => p(escapeHtml(para))).join("\n")}
${
  actionUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#d6336c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(content.action!.label)}</a></p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b6475">Falls der Button nicht funktioniert: <span style="word-break:break-all">${escapeHtml(actionUrl)}</span></p>`
    : ""
}
${content.footnote ? `<p style="margin:16px 0;padding:12px 14px;background:#fff4e5;border-radius:10px;font-size:13px;color:#7a4b00">${escapeHtml(content.footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #eee8f0;font-size:12px;line-height:1.5;color:#6b6475">${escapeHtml(reason)}${
    unsubscribeUrl ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b6475">Abmelden</a>` : ""
  }</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: content.subject, text, html, category: definition.category };
}
