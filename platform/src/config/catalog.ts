/**
 * Feste Auswahllisten für Creator-Profile. Freitext-Tags werden bewusst nicht
 * erlaubt (Missbrauchs- und Moderationsrisiko). Erweiterbar ohne Codeumbau.
 */

export const LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "Englisch" },
  { code: "it", label: "Italienisch" },
  { code: "hu", label: "Ungarisch" },
  { code: "cs", label: "Tschechisch" },
  { code: "sk", label: "Slowakisch" },
  { code: "sl", label: "Slowenisch" },
  { code: "hr", label: "Kroatisch" },
  { code: "fr", label: "Französisch" },
  { code: "es", label: "Spanisch" },
] as const;

export const TAGS = [
  { code: "talk", label: "Gespräche" },
  { code: "music", label: "Musik" },
  { code: "dance", label: "Tanz" },
  { code: "fitness", label: "Fitness" },
  { code: "fashion", label: "Mode" },
  { code: "art", label: "Kunst" },
  { code: "gaming", label: "Gaming" },
  { code: "cooking", label: "Kochen" },
  { code: "travel", label: "Reisen" },
  { code: "lifestyle", label: "Lifestyle" },
  { code: "comedy", label: "Comedy" },
  { code: "wellness", label: "Wellness" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type TagCode = (typeof TAGS)[number]["code"];

const languageLabels = new Map<string, string>(LANGUAGES.map((l) => [l.code, l.label]));
const tagLabels = new Map<string, string>(TAGS.map((t) => [t.code, t.label]));

export const languageLabel = (code: string) => languageLabels.get(code) ?? code;
export const tagLabel = (code: string) => tagLabels.get(code) ?? code;
export const isLanguageCode = (code: string): code is LanguageCode => languageLabels.has(code);
export const isTagCode = (code: string): code is TagCode => tagLabels.has(code);

export const SORT_OPTIONS = [
  { value: "recommended", label: "Empfohlen" },
  { value: "newest", label: "Neueste" },
  { value: "price_asc", label: "Preis aufsteigend" },
  { value: "price_desc", label: "Preis absteigend" },
  { value: "name", label: "Name A–Z" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];
