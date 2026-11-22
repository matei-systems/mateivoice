# Teststrategie & Ergebnisse

## Ebenen

| Ebene | Werkzeug | Umfang | Datenbank |
|---|---|---|---|
| Unit | Vitest | Rollenmatrix (6 Rollen) & IDOR-Richtlinien, Passwort, TOTP (RFC-Vektoren), Provision 25/75 & Rundung, Umgebungsvalidierung (Produktionssperren, Anbieter-Pflichtfelder), Verotel-Signatur (**offizielles Beispiel**), Sandbox-Signaturen, IBAN (Mod 97), E-Mail-Vorlagen (alle, HTML-Maskierung, Abmeldelinks), Einstellungsformular, Chat-Filter, CSV-Injektion, Altersprüfungslogik, LiveKit-Token-Rechte und Webhook-Signaturen | keine |
| Integration | Vitest + PostgreSQL | Auth, Ledger (Parallelität, Trigger), Sitzungen, Zahlungen über die **echte Webhook-Route**, Erstattung/Chargeback, Kauflimits, Auszahlungen (Vier-Augen, Haltefrist, **parallele Anträge**), Trinkgelder, Chat (Zugriff, Filter, Blockieren, Moderation), Veröffentlichungsregeln, Altersprüfung, Beweissicherung, Löschung, Aufbewahrung, Einstellungen, Mitarbeiter, **SMTP-Versand gegen lokalen Testempfänger**, Verotel-Postbacks, LISTEN/NOTIFY | `aurora_test` (Name muss auf `_test` enden) |
| End-to-End | Playwright (Chromium; Desktop + Pixel 7) gegen Produktions-Build | 37 Szenarien, siehe Journey-Tabelle | `aurora_e2e` (vor jedem Lauf neu aufgesetzt) |

## Ausführen

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm test:e2e -- --trace off
pnpm audit:deps
```
Playwright nutzt automatisch ein vorinstalliertes Chromium unter `/opt/pw-browsers/chromium`, falls vorhanden
(oder `PLAYWRIGHT_CHROMIUM_PATH`).

## Letzter dokumentierter Lauf (lokal, 22.11.2026)

| Prüfung | Ergebnis |
|---|---|
| `pnpm typecheck` | ✅ 0 Fehler |
| `pnpm lint` | ✅ 0 Fehler, 0 Warnungen |
| Vitest Unit + Integration | ✅ alle bestanden (Anzahl siehe Abschlussbericht) |
| `pnpm build` | ✅ erfolgreich (Next.js 16.4.5) |
| Playwright E2E | ✅ 37 / 37 |
| `pnpm audit --prod` | ✅ keine bekannten Schwachstellen |

## Die 22 geforderten Journeys

| # | Journey | Status | Nachweis |
|---|---|---|---|
| 1 | Zuschauer-Registrierung | ✅ | E2E `customer.spec` (inkl. Land), Integration `auth.test` |
| 2 | Login | ✅ | E2E alle Specs; 2FA für Mitarbeiter (`staff.spec`, `admin.spec`) |
| 3 | Model-Registrierung | ✅ | Integration `auth.test` (Creator-Konto + Profil); E2E Registrierungsformular |
| 4 | Verifizierungs-Workflow | 🧪 | Mock-Anbieter (Integration, Studio-Seite); **echter Anbieter BLOCKIERT** (nicht ausgewählt) |
| 5 | Profilerstellung | ✅ | Integration `creators-media.test`, Kategorien aus DB |
| 6 | Freigabe (Approval) | ✅ | Integration `chat-compliance.test` (Checkliste), E2E `admin.spec` (Änderungen anfordern, Audit) |
| 7 | Online gehen | ✅ | Integration (`setAvailability`, Erklärungen-Pflicht), E2E (Live-Streams im Seed) |
| 8 | Stream beitreten | 🧪 | E2E `marketplace.spec` (Live-Seite, Beitritt simuliert); **echtes Video BLOCKIERT** (kein LiveKit-Server) |
| 9 | Chat | ✅ | E2E `marketplace.spec` (Senden + Empfang per SSE), Integration `chat-compliance.test` |
| 10 | Token-Guthaben | ✅ | E2E Testguthaben/Kontoauszug, Integration `ledger.test` |
| 11 | Sandbox-Kauf | ✅ | E2E `marketplace.spec` (Kasse → HTTP-Webhook → Gutschrift → Kaufhistorie) |
| 12 | Webhook-Verarbeitung | ✅ | Integration `payments.test` (Signatur, Idempotenz, Parallelität, Betrag), E2E (400/404) |
| 13 | Provisionsberechnung | ✅ | Unit, Integration (Sitzung 30/40, Trinkgeld 30/41), E2E (18/7 von 25) |
| 14 | Model-Einnahmen | ✅ | E2E `session-flow.spec` (Einnahmen mit 25 %), Integration |
| 15 | Auszahlungs-Workflow | 🧪 | E2E `payouts.spec` (Regeln → Antrag → Freigabe → Vier-Augen-Ausführung, Sandbox); echte Überweisung BLOCKIERT (kein Anbieter) |
| 16 | Erstattungs-Workflow | 🧪 | Integration (Erstattung über Anbieter-Ereignis, Teilverbrauch, Kulanz); echte Erstattung BLOCKIERT |
| 17 | Admin-Aktionen | ✅ | E2E `admin.spec`, `staff.spec` (Einstellungen, Einladung, Wartungsmodus), Integration |
| 18 | Meldungen | ✅ | Integration (Prioritäten, Chatnachrichten, automatische Beweissicherung) |
| 19 | Sperrung | ✅ | Integration (Sperre beendet Sitzungen, Begründung, E-Mail, Einspruch) |
| 20 | Mobile Nutzung | ✅ | E2E `mobile.spec` (14 Seiten ohne horizontales Scrollen, Navigation) |
| 21 | Kontolöschung | ✅ | Integration (Hinderungsgründe, Pseudonymisierung, Protokoll) |
| 22 | Sicherheitsberechtigungen | ✅ | Unit (Rollenmatrix), Integration (IDOR), E2E (Kunde/Creator/Moderation/Support-Grenzen) |

Legende: ✅ automatisiert getestet · 🧪 im Sandbox-/Mock-Modus getestet, echter Anbieter blockiert.

## Nicht automatisiert getestet
- Echte Anbieter (Zahlung, Auszahlung, Video, Altersprüfung, produktiver Mailversand) – mangels Verträgen/Zugängen
- Visuelle Regressionen (manuelle Screenshot-Prüfung Desktop/Mobil im dunklen Design)
- Barrierefreiheit über Linting/semantische Rollen hinaus, Lasttests, Penetrationstest, Safari/Firefox
