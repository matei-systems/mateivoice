/**
 * Fachliche Fehler mit einer für Nutzer verständlichen (deutschen) Meldung.
 * Technische Details bleiben im Server-Log und gelangen nicht in die UI.
 */
export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "insufficient_funds"
  | "feature_unavailable"
  | "invalid_state";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly userMessage: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(userMessage, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.details = options?.details;
  }
  readonly details?: Record<string, unknown>;
}

export const forbidden = (message = "Für diese Aktion fehlt die Berechtigung.") =>
  new AppError("forbidden", message);
export const notFound = (message = "Der Eintrag wurde nicht gefunden.") =>
  new AppError("not_found", message);
export const invalidState = (message: string) => new AppError("invalid_state", message);
export const validationError = (message: string) => new AppError("validation", message);
export const featureUnavailable = (message: string) => new AppError("feature_unavailable", message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Erkennt PostgreSQL-Fehler über den SQLSTATE-Code (auch in Drizzle-Wrappern). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === "string") return constraint;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
