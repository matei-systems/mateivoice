import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { z } from "zod";

/**
 * Passwort-Hashing mit scrypt (node:crypto, keine nativen Zusatzpakete).
 * Parameter nach OWASP Password Storage Cheat Sheet: N=2^15, r=8, p=3 (≈32 MiB).
 * In APP_ENV=test werden zur Beschleunigung der Tests reduzierte Parameter verwendet.
 * Format: scrypt$<log2N>$<r>$<p>$<salt>$<hash>
 */

type Params = { log2N: number; r: number; p: number };

const PRODUCTION_PARAMS: Params = { log2N: 15, r: 8, p: 3 };
const TEST_PARAMS: Params = { log2N: 10, r: 8, p: 1 };
const KEY_LENGTH = 32;

function currentParams(): Params {
  return process.env.APP_ENV === "test" ? TEST_PARAMS : PRODUCTION_PARAMS;
}

function scrypt(password: string, salt: Buffer, params: Params): Promise<Buffer> {
  const N = 2 ** params.log2N;
  const options: ScryptOptions = { N, r: params.r, p: params.p, maxmem: 256 * N * params.r };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const params = currentParams();
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, params);
  return ["scrypt", params.log2N, params.r, params.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

function parseHash(stored: string): (Params & { salt: Buffer; hash: Buffer }) | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, log2N, r, p, salt, hash] = parts;
  const params = { log2N: Number(log2N), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.log2N) || params.log2N < 10 || params.log2N > 20) return null;
  if (!Number.isInteger(params.r) || !Number.isInteger(params.p)) return null;
  return { ...params, salt: Buffer.from(salt ?? "", "base64"), hash: Buffer.from(hash ?? "", "base64") };
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const candidate = await scrypt(password, parsed.salt, parsed);
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** Gibt true zurück, wenn der Hash mit veralteten Parametern erzeugt wurde. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  const params = currentParams();
  return !parsed || parsed.log2N !== params.log2N || parsed.r !== params.r || parsed.p !== params.p;
}

let dummyHash: Promise<string> | undefined;
/** Gleicht Antwortzeiten an, wenn ein Konto nicht existiert (erschwert Kontoaufzählung). */
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummyHash);
}

// Kleine Liste besonders häufiger Passwörter (Ergänzung zur Mindestlänge).
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "passwort1234",
  "password1234",
  "qwertzuiop12",
  "qwertyuiop12",
  "hallohallo12",
  "ichliebedich",
  "iloveyou1234",
  "000000000000",
  "111111111111",
  "abcdefghijkl",
  "passwortpasswort",
  "passwordpassword",
]);

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`)
  .max(PASSWORD_MAX_LENGTH, `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: "Dieses Passwort ist zu häufig. Bitte wähle ein anderes.",
  })
  .refine((value) => new Set(value).size >= 5, {
    message: "Das Passwort ist zu einfach. Verwende mehr unterschiedliche Zeichen.",
  });

/** Prüft, ob das Passwort Teile der E-Mail oder des Nutzernamens enthält. */
export function passwordContainsIdentity(password: string, identities: string[]): boolean {
  const lower = password.toLowerCase();
  return identities
    .map((identity) => identity.toLowerCase().split("@")[0] ?? "")
    .filter((part) => part.length >= 4)
    .some((part) => lower.includes(part));
}
