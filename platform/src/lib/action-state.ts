/** Einheitliches Ergebnis von Server Actions für Formulare (useActionState). */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Optionale, nicht sensible Rückgabedaten für die UI. */
  data?: Record<string, string | number | boolean | null>;
};

export const idleState: ActionState = { status: "idle" };
