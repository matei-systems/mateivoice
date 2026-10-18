import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP nach RFC 6238 (HMAC-SHA1, 30-Sekunden-Schritte, 6 Stellen) – kompatibel
 * mit gängigen Authenticator-Apps. Ohne Fremdbibliothek implementiert und gegen
 * die Testvektoren aus RFC 6238 getestet.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Ungültiges Base32-Zeichen");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export const TOTP_STEP_SECONDS = 30;

export function totpStep(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

export function generateTotp(secretBase32: string, timeMs = Date.now(), digits = 6): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs), digits);
}

/**
 * Prüft einen Code mit ±1 Zeitschritt Toleranz. Gibt den verwendeten Zeitschritt
 * zurück (für Replay-Schutz) oder null. Bereits verwendete Schritte werden abgelehnt.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { timeMs?: number; lastUsedStep?: number | null; window?: number } = {},
): number | null {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(options.timeMs ?? Date.now());
  const window = options.window ?? 1;
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;
    if (hotp(secret, step) === normalized) return step;
  }
  return null;
}

export function buildOtpAuthUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
