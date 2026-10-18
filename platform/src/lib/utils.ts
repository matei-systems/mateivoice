import { brand } from "@/config/platform";

type ClassValue = string | false | null | undefined | 0;

/** Verbindet CSS-Klassen und ignoriert leere Werte. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

const coinFormatter = new Intl.NumberFormat(brand.locale, { maximumFractionDigits: 0 });

/** Ganzzahlige Münzbeträge formatieren, z. B. 1.250 */
export function formatCoins(amount: number): string {
  return coinFormatter.format(amount);
}

const euroFormatter = new Intl.NumberFormat(brand.locale, { style: "currency", currency: "EUR" });

/** Cent-Beträge (Ganzzahl) als Euro formatieren. Keine Gleitkomma-Arithmetik auf Geldbeträgen. */
export function formatEuroCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Cent-Betrag muss eine Ganzzahl sein");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const rest = abs % 100;
  // Darstellung über Intl mit exaktem Dezimalstring statt Float-Division
  return sign + euroFormatter.format(Number(`${euros}.${rest.toString().padStart(2, "0")}`));
}

const dateTimeFormatter = new Intl.DateTimeFormat(brand.locale, {
  timeZone: brand.timeZone,
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat(brand.locale, {
  timeZone: brand.timeZone,
  dateStyle: "medium",
});

/** Zeitstempel werden in UTC gespeichert und nur für die Anzeige nach Europe/Vienna konvertiert. */
export function formatDateTime(date: Date | string): string {
  return dateTimeFormatter.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDate(date: Date | string): string {
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date);
}

/** Dauer in Sekunden als mm:ss bzw. h:mm:ss */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Kalendertag in Europe/Vienna als YYYY-MM-DD (z. B. für Tageslimits). */
export function viennaDayKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: brand.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA liefert YYYY-MM-DD
}

/** Initialen für Platzhalter-Avatare. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase();
}

/** Deterministischer Hash (für Platzhalter-Farbverläufe, nicht für Sicherheit). */
export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Interne Weiterleitungsziele erlauben, offene Redirects verhindern. */
export function safeRedirectPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(target)) return fallback;
  return target;
}
