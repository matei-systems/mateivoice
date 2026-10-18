import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { authSessions, creatorOffers, creatorProfiles, emailOutbox, userConsents, users } from "@/server/db/schema";
import {
  changePassword,
  confirmTotpEnrollment,
  deleteAccount,
  disableTotp,
  login,
  registerUser,
  requestPasswordReset,
  resetPassword,
  startTotpEnrollment,
  verifyEmail,
  verifyLoginMfa,
} from "@/server/auth/service";
import { validateSessionToken } from "@/server/auth/session";
import { generateTotp, generateTotpSecret } from "@/server/auth/totp";
import { TEST_PASSWORD, createSessionFor, createUser } from "../support/db-helpers";

const ctx = { ipHash: "test-ip-hash", userAgent: "vitest" };

function registration(overrides: Record<string, unknown> = {}) {
  return {
    email: `neu-${Math.random().toString(36).slice(2)}@example.test`,
    username: `nutzer_${Math.random().toString(36).slice(2, 10)}`,
    password: "Ein-sehr-sicheres-Passwort-7",
    role: "customer",
    confirmAdult: "on",
    acceptTerms: "on",
    acceptPrivacy: "on",
    ...overrides,
  };
}

async function latestMailToken(to: string, template: string) {
  const [mail] = await getDb()
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toAddress, to), eq(emailOutbox.template, template)))
    .orderBy(sql`${emailOutbox.createdAt} DESC`)
    .limit(1);
  const match = mail?.bodyText?.match(/token=([A-Za-z0-9_%-]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

describe("Registrierung", () => {
  it("legt Kundenkonto mit Zustimmungen an und versendet (nur in die Dev-Mailbox) eine Bestätigung", async () => {
    const input = registration();
    const result = await registerUser(input, ctx);
    expect(result.userId).toBeTruthy();
    const [user] = await getDb().select().from(users).where(eq(users.id, result.userId!));
    expect(user?.role).toBe("customer");
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.passwordHash).not.toContain(input.password);
    const consents = await getDb().select().from(userConsents).where(eq(userConsents.userId, user!.id));
    expect(consents.map((c) => c.document).sort()).toEqual(["community_guidelines", "privacy", "terms"]);
    const [mail] = await getDb().select().from(emailOutbox).where(eq(emailOutbox.toAddress, input.email));
    expect(mail?.status).toBe("stored_dev");
  });

  it("Creator-Registrierung erstellt Profilentwurf mit deaktiviertem Angebot", async () => {
    const result = await registerUser(registration({ role: "creator", acceptCreatorAgreement: "on" }), ctx);
    const [profile] = await getDb().select().from(creatorProfiles).where(eq(creatorProfiles.userId, result.userId!));
    expect(profile?.reviewStatus).toBe("draft");
    expect(profile?.availability).toBe("offline");
    const [offer] = await getDb().select().from(creatorOffers).where(eq(creatorOffers.creatorProfileId, profile!.id));
    expect(offer?.enabled).toBe(false);
  });

  it("Creator müssen die Creator-Vereinbarung bestätigen", async () => {
    await expect(registerUser(registration({ role: "creator" }), ctx)).rejects.toMatchObject({ code: "validation" });
  });

  it("Admin-Konten können nicht registriert werden", async () => {
    await expect(registerUser(registration({ role: "admin" }), ctx)).rejects.toMatchObject({ code: "validation" });
  });

  it("verlangt Volljährigkeitsbestätigung und Zustimmung", async () => {
    await expect(registerUser(registration({ confirmAdult: undefined }), ctx)).rejects.toMatchObject({ code: "validation" });
    await expect(registerUser(registration({ acceptTerms: undefined }), ctx)).rejects.toMatchObject({ code: "validation" });
  });

  it("verrät nicht, ob eine E-Mail bereits registriert ist", async () => {
    const input = registration();
    await registerUser(input, ctx);
    const second = await registerUser({ ...registration(), email: input.email.toUpperCase() }, ctx);
    expect(second.status).toBe("accepted");
    expect(second.userId).toBeNull();
    const mails = await getDb().select().from(emailOutbox).where(eq(emailOutbox.toAddress, input.email));
    expect(mails.map((m) => m.template).sort()).toEqual(["email_verification", "registration_attempt_existing"]);
  });

  it("lehnt doppelte Nutzernamen ab (unabhängig von Groß-/Kleinschreibung)", async () => {
    const input = registration();
    await registerUser(input, ctx);
    await expect(registerUser(registration({ username: input.username.toUpperCase() }), ctx)).rejects.toMatchObject({ code: "validation" });
  });

  it("begrenzt Registrierungen pro IP", async () => {
    const ipCtx = { ipHash: "flood-ip", userAgent: null };
    for (let i = 0; i < 5; i++) await registerUser(registration(), ipCtx);
    await expect(registerUser(registration(), ipCtx)).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("E-Mail-Bestätigung", () => {
  it("bestätigt die E-Mail genau einmal", async () => {
    const input = registration();
    const { userId } = await registerUser(input, ctx);
    const token = await latestMailToken(input.email, "email_verification");
    expect(token).toBeTruthy();
    expect(await verifyEmail(token!)).toBe("verified");
    expect(await verifyEmail(token!)).toBe("invalid");
    const [user] = await getDb().select().from(users).where(eq(users.id, userId!));
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(await verifyEmail("ungueltiger-token-1234567890")).toBe("invalid");
  });
});

describe("Anmeldung", () => {
  it("meldet mit korrektem Passwort an und erstellt eine serverseitige Sitzung", async () => {
    const user = await createUser();
    const result = await login({ email: user.email, password: TEST_PASSWORD }, ctx);
    expect(result.mfaPending).toBe(false);
    const session = await validateSessionToken(result.token);
    expect(session?.user.id).toBe(user.id);
    // In der Datenbank liegt nur der Hash des Tokens.
    const rows = await getDb().select().from(authSessions).where(eq(authSessions.userId, user.id));
    expect(rows[0]?.id).not.toBe(result.token);
  });

  it("liefert identische Fehlermeldung für falsches Passwort und unbekanntes Konto", async () => {
    const user = await createUser();
    const wrong = await login({ email: user.email, password: "falsches-passwort-123" }, ctx).catch((e) => e);
    const unknown = await login({ email: "gibt-es-nicht@example.test", password: "egal-egal-egal" }, ctx).catch((e) => e);
    expect(wrong.code).toBe("unauthenticated");
    expect(unknown.code).toBe("unauthenticated");
    expect(wrong.userMessage).toBe(unknown.userMessage);
  });

  it("begrenzt Fehlversuche je Konto", async () => {
    const user = await createUser();
    for (let i = 0; i < 8; i++) {
      await login({ email: user.email, password: "falsch-falsch-falsch" }, { ipHash: `ip-${i}`, userAgent: null }).catch(() => undefined);
    }
    await expect(login({ email: user.email, password: TEST_PASSWORD }, { ipHash: "ip-x", userAgent: null })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("gelöschte Konten können sich nicht anmelden", async () => {
    const user = await createUser();
    await deleteAccount({ userId: user.id, password: TEST_PASSWORD, confirmation: "LÖSCHEN" });
    await expect(login({ email: user.email, password: TEST_PASSWORD }, ctx)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("Zwei-Faktor-Authentifizierung", () => {
  it("Einrichtung, Anmeldung mit TOTP und Replay-Schutz", async () => {
    const user = await createUser({ role: "admin" });
    const first = await createSessionFor(user);
    const { secret } = await startTotpEnrollment(user.id);
    await expect(
      confirmTotpEnrollment({ userId: user.id, sessionId: first.id, code: "000000" }, ctx),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    await confirmTotpEnrollment({ userId: user.id, sessionId: first.id, code: generateTotp(secret, Date.now() - 30_000) }, ctx);

    const result = await login({ email: user.email, password: TEST_PASSWORD }, ctx);
    expect(result.mfaPending).toBe(true);
    const pending = await validateSessionToken(result.token);
    expect(pending?.mfaPending).toBe(true);

    const code = generateTotp(secret);
    await verifyLoginMfa({ sessionId: pending!.sessionId, userId: user.id, code }, ctx);
    const verified = await validateSessionToken(result.token);
    expect(verified?.mfaVerified).toBe(true);
    expect(verified?.mfaPending).toBe(false);

    // Derselbe Code kann kein zweites Mal verwendet werden.
    const again = await login({ email: user.email, password: TEST_PASSWORD }, ctx);
    const againSession = await validateSessionToken(again.token);
    await expect(verifyLoginMfa({ sessionId: againSession!.sessionId, userId: user.id, code }, ctx)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("Admins können 2FA nicht deaktivieren", async () => {
    const secret = generateTotpSecret();
    const admin = await createUser({ role: "admin", totpSecret: secret });
    await expect(disableTotp({ userId: admin.id, password: TEST_PASSWORD, code: generateTotp(secret) })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("Passwort", () => {
  it("Zurücksetzen beendet alle Sitzungen und ist einmalig", async () => {
    const user = await createUser();
    const session = await createSessionFor(user);
    await requestPasswordReset(user.email, ctx);
    const token = await latestMailToken(user.email, "password_reset");
    await resetPassword({ token: token!, password: "Ganz-neues-Passwort-2026" });
    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(resetPassword({ token: token!, password: "Noch-ein-Passwort-2026" })).rejects.toMatchObject({ code: "invalid_state" });
    await expect(login({ email: user.email, password: TEST_PASSWORD }, ctx)).rejects.toMatchObject({ code: "unauthenticated" });
    await login({ email: user.email, password: "Ganz-neues-Passwort-2026" }, ctx);
  });

  it("Anforderung für unbekannte E-Mail verhält sich identisch und versendet nichts", async () => {
    await expect(requestPasswordReset("niemand@example.test", ctx)).resolves.toBeUndefined();
    const mails = await getDb().select().from(emailOutbox).where(eq(emailOutbox.toAddress, "niemand@example.test"));
    expect(mails).toHaveLength(0);
  });

  it("Passwortänderung beendet andere Sitzungen, aber nicht die aktuelle", async () => {
    const user = await createUser();
    const current = await createSessionFor(user);
    const other = await createSessionFor(user);
    await changePassword({ userId: user.id, currentSessionId: current.id, currentPassword: TEST_PASSWORD, newPassword: "Neues-starkes-Passwort-1" });
    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
  });
});

describe("Kontolöschung", () => {
  it("anonymisiert personenbezogene Daten und beendet Sitzungen", async () => {
    const user = await createUser();
    const session = await createSessionFor(user);
    await expect(deleteAccount({ userId: user.id, password: TEST_PASSWORD, confirmation: "nein" })).rejects.toMatchObject({ code: "validation" });
    await deleteAccount({ userId: user.id, password: TEST_PASSWORD, confirmation: "LÖSCHEN" });
    const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(row?.status).toBe("deleted");
    expect(row?.email).not.toBe(user.email);
    expect(row?.passwordHash).toBeNull();
    expect(await validateSessionToken(session.token)).toBeNull();
  });
});
