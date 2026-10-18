"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { Dialog } from "./dialog";
import { FormMessage, Textarea, Field } from "./form";
import { SubmitButton } from "./submit-button";
import { useToast } from "./toast";
import type { ButtonVariant } from "./button";

/**
 * Bestätigungsdialog für folgenreiche Aktionen. Optional mit Pflicht-Begründung
 * (z. B. Admin-Entscheidungen, die im Audit-Protokoll landen).
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  hiddenFields = {},
  reasonLabel,
  reasonRequired,
  variant = "primary",
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerIcon,
  children,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields?: Record<string, string>;
  reasonLabel?: string;
  reasonRequired?: boolean;
  variant?: ButtonVariant;
  triggerVariant?: ButtonVariant;
  triggerSize?: "sm" | "md" | "lg";
  triggerIcon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Dialog trigger={trigger} title={title} description={description} triggerVariant={triggerVariant} triggerSize={triggerSize} triggerIcon={triggerIcon}>
      {(close) => (
        <ConfirmForm
          action={action}
          hiddenFields={hiddenFields}
          reasonLabel={reasonLabel}
          reasonRequired={reasonRequired}
          confirmLabel={confirmLabel}
          variant={variant}
          onDone={close}
        >
          {children}
        </ConfirmForm>
      )}
    </Dialog>
  );
}

function ConfirmForm({
  action,
  hiddenFields,
  reasonLabel,
  reasonRequired,
  confirmLabel,
  variant,
  onDone,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmLabel: string;
  variant: ButtonVariant;
  onDone: () => void;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" });
  const toast = useToast();
  useEffect(() => {
    if (state.status === "success") {
      toast.show({ tone: "success", message: state.message ?? "Gespeichert." });
      onDone();
    }
  }, [state, toast, onDone]);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {reasonLabel ? (
        <Field id="confirm-reason" label={reasonLabel} hint={reasonRequired ? "Pflichtfeld – wird im Audit-Protokoll gespeichert." : undefined}>
          <Textarea id="confirm-reason" name="reason" rows={3} required={reasonRequired} minLength={reasonRequired ? 10 : undefined} />
        </Field>
      ) : null}
      <FormMessage state={state.status === "error" ? state : null} />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className="h-11 rounded-lg px-4 text-sm font-medium text-ink-700 hover:bg-ink-100">
          Abbrechen
        </button>
        <SubmitButton variant={variant}>{confirmLabel}</SubmitButton>
      </div>
    </form>
  );
}
