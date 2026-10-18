/**
 * Darstellungs- und Freischaltlogik für den Verifizierungsstatus (reine Funktionen).
 *
 * Grundsatz: Die Plattform täuscht NIEMALS eine Verifizierung vor. Als
 * „verifiziert“ gilt ausschließlich der Status "verified" eines echten Anbieters.
 */

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "test_passed"
  | "verified"
  | "rejected"
  | "expired";

export type VerificationDisplay = {
  label: string;
  description: string;
  tone: "success" | "warning" | "neutral" | "danger" | "test";
  isVerified: boolean;
};

export function verificationDisplay(
  status: VerificationStatus | null | undefined,
  provider: string | null | undefined,
): VerificationDisplay {
  if (status === "verified" && provider && provider !== "mock") {
    return {
      label: "Verifiziert",
      description: "Alter und Identität wurden von einem spezialisierten Anbieter geprüft.",
      tone: "success",
      isVerified: true,
    };
  }
  switch (status) {
    case "test_passed":
      return {
        label: "Nicht verifiziert (Testmodus)",
        description: "Simulierte Prüfung im Entwicklungsmodus. Es hat KEINE echte Alters- oder Identitätsprüfung stattgefunden.",
        tone: "test",
        isVerified: false,
      };
    case "pending":
      return {
        label: "Prüfung ausstehend",
        description: "Die Alters- und Identitätsprüfung wurde gestartet, ist aber noch nicht abgeschlossen.",
        tone: "warning",
        isVerified: false,
      };
    case "rejected":
      return {
        label: "Prüfung abgelehnt",
        description: "Die Prüfung war nicht erfolgreich. Bitte wende dich an den Support.",
        tone: "danger",
        isVerified: false,
      };
    case "expired":
      return {
        label: "Prüfung abgelaufen",
        description: "Die Prüfung muss erneuert werden.",
        tone: "warning",
        isVerified: false,
      };
    default:
      return {
        label: "Nicht verifiziert",
        description: "Es wurde noch keine Alters- und Identitätsprüfung durchgeführt.",
        tone: "neutral",
        isVerified: false,
      };
  }
}

/**
 * Darf ein Creator Live-Funktionen nutzen?
 *  - Echtbetrieb: nur mit echter Verifizierung ("verified").
 *  - Testmodus: zusätzlich mit simulierter Prüfung ("test_passed"), damit die
 *    Abläufe entwickelt werden können. Im Testmodus gibt es keine echten
 *    Streams, Zahlungen oder Auszahlungen.
 */
export function creatorCanOperate(
  status: VerificationStatus | null | undefined,
  provider: string | null | undefined,
  testMode: boolean,
): boolean {
  if (status === "verified" && provider !== "mock") return true;
  return testMode && status === "test_passed" && provider === "mock";
}
