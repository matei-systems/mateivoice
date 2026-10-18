import { z } from "zod";

/**
 * Serverseitige Umgebungsvariablen. Werden beim ersten Zugriff validiert.
 *
 * Sicherheitsregeln:
 *  - Werte werden niemals geloggt (auch nicht bei Validierungsfehlern).
 *  - In APP_ENV=production sind Testmodus, Mock-Anbieter und die
 *    Entwicklungs-Mailbox verboten. Die Anwendung startet dann nicht.
 */

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const base64Key32 = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "muss ein Base64-kodierter 32-Byte-Schlüssel sein" },
);

const envSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "fehlt"),
    AUTH_SECRET: z.string().min(32, "muss mindestens 32 Zeichen lang sein"),
    DATA_ENCRYPTION_KEY: base64Key32,
    TEST_MODE: booleanString.default(true),
    EMAIL_PROVIDER: z.enum(["dev-outbox", "disabled"]).default("dev-outbox"),
    PAYMENT_PROVIDER: z.enum(["simulated", "none"]).default("simulated"),
    PAYOUT_PROVIDER: z.enum(["none"]).default("none"),
    VIDEO_PROVIDER: z.enum(["mock", "none"]).default("mock"),
    IDENTITY_PROVIDER: z.enum(["mock", "none"]).default("mock"),
    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./storage"),
    PLATFORM_COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "production") return;
    const forbid = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (env.TEST_MODE) forbid("TEST_MODE", "darf in Produktion nicht aktiv sein");
    if (env.EMAIL_PROVIDER === "dev-outbox")
      forbid("EMAIL_PROVIDER", "dev-outbox ist in Produktion nicht erlaubt");
    if (env.PAYMENT_PROVIDER === "simulated")
      forbid("PAYMENT_PROVIDER", "simulierte Zahlungen sind in Produktion nicht erlaubt");
    if (env.VIDEO_PROVIDER === "mock")
      forbid("VIDEO_PROVIDER", "Mock-Video ist in Produktion nicht erlaubt");
    if (env.IDENTITY_PROVIDER === "mock")
      forbid("IDENTITY_PROVIDER", "Mock-Verifizierung ist in Produktion nicht erlaubt");
    if (!env.APP_URL.startsWith("https://")) forbid("APP_URL", "muss in Produktion https verwenden");
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Ungültige Umgebungskonfiguration:\n - ${issues.join("\n - ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Nur Variablennamen und Regel, niemals Werte ausgeben.
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return result.data;
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Nur für Tests: zwischengespeicherte Konfiguration verwerfen. */
export function resetEnvCacheForTests() {
  cached = undefined;
}

export function isProduction() {
  return getEnv().APP_ENV === "production";
}

/** Testmodus: simulierte Münzen, Mock-Anbieter, Entwicklungs-Mailbox. */
export function isTestMode() {
  return getEnv().TEST_MODE;
}
