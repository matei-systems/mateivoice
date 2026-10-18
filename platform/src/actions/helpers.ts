import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { randomToken } from "@/server/crypto";
import { isAppError } from "@/server/errors";
import { log } from "@/server/log";

/**
 * Führt eine Server Action aus und übersetzt Fehler in ehrliche, verständliche
 * Meldungen. Unerwartete Fehler werden mit Referenz-ID protokolliert, ohne
 * technische Details an den Browser zu geben.
 */
export async function runAction(
  fn: () => Promise<ActionState | void>,
  successMessage = "Gespeichert.",
): Promise<ActionState> {
  try {
    const result = await fn();
    return result ?? { status: "success", message: successMessage };
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error)) return { status: "error", message: error.userMessage };
    const reference = randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
    log.error("action.unexpected_error", { reference, error });
    return {
      status: "error",
      message: `Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut. (Referenz: ${reference})`,
    };
  }
}

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function formBool(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

/** Honeypot ausgefüllt → sehr wahrscheinlich ein Bot. */
export function isBotSubmission(formData: FormData): boolean {
  return formString(formData, "website").trim().length > 0;
}
