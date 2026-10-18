import "server-only";

/**
 * Strukturierter Logger mit Schwärzung sensibler Felder.
 *
 * Regeln: keine Passwörter, Token, Cookies, E-Mail-Adressen, Zahlungs- oder
 * Ausweisdaten und keine privaten Nachrichten in Logs. Felder mit passenden
 * Namen werden automatisch geschwärzt; trotzdem gilt: nur loggen, was zur
 * Fehlersuche wirklich nötig ist.
 */

type Level = "debug" | "info" | "warn" | "error";
const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word)?|secret|token|cookie|authorization|e-?mail|iban|card|cvc|otp|^body$|^message$|^ip$|ipaddress|user-?agent/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: (value as { code?: unknown }).code };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1);
    }
    return out;
  }
  return value;
}

function currentLevel(): Level {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}

function write(level: Level, event: string, fields?: Record<string, unknown>) {
  if (levelOrder[level] < levelOrder[currentLevel()]) return;
  if (process.env.VITEST && level !== "error") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
