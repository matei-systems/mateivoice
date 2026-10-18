"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { reportAction } from "@/actions/reports";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/action-state";

const CATEGORIES = [
  { value: "minor_suspected", label: "Verdacht auf minderjährige Person" },
  { value: "non_consensual", label: "Nicht einvernehmliche Inhalte" },
  { value: "illegal_content", label: "Sonstige rechtswidrige Inhalte" },
  { value: "violence_or_threat", label: "Gewalt oder Drohung" },
  { value: "harassment", label: "Belästigung" },
  { value: "fraud_or_scam", label: "Betrug oder Täuschung" },
  { value: "impersonation", label: "Identitätsmissbrauch" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Sonstiges" },
];

export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  signedIn,
  triggerLabel = "Melden",
}: {
  targetType: "creator_profile" | "user" | "video_session" | "media";
  targetId: string;
  targetLabel: string;
  signedIn: boolean;
  triggerLabel?: string;
}) {
  return (
    <Dialog
      trigger={triggerLabel}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerIcon={<Flag className="size-4" aria-hidden="true" />}
      title={`${targetLabel} melden`}
      description="Meldungen werden vertraulich behandelt. Hinweise auf Minderjährige oder nicht einvernehmliche Inhalte haben höchste Priorität."
    >
      {signedIn ? (
        <ReportForm targetType={targetType} targetId={targetId} />
      ) : (
        <div className="space-y-4 text-sm text-ink-700">
          <p>Zum Melden ist eine Anmeldung erforderlich, damit wir Missbrauch der Meldefunktion verhindern können.</p>
          <p>
            Ohne Konto kannst du uns über das{" "}
            <Link href="/support?category=safety" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Kontaktformular (Kategorie „Sicherheit“)
            </Link>{" "}
            informieren. In akuten Notfällen wende dich bitte direkt an die Polizei (Notruf 133).
          </p>
          <Link href="/login" className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 font-medium text-white">
            Anmelden
          </Link>
        </div>
      )}
    </Dialog>
  );
}

function ReportForm({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [state, action] = useActionState(reportAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <Field id="report-category" label="Grund">
        <Select id="report-category" name="category" required defaultValue="">
          <option value="" disabled>
            Bitte wählen …
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="report-description" label="Beschreibung" hint="Was ist passiert? Bitte keine sensiblen Daten Dritter angeben.">
        <Textarea id="report-description" name="description" required minLength={10} maxLength={4000} rows={4} />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton variant="danger">Meldung senden</SubmitButton>
      </div>
    </form>
  );
}
