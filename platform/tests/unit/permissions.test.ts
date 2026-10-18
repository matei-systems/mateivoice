import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  canEditCreatorProfile,
  canJoinSession,
  canViewCreatorEarnings,
  canViewSession,
  canViewWallet,
  hasPermission,
  homePathFor,
  type Actor,
} from "@/server/auth/permissions";

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  id: "u-1",
  role: "customer",
  status: "active",
  emailVerified: true,
  ...overrides,
});

const customer = actor();
const creator = actor({ id: "c-1", role: "creator" });
const admin = actor({ id: "a-1", role: "admin" });

describe("Rollenberechtigungen", () => {
  it("Gäste haben keinerlei Berechtigungen", () => {
    for (const permission of PERMISSIONS) expect(hasPermission(null, permission)).toBe(false);
  });

  it("Kunden können keine Admin- oder Studio-Funktionen ausführen", () => {
    for (const permission of PERMISSIONS.filter((p) => p.startsWith("admin.") || p.startsWith("studio."))) {
      expect(hasPermission(customer, permission)).toBe(false);
    }
  });

  it("Creator haben keine Admin-Berechtigungen und kein Testguthaben", () => {
    for (const permission of PERMISSIONS.filter((p) => p.startsWith("admin."))) {
      expect(hasPermission(creator, permission)).toBe(false);
    }
    expect(hasPermission(creator, "wallet.request_test_credit")).toBe(false);
    expect(hasPermission(creator, "sessions.request_private")).toBe(false);
  });

  it("Admins haben Admin-Berechtigungen, aber keine Kunden-/Creator-Aktionen", () => {
    expect(hasPermission(admin, "admin.access")).toBe(true);
    expect(hasPermission(admin, "admin.ledger.adjust")).toBe(true);
    expect(hasPermission(admin, "sessions.request_private")).toBe(false);
    expect(hasPermission(admin, "studio.profile.edit")).toBe(false);
  });

  it("gesperrte Konten dürfen nur Konto ansehen, Support kontaktieren und Einspruch erheben", () => {
    const suspended = actor({ status: "suspended" });
    const allowed = PERMISSIONS.filter((p) => hasPermission(suspended, p));
    expect(allowed.sort()).toEqual(["account.view", "appeals.create", "support.create"].sort());
    expect(hasPermission(actor({ role: "admin", status: "suspended" }), "admin.access")).toBe(false);
  });

  it("gelöschte Konten haben keine Berechtigungen", () => {
    const deleted = actor({ status: "deleted" });
    for (const permission of PERMISSIONS) expect(hasPermission(deleted, permission)).toBe(false);
  });

  it("ohne bestätigte E-Mail sind kritische Aktionen gesperrt", () => {
    const unverified = actor({ emailVerified: false });
    expect(hasPermission(unverified, "sessions.request_private")).toBe(false);
    expect(hasPermission(unverified, "wallet.request_test_credit")).toBe(false);
    expect(hasPermission(unverified, "wallet.view")).toBe(true);
  });
});

describe("Ressourcen-Richtlinien (IDOR-Schutz)", () => {
  const privateSession = { kind: "private_chat", customerUserId: "u-1", creatorUserId: "c-1" };

  it("nur Teilnehmer und Admins sehen private Sitzungen", () => {
    expect(canViewSession(customer, privateSession)).toBe(true);
    expect(canViewSession(creator, privateSession)).toBe(true);
    expect(canViewSession(admin, privateSession)).toBe(true);
    expect(canViewSession(actor({ id: "u-2" }), privateSession)).toBe(false);
    expect(canViewSession(actor({ id: "c-2", role: "creator" }), privateSession)).toBe(false);
    expect(canViewSession(null, privateSession)).toBe(false);
  });

  it("private Sitzungen sind nicht öffentlich betretbar", () => {
    expect(canJoinSession(customer, privateSession)).toBe(true);
    expect(canJoinSession(actor({ id: "u-2" }), privateSession)).toBe(false);
    expect(canJoinSession(null, privateSession)).toBe(false);
    // Auch Admins treten nicht still privaten Sitzungen bei.
    expect(canJoinSession(admin, privateSession)).toBe(false);
  });

  it("öffentliche Streams nur für angemeldete Kunden und den Creator selbst", () => {
    const publicStream = { kind: "public_stream", customerUserId: null, creatorUserId: "c-1" };
    expect(canJoinSession(actor({ id: "u-9" }), publicStream)).toBe(true);
    expect(canJoinSession(creator, publicStream)).toBe(true);
    expect(canJoinSession(actor({ id: "c-2", role: "creator" }), publicStream)).toBe(false);
    expect(canJoinSession(null, publicStream)).toBe(false);
  });

  it("Creator bearbeiten nur das eigene Profil", () => {
    expect(canEditCreatorProfile(creator, { userId: "c-1" })).toBe(true);
    expect(canEditCreatorProfile(creator, { userId: "c-2" })).toBe(false);
    expect(canEditCreatorProfile(customer, { userId: "u-1" })).toBe(false);
    expect(canEditCreatorProfile(admin, { userId: "c-1" })).toBe(false);
  });

  it("Creator sehen nur eigene Einnahmen", () => {
    expect(canViewCreatorEarnings(creator, "c-1")).toBe(true);
    expect(canViewCreatorEarnings(creator, "c-2")).toBe(false);
    expect(canViewCreatorEarnings(customer, "c-1")).toBe(false);
    expect(canViewCreatorEarnings(admin, "c-1")).toBe(true);
  });

  it("Konten sind nur für den Inhaber einsehbar", () => {
    expect(canViewWallet(customer, "u-1")).toBe(true);
    expect(canViewWallet(customer, "u-2")).toBe(false);
    expect(canViewWallet(admin, "u-2")).toBe(true);
  });

  it("leitet je Rolle in den passenden Bereich", () => {
    expect(homePathFor("customer")).toBe("/account");
    expect(homePathFor("creator")).toBe("/studio");
    expect(homePathFor("admin")).toBe("/admin");
  });
});
