import { describe, expect, it } from "vitest";
import { formatBps, splitCommission } from "@/server/ledger/commission";
import { commission } from "@/config/platform";
import { formatCoins, formatDuration, formatEuroCents, safeRedirectPath, viennaDayKey } from "@/lib/utils";
import { EnvValidationError, parseEnv } from "@/config/env";

describe("Provisionsberechnung", () => {
  it("verwendet zentral konfigurierte 30 % als Standard", () => {
    expect(commission.defaultPlatformBps).toBe(3000);
    expect(splitCommission(100, 3000)).toEqual({ gross: 100, platformShare: 30, creatorShare: 70, platformBps: 3000 });
  });

  it("rundet den Creator-Anteil ab, Summe bleibt exakt", () => {
    for (const gross of [0, 1, 7, 33, 41, 99, 12345]) {
      const split = splitCommission(gross, 3000);
      expect(split.platformShare + split.creatorShare).toBe(gross);
      expect(Number.isInteger(split.creatorShare)).toBe(true);
    }
    expect(splitCommission(41, 3000)).toMatchObject({ creatorShare: 28, platformShare: 13 });
  });

  it("lehnt ungültige Eingaben ab", () => {
    expect(() => splitCommission(-1, 3000)).toThrow();
    expect(() => splitCommission(1.5, 3000)).toThrow();
    expect(() => splitCommission(10, 10001)).toThrow();
  });

  it("formatiert Basispunkte", () => {
    expect(formatBps(3000)).toBe("30 %");
    expect(formatBps(2550)).toBe("25,5 %");
  });
});

describe("Formatierung", () => {
  it("formatiert Münzen, Euro-Cent und Dauer", () => {
    // de-AT (CLDR) trennt Tausender mit schmalem Leerzeichen.
    const normalize = (value: string) => value.replace(/[\s\u202f\u00a0]/g, " ");
    expect(normalize(formatCoins(1250))).toBe("1 250");
    expect(normalize(formatEuroCents(999))).toBe("€ 9,99");
    expect(normalize(formatEuroCents(100000))).toBe("€ 1.000,00");
    expect(normalize(formatEuroCents(-5))).toBe("-€ 0,05");
    expect(() => formatEuroCents(9.99)).toThrow();
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("berechnet den Kalendertag in Europe/Vienna", () => {
    // 23:30 UTC am 31.12. ist in Wien bereits der 1.1.
    expect(viennaDayKey(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("verhindert offene Weiterleitungen", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath(undefined, "/x")).toBe("/x");
  });
});

describe("Umgebungsvalidierung", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    AUTH_SECRET: "a".repeat(40),
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  };

  it("akzeptiert eine gültige Entwicklungskonfiguration", () => {
    const env = parseEnv({ ...base, APP_ENV: "development" });
    expect(env.TEST_MODE).toBe(true);
    expect(env.PLATFORM_COMMISSION_BPS).toBe(3000);
  });

  it("verbietet Testmodus und Mock-Anbieter in Produktion", () => {
    try {
      parseEnv({ ...base, APP_ENV: "production", APP_URL: "https://example.test" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues.join("\n");
      expect(issues).toContain("TEST_MODE");
      expect(issues).toContain("PAYMENT_PROVIDER");
      expect(issues).toContain("VIDEO_PROVIDER");
      expect(issues).toContain("IDENTITY_PROVIDER");
      expect(issues).toContain("EMAIL_PROVIDER");
    }
  });

  it("gibt bei Fehlern keine geheimen Werte aus", () => {
    try {
      parseEnv({ ...base, AUTH_SECRET: "zu-kurz-geheim" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("zu-kurz-geheim");
    }
  });
});
