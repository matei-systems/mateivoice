# Teststrategie & Ergebnisse

## Ebenen

| Ebene | Werkzeug | Umfang | Datenbank |
|---|---|---|---|
| Unit | Vitest | Berechtigungsmatrix & IDOR-Richtlinien, Passwort-Hashing/-Richtlinie, TOTP (RFC-6238-Testvektoren), Provision & Rundung, Formatierung/Zeitzone, Open-Redirect-Schutz, Umgebungsvalidierung (Produktionssperre), Verifizierungsanzeige, Zustandsautomat, Upload-Typprüfung, Log-Schwärzung, E-Mail-Maskierung | keine |
| Integration | Vitest + PostgreSQL | Registrierung/Login/2FA/Reset/Löschung, Buchungsjournal inkl. **paralleler Doppelanfragen und Überziehungsversuche**, DB-Trigger (ausgeglichen, unveränderlich), Testmünzen nicht auszahlbar, private Sitzungen (Abrechnung, Guthabenende, Verbindungsverlust, Zugriffsschutz, Token-Fälschung), Streams, simulierte Zahlungs-Webhooks (Signatur, Idempotenz, Parallelität, Rückbuchung), Moderation, Support-IDOR, Creator-Suche/Sichtbarkeit, Uploads (Metadaten entfernt, falsche Typen) | `aurora_test` (wird vor jedem Test geleert; Name muss auf `_test` enden) |
| End-to-End | Playwright (Chromium, Desktop + Pixel 7) | Altershinweis, Startseite, Suche/Filter/leerer Zustand, Profil, 404 für nicht freigegebene Profile, Rechtstext-Entwürfe, Sicherheitsheader, geschützte Bereiche, Support, Registrierung → E-Mail-Bestätigung → Login → Testguthaben, Rollen-Zugriffsschutz, Datenexport, kompletter privater Chat zwischen zwei Browsern, Admin-Login mit 2FA + protokollierte Profilprüfung, mobile Darstellung ohne horizontales Scrollen | `aurora_e2e` (wird vor jedem Lauf neu aufgesetzt und geseedet), Produktions-Build |

## Ausführen

```bash
pnpm typecheck
pnpm lint
pnpm test                    # Unit + Integration
pnpm build && pnpm test:e2e  # End-to-End gegen Produktions-Build
pnpm audit:deps
```

## Letzter dokumentierter Lauf (lokal, 18.10.2026)

| Prüfung | Ergebnis |
|---|---|
| `pnpm typecheck` (TypeScript strict, `noUncheckedIndexedAccess`) | ✅ 0 Fehler |
| `pnpm lint` (ESLint, Next.js Core Web Vitals + TypeScript) | ✅ 0 Fehler, 0 Warnungen |
| Vitest Unit + Integration | ✅ 126 / 126 Tests bestanden (10 Dateien) |
| `pnpm build` | ✅ erfolgreich |
| Playwright E2E | ✅ 24 / 24 Tests bestanden |
| `pnpm audit --prod` | ✅ keine bekannten Schwachstellen; 2 Befunde nur in Dev-Werkzeugen (siehe SECURITY.md) |

## Abdeckung der Pflicht-Testfälle aus der Anforderung

| # | Anforderung | Nachweis |
|---|---|---|
| 1 | Kunden können keine Admin-Funktionen ausführen | `permissions.test.ts`, E2E „Kunden haben keinen Zugriff …“, `assertPermission` in allen Admin-Actions |
| 2 | Creator können keine fremden Profile/Einnahmen ändern | `permissions.test.ts` (canEditCreatorProfile, canViewCreatorEarnings), `creators-media.test.ts`, `video-sessions.test.ts` (fremde Anfrage) |
| 3 | Unverifizierte Creator erscheinen nicht als verifiziert | `domain-rules.test.ts`, DB-Constraint-Test in `creators-media.test.ts`, E2E „nichts erscheint fälschlich als Verifiziert“ |
| 4 | Testmünzen nicht als echtes Geld ausgebbar | `ledger.test.ts` (COIN gesperrt, Payout-Constraint), `payments-moderation.test.ts` (Auszahlung nicht verfügbar) |
| 5 | Doppelte Anfragen erzeugen keine Doppelbuchungen | `ledger.test.ts` (sequenziell + 8 parallele), `payments-moderation.test.ts` (6 parallele Webhooks), Minuten-Idempotenz in `video-sessions.test.ts` |
| 6 | Private Sitzungen nicht öffentlich zugänglich | `video-sessions.test.ts` (Zugriffskontrolle), E2E „fremde Sitzungen sind nicht einsehbar“ (404) |
| 7 | Fehlerzustände werden ehrlich angezeigt | E2E (falsches Passwort, Testguthaben-Limit, Support-Hinweis „E-Mail nicht aktiv“), Fehlerseiten mit Referenz-ID |

## Nicht automatisiert getestet

- Visuelle Regressionen (nur manuelle Screenshot-Prüfung Desktop/Mobil)
- Barrierefreiheit über Linting (jsx-a11y) und semantische Rollen hinaus (kein Screenreader-Test)
- Lasttests, Sicherheits-Penetrationstest
- Safari/WebKit und Firefox (E2E nur Chromium)
