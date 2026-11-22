import { Wrench } from "lucide-react";

/** Hinweis im Wartungsmodus (nur Mitarbeiter können die Plattform nutzen). */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 py-16 text-center">
      <div className="space-y-4">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
          <Wrench className="size-7" aria-hidden="true" />
        </span>
        <h1 className="font-display text-3xl font-semibold">Wartungsarbeiten</h1>
        <p className="text-ink-600">{message || "Wir arbeiten gerade an der Plattform. Bitte versuche es in Kürze erneut."}</p>
        <p className="text-sm text-ink-500">Laufende Sitzungen werden nicht berechnet, solange keine Verbindung besteht.</p>
      </div>
    </div>
  );
}
