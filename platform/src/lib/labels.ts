import type { BadgeTone } from "@/components/ui/badge";

/** Einheitliche deutsche Bezeichnungen und Farbtöne für Status-Werte. */

export const transactionKindLabel: Record<string, string> = {
  test_credit: "Testguthaben erstellt",
  purchase: "Kauf (simuliert)",
  session_charge: "Privater Chat",
  refund: "Rückerstattung",
  chargeback: "Rückbuchung",
  payout: "Auszahlung",
  adjustment: "Korrektur",
};

export const sessionStatus: Record<string, { label: string; tone: BadgeTone }> = {
  requested: { label: "Angefragt", tone: "warning" },
  accepted: { label: "Angenommen", tone: "info" },
  active: { label: "Aktiv", tone: "success" },
  ended: { label: "Beendet", tone: "neutral" },
  declined: { label: "Abgelehnt", tone: "neutral" },
  cancelled: { label: "Storniert", tone: "neutral" },
  expired: { label: "Abgelaufen", tone: "neutral" },
  failed: { label: "Fehlgeschlagen", tone: "danger" },
};

export const endReasonLabel: Record<string, string> = {
  customer_left: "vom Kunden beendet",
  creator_left: "vom Creator beendet",
  insufficient_funds: "Guthaben aufgebraucht",
  connection_lost: "Verbindung verloren",
  moderation: "durch Moderation beendet",
  provider_error: "technischer Fehler",
  stream_ended: "Stream beendet",
};

export const reviewStatus: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Entwurf", tone: "neutral" },
  pending_review: { label: "In Prüfung", tone: "warning" },
  approved: { label: "Freigegeben", tone: "success" },
  changes_requested: { label: "Änderungen nötig", tone: "danger" },
  suspended: { label: "Gesperrt", tone: "danger" },
};

export const reportStatus: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "Offen", tone: "warning" },
  in_review: { label: "In Bearbeitung", tone: "info" },
  action_taken: { label: "Maßnahme ergriffen", tone: "success" },
  no_action: { label: "Kein Verstoß", tone: "neutral" },
  dismissed: { label: "Verworfen", tone: "neutral" },
};

export const reportPriority: Record<string, { label: string; tone: BadgeTone }> = {
  critical: { label: "Kritisch", tone: "danger" },
  high: { label: "Hoch", tone: "warning" },
  normal: { label: "Normal", tone: "neutral" },
};

export const reportCategoryLabel: Record<string, string> = {
  minor_suspected: "Verdacht Minderjährige",
  non_consensual: "Nicht einvernehmlich",
  illegal_content: "Rechtswidrig",
  violence_or_threat: "Gewalt/Drohung",
  harassment: "Belästigung",
  fraud_or_scam: "Betrug",
  impersonation: "Identitätsmissbrauch",
  spam: "Spam",
  other: "Sonstiges",
};

export const ticketStatus: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "Offen", tone: "warning" },
  waiting_for_user: { label: "Antwort erhalten", tone: "info" },
  closed: { label: "Geschlossen", tone: "neutral" },
};

export const supportCategoryLabel: Record<string, string> = {
  account: "Konto & Anmeldung",
  payments: "Münzen & Abrechnung",
  technical: "Technisches Problem",
  safety: "Sicherheit & Missbrauch",
  creator: "Creator-Fragen",
  privacy: "Datenschutz",
  other: "Sonstiges",
};

export const sanctionKindLabel: Record<string, string> = {
  warning: "Verwarnung",
  suspension: "Sperre",
  profile_hidden: "Profil ausgeblendet",
};

export const orderStatus: Record<string, { label: string; tone: BadgeTone }> = {
  created: { label: "Angelegt", tone: "neutral" },
  pending: { label: "Ausstehend", tone: "warning" },
  confirmed: { label: "Bestätigt", tone: "success" },
  failed: { label: "Fehlgeschlagen", tone: "danger" },
  refunded: { label: "Erstattet", tone: "neutral" },
  charged_back: { label: "Rückgebucht", tone: "danger" },
};

export const roleLabel: Record<string, string> = { customer: "Kunde", creator: "Creator", admin: "Admin" };
export const userStatusLabel: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Aktiv", tone: "success" },
  suspended: { label: "Gesperrt", tone: "danger" },
  deleted: { label: "Gelöscht", tone: "neutral" },
};
