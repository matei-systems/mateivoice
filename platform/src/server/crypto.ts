import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "@/config/env";

/** Kryptographisch sicherer Zufallstoken (Base64url, 256 Bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSha256(secret: string | Buffer, input: string): Buffer {
  return createHmac("sha256", secret).update(input, "utf8").digest();
}

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === "string" ? Buffer.from(a) : a;
  const bufB = typeof b === "string" ? Buffer.from(b) : b;
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Pseudonymisierter IP-Hash (HMAC mit Server-Geheimnis). Die IP-Adresse selbst
 * wird nicht gespeichert (Datensparsamkeit).
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmacSha256(getEnv().AUTH_SECRET, `ip:${ip}`).toString("hex").slice(0, 32);
}

/** Pseudonymisierter Schlüssel für Rate-Limits u. Ä. */
export function hashIdentifier(namespace: string, value: string): string {
  return hmacSha256(getEnv().AUTH_SECRET, `${namespace}:${value}`).toString("hex").slice(0, 32);
}

const ENCRYPTION_VERSION = "v1";

function encryptionKey(): Buffer {
  return Buffer.from(getEnv().DATA_ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM-Verschlüsselung für sensible Felder (z. B. TOTP-Geheimnisse). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== ENCRYPTION_VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Unbekanntes Verschlüsselungsformat");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
