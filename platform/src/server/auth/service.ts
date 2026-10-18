import "server-only";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { brand, legalDocuments, minimumAge, pricing } from "@/config/platform";
import { getDb, type Executor } from "@/server/db/client";
import {
  authTokens,
  creatorOffers,
  creatorProfiles,
  notificationPreferences,
  userConsents,
  users,
} from "@/server/db/schema";
import { decryptField, encryptField, hashIdentifier, randomToken, sha256Hex } from "@/server/crypto";
import { AppError, PG_UNIQUE_VIOLATION, pgConstraint, pgErrorCode, validationError } from "@/server/errors";
import { writeAuditLog } from "@/server/audit";
import { log } from "@/server/log";
import { emailTemplates, sendEmail } from "@/server/notifications/email";
import { RATE_LIMITS, consumeRateLimit, enforceRateLimit } from "@/server/rate-limit";
import {
  burnPasswordCheck,
  hashPassword,
  needsRehash,
  passwordContainsIdentity,
  passwordSchema,
  verifyPassword,
} from "./password";
import {
  createAuthSession,
  invalidateAllUserSessions,
  markSessionMfaVerified,
} from "./session";
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from "./totp";
import type { Role } from "./permissions";

export type RequestContext = { ipHash: string | null; userAgent: string | null };

// ── Validierung ─────────────────────────────────────────────────────────────

export const emailSchema = z
  .string({ error: "Bitte gib deine E-Mail-Adresse ein." })
  .trim()
  .toLowerCase()
  .max(254, "Die E-Mail-Adresse ist zu lang.")
  .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein."));

export const usernameSchema = z
  .string({ error: "Bitte wähle einen Nutzernamen." })
  .trim()
  .regex(
    /^[A-Za-z0-9_.-]{3,24}$/,
    "Der Nutzername muss 3–24 Zeichen lang sein (Buchstaben, Ziffern, Punkt, Binde- oder Unterstrich).",
  );

const checkbox = (message: string) =>
  z.union([z.literal("on"), z.literal("true"), z.literal(true)], { error: message }).transform(() => true);

export const registrationSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    role: z.enum(["customer", "creator"], { error: "Bitte wähle eine Kontoart." }),
    confirmAdult: checkbox(`Die Plattform ist ausschließlich für Personen ab ${minimumAge} Jahren.`),
    acceptTerms: checkbox("Bitte bestätige die Nutzungsbedingungen."),
    acceptPrivacy: checkbox("Bitte bestätige, dass du die Datenschutzinformation gelesen hast."),
    acceptCreatorAgreement: z.union([z.literal("on"), z.literal("true"), z.boolean()]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "creator" && !value.acceptCreatorAgreement) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptCreatorAgreement"],
        message: "Bitte bestätige die Creator-Vereinbarung.",
      });
    }
    if (passwordContainsIdentity(value.password, [value.email, value.username])) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Das Passwort darf weder deinen Nutzernamen noch deine E-Mail-Adresse enthalten.",
      });
    }
  });

export type RegistrationInput = z.input<typeof registrationSchema>;

// ── Einmal-Token ────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
} as const;

