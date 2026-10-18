@AGENTS.md

# Project Aurora – Arbeitsregeln

- Sprache der UI und Doku: Deutsch (de-AT). Zeitzone für Anzeige: Europe/Vienna, Speicherung UTC.
- Ehrlichkeit: Nichts als „verifiziert“, „echt“, „bezahlt“ oder „versendet“ darstellen, was nur simuliert ist.
  Testmünzen immer als Testguthaben kennzeichnen. Keine erfundenen Creator, Bewertungen oder Freigaben.
- Keine Anbieter-Integration ohne geprüfte Nutzungsbedingungen und schriftliche Freigabe (docs/PROVIDER-INTEGRATION.md).
- Geschäftslogik nur in `src/server/*`; Server Actions in `src/actions/*` prüfen Berechtigungen (`assertPermission`).
- Geldbeträge nur als Ganzzahlen (Münzen bzw. Cent). Buchungen nur über `postTransaction` mit Idempotenzschlüssel.
- Farben/Schatten/Animationen nur über Tokens aus `src/app/globals.css`.
- Vor jedem Commit: `pnpm typecheck && pnpm lint && pnpm test`; bei UI-/Flow-Änderungen zusätzlich
  `pnpm build && pnpm test:e2e`.
- Next.js 16: vor neuen APIs die Doku in `node_modules/next/dist/docs/` lesen (siehe AGENTS.md).
