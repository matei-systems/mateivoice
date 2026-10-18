import { FlaskConical } from "lucide-react";

/** Dauerhafter Hinweis auf den Testmodus – nichts auf der Plattform ist „echt“. */
export function TestModeBanner() {
  return (
    <div className="relative z-50 border-b border-test-200 bg-test-50 text-test-700">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium sm:text-[0.8rem]">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sm:hidden">Testmodus · alles simuliert, Profile fiktiv</span>
        <span className="hidden sm:inline">
          Testmodus: keine echten Zahlungen, Streams oder Verifizierungen · alle Profile sind fiktiv · Münzen sind
          Testguthaben ohne Geldwert
        </span>
      </p>
    </div>
  );
}
