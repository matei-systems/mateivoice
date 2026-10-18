"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import type { ButtonSize, ButtonVariant } from "./button";
import { FormMessage } from "./form";
import { SubmitButton } from "./submit-button";
import { useToast } from "./toast";

/**
 * Formular für Server Actions mit Lade-, Fehler- und Erfolgszustand.
 * Erfolg erscheint als Toast (oder inline), Fehler immer inline.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = "primary",
  submitSize = "md",
  submitIcon,
  className,
  resetOnSuccess,
  inlineSuccess,
  fullWidthSubmit,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel?: ReactNode;
  submitVariant?: ButtonVariant;
  submitSize?: ButtonSize;
  submitIcon?: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  inlineSuccess?: boolean;
  fullWidthSubmit?: boolean;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (state.status !== "success") return;
    if (!inlineSuccess && state.message) toast.show({ tone: "success", message: state.message });
    if (resetOnSuccess) formRef.current?.reset();
  }, [state, inlineSuccess, resetOnSuccess, toast]);

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)}>
      {children}
      <FormMessage state={state.status === "error" || inlineSuccess ? state : null} />
      {submitLabel ? (
        <SubmitButton variant={submitVariant} size={submitSize} icon={submitIcon} className={fullWidthSubmit ? "w-full" : undefined}>
          {submitLabel}
        </SubmitButton>
      ) : null}
    </form>
  );
}
