import type { Instrumentation } from "next";

/**
 * Zentrale Erfassung unerwarteter Serverfehler. Es werden bewusst KEINE
 * Header, Cookies, Query-Parameter oder Formularinhalte protokolliert.
 * Ein externer Error-Tracking-Dienst kann hier nach Datenschutzprüfung
 * angebunden werden.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "request.unhandled_error",
      digest,
      name: error instanceof Error ? error.name : "UnknownError",
      method: request.method,
      // Nur der Pfad ohne Query-String (kann Token enthalten, z. B. Passwort-Reset).
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