async function issueToken(executor: Executor, userId: string, purpose: keyof typeof TOKEN_TTL_MS) {
  // Ältere, noch offene Token desselben Zwecks werden entwertet.
  await executor
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const token = randomToken(32);
  await executor.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/** Löst einen Token atomar ein (nur einmal verwendbar). */
async function consumeToken(executor: Executor, token: string, purpose: keyof typeof TOKEN_TTL_MS) {
  if (!token || token.length > 100) return null;
  const [row] = await executor
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256Hex(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row ?? null;
}

// ── Registrierung ───────────────────────────────────────────────────────────

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length >= 2 ? slug.slice(0, 40).replace(/-+$/g, "") : `creator-${slug || "profil"}`;
}

async function uniqueSlug(executor: Executor, base: string) {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [existing] = await executor
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export type RegistrationResult = { status: "accepted"; userId: string | null };

/**
 * Registriert ein Kunden- oder Creator-Konto. Admin-Konten können NICHT über
 * diese Funktion erstellt werden (siehe scripts/create-admin.ts).
 *
 * Schutz gegen Kontoaufzählung: Bei bereits registrierter E-Mail wird dieselbe
 * Antwort geliefert und der Kontoinhaber per E-Mail informiert.
 */
export async function registerUser(rawInput: unknown, ctx: RequestContext): Promise<RegistrationResult> {
  if (ctx.ipHash) await enforceRateLimit(`register:ip:${ctx.ipHash}`, RATE_LIMITS.registerPerIp);
  const parsed = registrationSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  const input = parsed.data;

  const passwordHash = await hashPassword(input.password);
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      const [existingEmail] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existingEmail) {
        await sendEmail({ to: input.email, ...emailTemplates.registrationAttemptExisting() }, tx);
        return { status: "accepted" as const, userId: null };
      }
      const [existingUsername] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${input.username})`)
        .limit(1);
      if (existingUsername) throw validationError("Dieser Nutzername ist bereits vergeben.");

      const now = new Date();
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          username: input.username,
          passwordHash,
          role: input.role,
          adultSelfDeclaredAt: now,
        })
        .returning({ id: users.id });
      if (!user) throw new Error("Benutzer konnte nicht angelegt werden");

      const consents: { document: "terms" | "privacy" | "community_guidelines" | "creator_agreement"; version: string }[] = [
        { document: "terms", version: legalDocuments.terms.version },
        { document: "privacy", version: legalDocuments.privacy.version },
        { document: "community_guidelines", version: legalDocuments.communityGuidelines.version },
      ];
      if (input.role === "creator") {
        consents.push({ document: "creator_agreement", version: legalDocuments.creatorAgreement.version });
      }
      await tx.insert(userConsents).values(
        consents.map((consent) => ({
          userId: user.id,
          document: consent.document,
          documentVersion: consent.version,
          ipHash: ctx.ipHash,
        })),
      );
      await tx.insert(notificationPreferences).values({ userId: user.id });

      if (input.role === "creator") {
        const slug = await uniqueSlug(tx, slugify(input.username));
        const [profile] = await tx
          .insert(creatorProfiles)
          .values({ userId: user.id, slug, displayName: input.username.slice(0, 40) })
          .returning({ id: creatorProfiles.id });
        await tx.insert(creatorOffers).values({
          creatorProfileId: profile!.id,
          kind: "private_chat",
          enabled: false,
          coinsPerMinute: pricing.privateChat.defaultCoinsPerMinute,
        });
      }

      const token = await issueToken(tx, user.id, "email_verification");
      await sendEmail({ to: input.email, ...emailTemplates.emailVerification(token) }, tx);
      return { status: "accepted" as const, userId: user.id };
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      const constraint = pgConstraint(error);
      if (constraint === "users_username_lower_unique") throw validationError("Dieser Nutzername ist bereits vergeben.");
      if (constraint === "users_email_unique") return { status: "accepted", userId: null };
    }
    throw error;
  }
}

// ── Anmeldung ───────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Bitte gib dein Passwort ein.").max(256),
});

export type LoginResult = {
  token: string;
  expiresAt: Date;
  role: Role;
  mfaPending: boolean;
};

const INVALID_CREDENTIALS = "E-Mail-Adresse oder Passwort ist nicht korrekt.";

export async function login(rawInput: unknown, ctx: RequestContext): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? INVALID_CREDENTIALS);
  const { email, password } = parsed.data;

  if (ctx.ipHash) await enforceRateLimit(`login:ip:${ctx.ipHash}`, RATE_LIMITS.loginPerIp);
  await enforceRateLimit(`login:acct:${hashIdentifier("email", email)}`, RATE_LIMITS.loginPerAccount);

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status === "deleted" || !user.passwordHash) {
    await burnPasswordCheck(password);
    throw new AppError("unauthenticated", INVALID_CREDENTIALS);
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new AppError("unauthenticated", INVALID_CREDENTIALS);

  const updates: Partial<typeof users.$inferInsert> = { lastLoginAt: new Date() };
  if (needsRehash(user.passwordHash)) updates.passwordHash = await hashPassword(password);
  await db.update(users).set(updates).where(eq(users.id, user.id));

  const totpEnabled = user.totpEnabledAt !== null;
  const session = await createAuthSession(db, {
    userId: user.id,
    role: user.role,
    mfaVerified: false,
    userAgent: ctx.userAgent,
    ipHash: ctx.ipHash,
  });
  log.info("auth.login", { userId: user.id, role: user.role, mfaPending: totpEnabled });
  return { token: session.token, expiresAt: session.expiresAt, role: user.role, mfaPending: totpEnabled };
}

/** Atomarer Replay-Schutz: Ein TOTP-Zeitschritt kann nur einmal verwendet werden. */
async function claimTotpStep(executor: Executor, userId: string, step: number): Promise<boolean> {
  const result = await executor
    .update(users)
    .set({ totpLastUsedStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastUsedStep), lt(users.totpLastUsedStep, step))))
    .returning({ id: users.id });
  return result.length === 1;
}

export async function verifyLoginMfa(input: { sessionId: string; userId: string; code: string }, ctx: RequestContext) {
  await enforceRateLimit(`mfa:session:${input.sessionId}`, RATE_LIMITS.mfaPerSession);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user?.totpSecretEncrypted || !user.totpEnabledAt) {
    throw new AppError("invalid_state", "Für dieses Konto ist keine Zwei-Faktor-Authentifizierung eingerichtet.");
  }
  const step = verifyTotp(decryptField(user.totpSecretEncrypted), input.code, {
    lastUsedStep: user.totpLastUsedStep,
  });
  if (step === null || !(await claimTotpStep(db, user.id, step))) {
    throw new AppError("unauthenticated", "Der Code ist ungültig oder abgelaufen.");
  }
  await markSessionMfaVerified(input.sessionId);
  if (user.role === "admin") {
    await writeAuditLog(db, { actorUserId: user.id, action: "auth.admin_mfa_login", ipHash: ctx.ipHash });
  }
}

// ── E-Mail-Bestätigung ──────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<"verified" | "invalid"> {
  return getDb().transaction(async (tx) => {
    const consumed = await consumeToken(tx, token, "email_verification");
    if (!consumed) return "invalid";
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, consumed.userId), isNull(users.emailVerifiedAt)));
    return "verified";
  });
}

export async function resendVerificationEmail(userId: string) {
  await enforceRateLimit(`verify-resend:${userId}`, RATE_LIMITS.verificationResendPerUser);
  await getDb().transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.emailVerifiedAt || user.status === "deleted") return;
    const token = await issueToken(tx, user.id, "email_verification");
    await sendEmail({ to: user.email, ...emailTemplates.emailVerification(token) }, tx);
  });
}

// ── Passwort ────────────────────────────────────────────────────────────────

/** Liefert immer dieselbe Antwort – unabhängig davon, ob das Konto existiert. */
export async function requestPasswordReset(rawEmail: unknown, ctx: RequestContext) {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) throw validationError("Bitte gib eine gültige E-Mail-Adresse ein.");
  const email = parsed.data;
  if (ctx.ipHash) await enforceRateLimit(`reset:ip:${ctx.ipHash}`, RATE_LIMITS.passwordResetPerIp);
  const accountKey = `reset:acct:${hashIdentifier("email", email)}`;
  const accountLimit = await consumeRateLimit(accountKey, RATE_LIMITS.passwordResetPerAccount);
  if (!accountLimit.allowed) return; // identische Antwort, keine weitere E-Mail

  await getDb().transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.status === "deleted") return;
    const token = await issueToken(tx, user.id, "password_reset");
    await sendEmail({ to: user.email, ...emailTemplates.passwordReset(token) }, tx);
  });
}

export async function resetPassword(input: { token: string; password: string }) {
  const parsedPassword = passwordSchema.safeParse(input.password);
  if (!parsedPassword.success) throw validationError(parsedPassword.error.issues[0]?.message ?? "Ungültiges Passwort.");
  const passwordHash = await hashPassword(parsedPassword.data);
  await getDb().transaction(async (tx) => {
    const consumed = await consumeToken(tx, input.token, "password_reset");
    if (!consumed) throw new AppError("invalid_state", "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
    const [user] = await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, consumed.userId))
      .returning({ email: users.email, status: users.status });
    if (!user || user.status === "deleted") throw new AppError("invalid_state", "Das Konto ist nicht mehr aktiv.");
    await invalidateAllUserSessions(tx, consumed.userId);
    await sendEmail({ to: user.email, ...emailTemplates.passwordChanged() }, tx);
  });
}

export async function changePassword(input: {
  userId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}) {
  await enforceRateLimit(`sensitive:${input.userId}`, RATE_LIMITS.sensitiveActionPerUser);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("unauthenticated", "Das aktuelle Passwort ist nicht korrekt.");
  }
  const parsed = passwordSchema.safeParse(input.newPassword);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiges Passwort.");
  if (passwordContainsIdentity(parsed.data, [user.email, user.username])) {
    throw validationError("Das Passwort darf weder deinen Nutzernamen noch deine E-Mail-Adresse enthalten.");
  }
  const passwordHash = await hashPassword(parsed.data);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await invalidateAllUserSessions(tx, user.id, input.currentSessionId);
    await sendEmail({ to: user.email, ...emailTemplates.passwordChanged() }, tx);
  });
}

// ── Zwei-Faktor-Authentifizierung (TOTP) ────────────────────────────────────

export async function startTotpEnrollment(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("not_found", "Konto nicht gefunden.");
  if (user.totpEnabledAt) throw new AppError("invalid_state", "Die Zwei-Faktor-Authentifizierung ist bereits aktiv.");
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecretEncrypted: encryptField(secret), totpLastUsedStep: null })
    .where(and(eq(users.id, userId), isNull(users.totpEnabledAt)));
  return { secret, uri: buildOtpAuthUri(secret, user.email, brand.name) };
}

/** Liefert das ausstehende (noch nicht bestätigte) Geheimnis zur Anzeige. */
export async function getPendingTotpEnrollment(userId: string) {
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.totpSecretEncrypted || user.totpEnabledAt) return null;
  const secret = decryptField(user.totpSecretEncrypted);
  return { secret, uri: buildOtpAuthUri(secret, user.email, brand.name) };
}

export async function confirmTotpEnrollment(
  input: { userId: string; sessionId: string; code: string },
  ctx: RequestContext,
) {
  await enforceRateLimit(`mfa:session:${input.sessionId}`, RATE_LIMITS.mfaPerSession);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user?.totpSecretEncrypted || user.totpEnabledAt) {
    throw new AppError("invalid_state", "Bitte starte die Einrichtung erneut.");
  }
  const step = verifyTotp(decryptField(user.totpSecretEncrypted), input.code, { lastUsedStep: user.totpLastUsedStep });
  if (step === null) throw new AppError("unauthenticated", "Der Code ist ungültig. Prüfe die Uhrzeit deines Geräts.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabledAt: new Date(), totpLastUsedStep: step }).where(eq(users.id, user.id));
    if (user.role === "admin") {
      await writeAuditLog(tx, { actorUserId: user.id, action: "auth.mfa_enabled", targetType: "user", targetId: user.id, ipHash: ctx.ipHash });
    }
  });
  await markSessionMfaVerified(input.sessionId);
}

export async function disableTotp(input: { userId: string; password: string; code: string }) {
  await enforceRateLimit(`sensitive:${input.userId}`, RATE_LIMITS.sensitiveActionPerUser);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user?.totpEnabledAt || !user.totpSecretEncrypted) {
    throw new AppError("invalid_state", "Die Zwei-Faktor-Authentifizierung ist nicht aktiv.");
  }
  if (user.role === "admin") {
    throw new AppError("forbidden", "Für Administratoren ist die Zwei-Faktor-Authentifizierung verpflichtend.");
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError("unauthenticated", "Das Passwort ist nicht korrekt.");
  }
  const step = verifyTotp(decryptField(user.totpSecretEncrypted), input.code, { lastUsedStep: user.totpLastUsedStep });
  if (step === null) throw new AppError("unauthenticated", "Der Code ist ungültig.");
  await db
    .update(users)
    .set({ totpEnabledAt: null, totpSecretEncrypted: null, totpLastUsedStep: null })
    .where(eq(users.id, user.id));
}

// ── Konto ───────────────────────────────────────────────────────────────────

export async function getAccount(userId: string) {
  const [user] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabledAt: users.totpEnabledAt,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      isTestAccount: users.isTestAccount,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

export async function updateUsername(userId: string, rawUsername: unknown) {
  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Ungültiger Nutzername.");
  try {
    await getDb().update(users).set({ username: parsed.data }).where(eq(users.id, userId));
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw validationError("Dieser Nutzername ist bereits vergeben.");
    throw error;
  }
}

/**
 * Kontolöschung: personenbezogene Daten werden entfernt bzw. anonymisiert.
 * Buchungsdaten bleiben (pseudonymisiert) erhalten, da Aufbewahrungspflichten
 * bestehen können – rechtlich zu prüfen (siehe docs/LEGAL-OPEN-QUESTIONS-AT.md).
 */
export async function deleteAccount(input: { userId: string; password: string; confirmation: string }) {
  if (input.confirmation.trim().toUpperCase() !== "LÖSCHEN") {
    throw validationError("Bitte gib zur Bestätigung LÖSCHEN ein.");
  }
  await enforceRateLimit(`sensitive:${input.userId}`, RATE_LIMITS.sensitiveActionPerUser);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || user.status === "deleted") throw new AppError("not_found", "Konto nicht gefunden.");
  if (user.role === "admin") throw new AppError("forbidden", "Admin-Konten werden über den Betrieb deaktiviert.");
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError("unauthenticated", "Das Passwort ist nicht korrekt.");
  }
  const anonymousId = user.id.replace(/-/g, "").slice(0, 12);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        email: `deleted+${user.id}@deleted.invalid`,
        username: `geloescht_${anonymousId}`,
        passwordHash: null,
        totpSecretEncrypted: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
        status: "deleted",
        deletedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await tx
      .update(creatorProfiles)
      .set({
        displayName: "Gelöschtes Profil",
        tagline: "",
        bio: "",
        contactRules: "",
        tags: [],
        languages: [],
        availability: "offline",
        reviewStatus: "suspended",
        avatarMediaId: null,
        allowSearchIndexing: false,
      })
      .where(eq(creatorProfiles.userId, user.id));
    await invalidateAllUserSessions(tx, user.id);
    await tx.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userId, user.id), isNull(authTokens.usedAt)));
  });
  log.info("account.deleted", { userId: user.id });
}
