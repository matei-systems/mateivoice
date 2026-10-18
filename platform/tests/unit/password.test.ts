import { describe, expect, it } from "vitest";
import {
  hashPassword,
  needsRehash,
  passwordContainsIdentity,
  passwordSchema,
  verifyPassword,
} from "@/server/auth/password";

describe("Passwort-Hashing", () => {
  it("hasht mit scrypt und Salt und verifiziert korrekt", async () => {
    const hash = await hashPassword("Ein-langes-Passwort-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("Ein-langes-Passwort-123");
    expect(await verifyPassword("Ein-langes-Passwort-123", hash)).toBe(true);
    expect(await verifyPassword("ein-langes-passwort-123", hash)).toBe(false);
  });

  it("erzeugt bei gleichem Passwort unterschiedliche Hashes", async () => {
    const [a, b] = await Promise.all([hashPassword("Gleiches-Passwort-99"), hashPassword("Gleiches-Passwort-99")]);
    expect(a).not.toBe(b);
  });

  it("lehnt manipulierte oder leere Hashes ab", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "bcrypt$foo")).toBe(false);
    expect(await verifyPassword("x", "scrypt$99$8$1$AAAA$BBBB")).toBe(false);
  });

  it("erkennt veraltete Parameter", async () => {
    const hash = await hashPassword("Noch-ein-Passwort-1");
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash(hash.replace(/^scrypt\$10\$/, "scrypt$11$"))).toBe(true);
  });
});

describe("Passwortrichtlinie", () => {
  it("verlangt mindestens 12 Zeichen", () => {
    expect(passwordSchema.safeParse("kurz").success).toBe(false);
    expect(passwordSchema.safeParse("ausreichend-lang-1").success).toBe(true);
  });

  it("lehnt häufige und triviale Passwörter ab", () => {
    expect(passwordSchema.safeParse("password1234").success).toBe(false);
    expect(passwordSchema.safeParse("aaaaaaaaaaaaaa").success).toBe(false);
  });

  it("erkennt E-Mail oder Nutzernamen im Passwort", () => {
    expect(passwordContainsIdentity("mein-lena99-passwort", ["lena99@example.test"])).toBe(true);
    expect(passwordContainsIdentity("voellig-anderes-pw", ["lena99@example.test", "lena99"])).toBe(false);
  });
});
