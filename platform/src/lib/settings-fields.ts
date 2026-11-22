/**
 * Formularbeschreibung der Plattform-Einstellungen (rein, für Client und Server).
 * Die Validierung erfolgt serverseitig mit den Zod-Schemas in settings/service.ts.
 */

export type SettingField =
  | { name: string; label: string; type: "int"; min?: number; max?: number; hint?: string }
  | { name: string; label: string; type: "bool"; hint?: string }
  | { name: string; label: string; type: "text"; maxLength?: number; hint?: string }
  | { name: string; label: string; type: "countries"; hint?: string }
  | { name: string; label: string; type: "policy"; hint?: string }
  | { name: string; label: string; type: "policyMap"; hint?: string };

export const SETTING_FIELDS: Record<string, SettingField[]> = {
  commission: [{ name: "platformBps", label: "Plattformanteil in Basispunkten", type: "int", min: 0, max: 5000, hint: "2500 = 25 % Plattform / 75 % Model. Gilt für neue Sitzungen und Trinkgelder." }],
  payout: [
    { name: "minimumCoins", label: "Mindestbetrag (Münzen)", type: "int", min: 1 },
    { name: "holdDays", label: "Haltefrist (Tage)", type: "int", min: 0, max: 120, hint: "Schutz vor Rückbuchungen: Einnahmen sind erst nach dieser Frist auszahlbar." },
    { name: "centsPer100Coins", label: "Auszahlungswert (Cent je 100 Münzen)", type: "int", min: 1, max: 10000, hint: "Vorläufig – Geschäftsentscheidung." },
    { name: "requireFourEyes", label: "Vier-Augen-Prinzip (Freigabe und Ausführung durch verschiedene Personen)", type: "bool" },
  ],
  payments: [
    { name: "dailyLimitCents", label: "Tageslimit je Person (Cent)", type: "int", min: 100 },
    { name: "monthlyLimitCents", label: "Monatslimit je Person (Cent, 30 Tage)", type: "int", min: 100 },
  ],
  pricing: [
    { name: "privateChatMin", label: "Privater Chat: Mindestpreis (Münzen/Min.)", type: "int", min: 1 },
    { name: "privateChatMax", label: "Privater Chat: Höchstpreis (Münzen/Min.)", type: "int", min: 1 },
    { name: "tipMin", label: "Trinkgeld: Minimum (Münzen)", type: "int", min: 1 },
    { name: "tipMax", label: "Trinkgeld: Maximum (Münzen)", type: "int", min: 1 },
  ],
  featureFlags: [
    { name: "registrations", label: "Neue Registrierungen", type: "bool" },
    { name: "creatorApplications", label: "Creator-Bewerbungen", type: "bool" },
    { name: "publicStreams", label: "Öffentliche Streams", type: "bool" },
    { name: "privateChat", label: "Private Chats", type: "bool" },
    { name: "chat", label: "Chat", type: "bool" },
    { name: "tips", label: "Trinkgelder", type: "bool" },
    { name: "favorites", label: "Favoriten", type: "bool" },
    { name: "purchases", label: "Münzkäufe", type: "bool" },
    { name: "payouts", label: "Auszahlungen", type: "bool" },
  ],
  maintenance: [
    { name: "enabled", label: "Wartungsmodus aktiv", type: "bool", hint: "Nur Mitarbeiter können die Plattform nutzen. Webhooks werden weiter verarbeitet." },
    { name: "message", label: "Hinweistext", type: "text", maxLength: 300 },
  ],
  ageAssurance: [
    { name: "allowedCountries", label: "Zugelassene Länder (ISO-Codes, kommagetrennt)", type: "countries" },
    { name: "policy", label: "Anforderung je Land", type: "policyMap", hint: "„verified“ = Altersprüfung über einen Anbieter erforderlich." },
    { name: "defaultPolicy", label: "Standard für andere Länder", type: "policy" },
  ],
  streaming: [
    { name: "maxViewersPerStream", label: "Max. Zuschauer je Stream", type: "int", min: 1 },
    { name: "requestTtlSeconds", label: "Gültigkeit privater Anfragen (Sekunden)", type: "int", min: 30, max: 900 },
    { name: "heartbeatTimeoutSeconds", label: "Verbindungsabbruch nach (Sekunden)", type: "int", min: 15, max: 600 },
  ],
  chat: [
    { name: "maxMessageLength", label: "Max. Nachrichtenlänge", type: "int", min: 20, max: 1000 },
    { name: "minIntervalSeconds", label: "Mindestabstand zwischen Nachrichten (Sekunden)", type: "int", min: 0, max: 120 },
  ],
  retention: [
    { name: "chatMessagesDays", label: "Chatnachrichten (Tage)", type: "int", min: 1 },
    { name: "emailOutboxDays", label: "E-Mail-Protokoll (Tage)", type: "int", min: 1 },
    { name: "sessionEventsDays", label: "Sitzungsereignisse (Tage)", type: "int", min: 30 },
  ],
  email: [{ name: "senderName", label: "Absendername", type: "text", maxLength: 60, hint: "Die Absenderadresse kommt ausschließlich aus EMAIL_FROM (Umgebung)." }],
};

type FormLike = { get(name: string): FormDataEntryValue | null };

function str(form: FormLike, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Baut aus den Formularfeldern den Rohwert (wird serverseitig per Zod validiert). */
export function parseSettingForm(key: string, form: FormLike): Record<string, unknown> {
  const fields = SETTING_FIELDS[key] ?? [];
  const value: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case "int": {
        const raw = str(form, field.name).trim();
        value[field.name] = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
        break;
      }
      case "bool":
        value[field.name] = str(form, field.name) === "on" || str(form, field.name) === "true";
        break;
      case "text":
        value[field.name] = str(form, field.name).trim();
        break;
      case "countries":
        value[field.name] = [
          ...new Set(
            str(form, field.name)
              .split(/[\s,;]+/)
              .map((c) => c.trim().toUpperCase())
              .filter(Boolean),
          ),
        ];
        break;
      case "policy":
        value[field.name] = str(form, field.name);
        break;
      case "policyMap": {
        const countries = (value.allowedCountries as string[] | undefined) ?? [];
        const map: Record<string, string> = {};
        for (const country of countries) {
          const chosen = str(form, `policy.${country}`);
          map[country] = chosen === "self_declaration" ? "self_declaration" : "verified";
        }
        value[field.name] = map;
        break;
      }
    }
  }
  return value;
}
