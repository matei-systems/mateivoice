/**
 * IBAN-Prüfung (ISO 13616): Länderlänge + Prüfziffer (Modulo 97). Reine Funktionen.
 * Unterstützt SEPA-Länder; weitere Länder können ergänzt werden.
 */

export const SEPA_IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27,
  HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28,
  PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

function mod97(numeric: string): number {
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder;
}

export type IbanCheck = { valid: true; iban: string; country: string } | { valid: false; reason: string };

export function validateIban(input: string): IbanCheck {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return { valid: false, reason: "Die IBAN hat ein ungültiges Format." };
  const country = iban.slice(0, 2);
  const expected = SEPA_IBAN_LENGTHS[country];
  if (!expected) return { valid: false, reason: "Auszahlungen sind derzeit nur auf Konten im SEPA-Raum möglich." };
  if (iban.length !== expected) return { valid: false, reason: `Eine IBAN aus ${country} hat ${expected} Stellen.` };
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  if (mod97(numeric) !== 1) return { valid: false, reason: "Die Prüfziffer der IBAN ist falsch. Bitte prüfe deine Eingabe." };
  return { valid: true, iban, country };
}

/** Maskierte Darstellung, z. B. „AT61 •••• •••• •••• 4321“. */
export function maskIban(iban: string): string {
  const normalized = normalizeIban(iban);
  const last4 = normalized.slice(-4);
  const hiddenGroups = Math.max(1, Math.ceil((normalized.length - 8) / 4));
  return `${normalized.slice(0, 4)} ${Array.from({ length: hiddenGroups }, () => "••••").join(" ")} ${last4}`;
}
