"use client";

import { useState } from "react";
import { updatePricingAction } from "@/actions/studio";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input } from "@/components/ui/form";

/**
 * Preisformular mit Live-Vorschau des Anteils. Die Vorschau ist nur eine
 * Anzeige – verbindlich rechnet ausschließlich der Server.
 */
export function PricingForm({
  initialPrice,
  enabled,
  min,
  max,
  platformBps,
}: {
  initialPrice: number;
  enabled: boolean;
  min: number;
  max: number;
  platformBps: number;
}) {
  const [price, setPrice] = useState(initialPrice);
  const valid = Number.isInteger(price) && price >= min && price <= max;
  const creatorShare = valid ? Math.floor((price * (10_000 - platformBps)) / 10_000) : 0;
  return (
    <ActionForm action={updatePricingAction} submitLabel="Preis speichern">
      <Field id="coinsPerMinute" label="Preis für private Chats (Münzen pro Minute)" hint={`Erlaubt: ${min}–${max} Münzen pro Minute.`}>
        <Input
          id="coinsPerMinute"
          name="coinsPerMinute"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          required
          value={Number.isNaN(price) ? "" : price}
          onChange={(event) => setPrice(event.target.valueAsNumber)}
          className="max-w-48"
          aria-invalid={!valid}
        />
      </Field>
      <div className="rounded-xl bg-brand-25 p-4 text-sm text-ink-700 ring-1 ring-line ring-inset" aria-live="polite">
        {valid ? (
          <>
            Vorschau je Minute: <strong>{creatorShare}</strong> Münzen für dich, <strong>{price - creatorShare}</strong> Plattformprovision.
            <span className="block text-xs text-ink-500">Nur Anzeige – verbindlich berechnet der Server bei jeder Minute.</span>
          </>
        ) : (
          <>Bitte gib eine ganze Zahl zwischen {min} und {max} ein.</>
        )}
      </div>
      <Checkbox id="enabled" name="enabled" defaultChecked={enabled}>
        Private Chats anbieten
      </Checkbox>
    </ActionForm>
  );
}
