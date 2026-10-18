import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateTotp,
  generateTotpSecret,
  hotp,
  totpStep,
  verifyTotp,
} from "@/server/auth/totp";

// RFC 6238, Anhang B (SHA-1, Secret = ASCII "12345678901234567890", 8 Stellen)
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(RFC_VECTORS)("erzeugt den RFC-Testvektor für t=%i", (seconds, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it("Base32 ist umkehrbar", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("akzeptiert den aktuellen Code und ±1 Zeitschritt", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, generateTotp(secret, now), { timeMs: now })).toBe(totpStep(now));
    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), { timeMs: now })).toBe(totpStep(now) - 1);
    expect(verifyTotp(secret, generateTotp(secret, now + 30_000), { timeMs: now })).toBe(totpStep(now) + 1);
  });

  it("lehnt alte Codes außerhalb des Fensters ab", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, generateTotp(secret, now - 120_000), { timeMs: now })).toBeNull();
  });

  it("verhindert die Wiederverwendung eines Zeitschritts (Replay)", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotp(secret, now);
    const step = verifyTotp(secret, code, { timeMs: now });
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, { timeMs: now, lastUsedStep: step })).toBeNull();
  });

  it("lehnt ungültige Formate ab", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "abc123")).toBeNull();
    expect(verifyTotp(secret, "12345")).toBeNull();
  });

  it("baut eine otpauth-URI", () => {
    const uri = buildOtpAuthUri("ABCDEF", "admin@example.test", "Project Aurora");
    expect(uri.startsWith("otpauth://totp/Project%20Aurora%3Aadmin%40example.test?")).toBe(true);
    expect(uri).toContain("secret=ABCDEF");
  });
});
