import { describe, expect, it } from "vitest";
import { creatorCanOperate, verificationDisplay } from "@/lib/verification";
import { dueMinutes, isTerminal, nextStatus } from "@/server/video/state-machine";
import { sniffImageType } from "@/server/media/validation";
import { redact } from "@/server/log";
import { priorityFor } from "@/server/moderation/service";
import { slugify } from "@/server/auth/service";
import { maskEmail } from "@/server/admin/service";

describe("Verifizierungsstatus", () => {
  it("nur ein echter Anbieter mit Status „verified“ gilt als verifiziert", () => {
    expect(verificationDisplay("verified", "acme-kyc").isVerified).toBe(true);
    expect(verificationDisplay("verified", "mock").isVerified).toBe(false);
    for (const status of ["not_started", "pending", "test_passed", "rejected", "expired", null, undefined] as const) {
      expect(verificationDisplay(status, "mock").isVerified).toBe(false);
      expect(verificationDisplay(status, "acme-kyc").label).not.toBe("Verifiziert");
    }
    expect(verificationDisplay("test_passed", "mock").label).toContain("Testmodus");
  });

  it("Freischaltung: Echtbetrieb nur mit echter Prüfung, Testmodus zusätzlich mit Mock-Ergebnis", () => {
    expect(creatorCanOperate("verified", "acme-kyc", false)).toBe(true);
    expect(creatorCanOperate("test_passed", "mock", false)).toBe(false);
    expect(creatorCanOperate("test_passed", "mock", true)).toBe(true);
    expect(creatorCanOperate("pending", "mock", true)).toBe(false);
    expect(creatorCanOperate(undefined, undefined, true)).toBe(false);
    expect(creatorCanOperate("verified", "mock", false)).toBe(false);
  });
});

describe("Sitzungs-Zustandsautomat", () => {
  it("erlaubt nur definierte Übergänge", () => {
    expect(nextStatus("requested", "accept")).toBe("accepted");
    expect(nextStatus("requested", "start")).toBeNull();
    expect(nextStatus("accepted", "start")).toBe("active");
    expect(nextStatus("active", "accept")).toBeNull();
    expect(nextStatus("active", "end")).toBe("ended");
    expect(nextStatus("ended", "start")).toBeNull();
    expect(isTerminal("ended")).toBe(true);
    expect(isTerminal("active")).toBe(false);
  });

  it("berechnet jede begonnene Minute (Prepaid)", () => {
    const start = new Date("2026-10-18T12:00:00Z");
    expect(dueMinutes(start, new Date("2026-10-18T12:00:00Z"))).toBe(1);
    expect(dueMinutes(start, new Date("2026-10-18T12:00:59Z"))).toBe(1);
    expect(dueMinutes(start, new Date("2026-10-18T12:01:00Z"))).toBe(2);
    expect(dueMinutes(start, new Date("2026-10-18T11:59:00Z"))).toBe(0);
  });
});

describe("Upload-Typprüfung", () => {
  it("erkennt Bildformate an den Magic Bytes, nicht an der Endung", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "binary"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a......"))).toBeNull();
  });
});

describe("Datenschutz in Logs und Admin-Ansichten", () => {
  it("schwärzt sensible Felder rekursiv", () => {
    const result = redact({ userId: "u1", email: "a@b.c", password: "x", nested: { token: "t", sessionId: "s" }, message: "privat" }) as Record<string, unknown>;
    expect(result.userId).toBe("u1");
    expect(result.email).toBe("[redacted]");
    expect(result.password).toBe("[redacted]");
    expect(result.message).toBe("[redacted]");
    expect(result.nested).toEqual({ token: "[redacted]", sessionId: "s" });
  });

  it("maskiert E-Mail-Adressen", () => {
    expect(maskEmail("kunde@aurora.test")).toBe("k•••@a•••.test");
    expect(maskEmail("kaputt")).toBe("•••");
  });
});

describe("Moderation & Hilfsfunktionen", () => {
  it("priorisiert Meldungen zu Minderjährigen und nicht einvernehmlichen Inhalten als kritisch", () => {
    expect(priorityFor("minor_suspected")).toBe("critical");
    expect(priorityFor("non_consensual")).toBe("critical");
    expect(priorityFor("illegal_content")).toBe("critical");
    expect(priorityFor("violence_or_threat")).toBe("high");
    expect(priorityFor("spam")).toBe("normal");
  });

  it("erzeugt URL-sichere Slugs", () => {
    expect(slugify("Lena_Müller.99")).toBe("lena-muller-99");
    expect(slugify("Ä")).toBe("creator-a");
  });
});
