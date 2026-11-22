# Project Aurora – Premium-Live-Webcam-Marktplatz für Erwachsene (DACH, 18+)

> **Arbeitsname.** „Project Aurora“ ist zentral über `NEXT_PUBLIC_PLATFORM_NAME` bzw. `src/config/platform.ts` austauschbar.
>
> **Status: funktionsfähig im Testbetrieb, nicht startbereit für Echtgeld.** Käufe laufen über eine Sandbox
> (signierte Webhooks, nur Testmünzen ohne Geldwert), Auszahlungen über einen Sandbox-Anbieter, Video ist ohne
> angebundenen LiveKit-Server simuliert, Altersprüfungen sind simuliert und als solche gekennzeichnet, E-Mails
> landen in der Entwicklungs-Mailbox (SMTP-Adapter vorhanden). Alle Profile sind fiktive Testdaten. Rechtstexte
> sind Entwürfe. Echtzahlungen sind im Code gesperrt, bis Anbieterfreigabe und rechtliche Prüfung vorliegen.

Marktplatz für öffentliche Live-Streams und private 1:1-Videochats zwischen geprüft volljährigen Kundinnen/Kunden
und erwachsenen Creatorn in **Österreich, Deutschland und der Schweiz**. Provision (Standard **75 % Model / 25 %
Plattform**) und alle Geschäftsregeln sind im Mitarbeiterbereich konfigurierbar.

## Inhalt
- [Statusübersicht](#statusübersicht) · [Schnellstart](#schnellstart) · [Befehle](#befehle) · [Testkonten](#testkonten) · [Struktur](#projektstruktur)
- Weiterführend: [Architektur & ADRs](docs/ARCHITECTURE.md) · [Sicherheit](docs/SECURITY.md) · [Tests & 22 Journeys](docs/TESTING.md) ·
  [Recht DACH](docs/LEGAL-DACH.md) · [Zahlungsanbieter](docs/PAYMENT-PROVIDERS.md) · [Streaming](docs/STREAMING.md) ·
  [Deployment & Umgebungsvariablen](docs/DEPLOYMENT.md) · [Kosten](docs/COSTS.md) · [SEO & Marketing](docs/MARKETING.md) ·
  [Audit](docs/AUDIT.md)

## Statusübersicht

Legende: ✅ implementiert & automatisiert getestet · 🧪 im Sandbox-/Mock-Modus · 🔌 externer Anbieter nötig · ⚖️ rechtlich zu prüfen

| Bereich | Status | Anmerkung |
|---|---|---|
| Premium-Dark-Design (Tokens, Komponenten, mobil) | ✅ | `src/app/globals.css`; E2E ohne horizontales Scrollen |
| Öffentliche Seiten: Start, Entdecken/Suche/Filter/Kategorien, Profile, Preise, Hilfe-Center, Kontakt, Sicherheit, Recht | ✅ ⚖️ | Rechtstexte Entwürfe |
| Registrierung (DACH-Länderauswahl), Login, 2FA, Reset, E-Mail-Bestätigung | ✅ | |
| Zuschauer-Konto: Guthaben, Käufe, Kaufhistorie, Favoriten, Altersprüfung, Sitzungen, Privatsphäre (Blockierliste, Export, Löschung) | ✅ 🧪 | Altersprüfung: Mock (🔌 Anbieter offen) |
| Creator-Studio: Profil, Bilder, Preise, Live, Anfragen, Einnahmen, Auszahlungen, Verifizierung, Pflichterklärungen, Checkliste | ✅ 🧪 | Verifizierung: Mock (🔌) |
| Veröffentlichungsregeln (Prüfung + Erklärungen + Freigabe in allen Modi) | ✅ | |
| Streaming | 🧪 🔌 | LiveKit-Adapter (Token, Webhooks, keine Aufzeichnung) implementiert; ohne Server simuliert; E2E mit echtem Server **blockiert** |
| Echtzeit-Chat (SSE + LISTEN/NOTIFY), Trinkgeld, Melden, Blockieren, Stummschalten, Moderation | ✅ | |
| Münzsystem: Ledger, Sandbox-Kauf, Webhooks, Erstattung, Chargeback, Kauflimits, Risikosignale, Finanzbericht/CSV | ✅ 🧪 | Echtzahlung gesperrt; Verotel-Adapter vorhanden (🔌 ⚖️) |
| Auszahlungen: SEPA-Profil, Haltefrist, Reservierung, Vier-Augen-Freigabe | ✅ 🧪 | Sandbox-Anbieter; echter Anbieter 🔌 |
| Compliance: Beweissicherung, Begründungen (DSA Art. 17), Einsprüche, Datenschutzanfragen, Aufbewahrungsjob | ✅ ⚖️ | |
| Mitarbeiterbereich: 4 Rollen (Admin, Moderation, Support, Finanzen), Einladungen, Einstellungen mit Historie, Wartungsmodus, Feature-Flags, Kategorien, Pakete, Streams, Audit | ✅ | Pflicht-2FA |
| E-Mails: 17 Vorlagen (Text+HTML), Warteschlange, SMTP-Adapter, Abmeldung | ✅ 🔌 | Versand erst mit eigener Domain/SMTP-Dienst |

## Schnellstart

Voraussetzungen: Node.js ≥ 22, pnpm 10, PostgreSQL 16 (lokal).

```bash
cd platform
pnpm install

# Datenbank (Beispiel, lokal):
#   CREATE ROLE aurora LOGIN PASSWORD '…' CREATEDB;
#   CREATE DATABASE aurora_dev OWNER aurora;
#   CREATE DATABASE aurora_test OWNER aurora;   -- Integrationstests
#   CREATE DATABASE aurora_e2e OWNER aurora;    -- End-to-End-Tests

cp .env.example .env      # Werte anpassen, Geheimnisse erzeugen (siehe Kommentare)
pnpm db:migrate
pnpm db:seed              # fiktive Testdaten (nur *_dev / *_e2e)
pnpm dev                  # http://localhost:3000
```

## Befehle

| Befehl | Zweck |
|---|---|
| `pnpm dev` | Entwicklungsserver |
| `pnpm build` / `pnpm start` | Produktions-Build / -Server |
| `pnpm typecheck` | Route-Typen erzeugen + TypeScript (strikt) |
| `pnpm lint` | ESLint (Next.js Core Web Vitals + TypeScript) |
| `pnpm test` | Unit- und Integrationstests (Vitest; Integration gegen `aurora_test`) |
| `pnpm test:unit` / `pnpm test:integration` | einzeln |
| `pnpm build && pnpm test:e2e` | End-to-End (Playwright) gegen Produktions-Build und `aurora_e2e` |
| `pnpm db:generate` | Migration aus Schemaänderung erzeugen (drizzle-kit) |
| `pnpm db:migrate` | Migrationen anwenden (additiv, löscht nichts) |
| `pnpm db:seed` | Testdaten (verweigert Nicht-Entwicklungsdatenbanken) |
| `pnpm db:reset-dev --yes` | Entwicklungsdatenbank leeren (nur `*_dev`, nur `APP_ENV=development`) |
| `pnpm admin:create` | Erstes Mitarbeiterkonto per CLI (`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, optional `ADMIN_ROLE`) |
| `pnpm audit:deps` | Schwachstellen-Prüfung der Produktionsabhängigkeiten |

## Testkonten

Nach `pnpm db:seed` (nur Entwicklung; Passwort = `SEED_DEFAULT_PASSWORD` aus `.env`):

| Rolle | E-Mail | Hinweis |
|---|---|---|
| Admin | `admin@aurora.test` | 2FA: `SEED_ADMIN_TOTP_SECRET` bzw. Seed-Ausgabe |
| Moderation | `moderation@aurora.test` | 2FA: `SEED_MODERATOR_TOTP_SECRET` bzw. Seed-Ausgabe |
| Support | `support@aurora.test` | 2FA: `SEED_SUPPORT_TOTP_SECRET` bzw. Seed-Ausgabe |
| Finanzen | `finanzen@aurora.test` | 2FA: `SEED_FINANCE_TOTP_SECRET` bzw. Seed-Ausgabe |
| Kunde | `kunde@aurora.test` | Testguthaben, simulierte Altersprüfung, Beispielsitzung |
| Kunde (neu, DE) | `kunde.neu@aurora.test` | ohne Altersprüfung – zeigt die Sperren |
| Kunde (unbestätigt) | `kunde.unbestaetigt@aurora.test` | Einschränkungen ohne E-Mail-Bestätigung |
| Creator | `creator@aurora.test` | Profil „Aria“, freigegeben, simulierte Verifizierung, Erklärungen abgegeben |

Es gibt **keine** öffentliche Admin-Registrierung und keine Standard-Zugangsdaten in Produktion (Seed verweigert dort den Start).

## Projektstruktur

```
platform/
├─ drizzle/                  SQL-Migrationen (inkl. Integritäts-Trigger)
├─ scripts/                  migrate, seed, reset-dev, create-admin (mit Schutzprüfungen)
├─ src/
│  ├─ app/                   Routen: öffentlich, Auth, /account, /studio, /admin, /sessions, /checkout, /api (Webhooks, SSE, Jobs)
│  ├─ actions/               Server Actions (dünne Schicht: Auth-Prüfung → Service)
│  ├─ components/            UI-Designsystem (ui/), Layout, Feature-Komponenten
│  ├─ config/                env.ts (validiert), platform.ts (Geschäftsregeln), catalog.ts
│  ├─ lib/                   reine Hilfsfunktionen (Formatierung, Labels, Verifizierungslogik)
│  └─ server/                Geschäftslogik (modularer Monolith)
│     ├─ auth/  staff/  settings/  creators/  compliance/  age/  verification/
│     ├─ ledger/  payments/  payouts/  tips/  risk/  finance/  email/
│     ├─ video/  chat/  realtime/  social/  moderation/  support/  media/
│     ├─ notifications/  admin/  privacy/
│     └─ db/                 Drizzle-Schema & Client
└─ tests/  unit/  integration/  e2e/
```

Die vorhandene Datei `index.html` im Repository-Wurzelverzeichnis (Landingpage „Matei Voice AI“) gehört zu einem anderen
Projekt und wurde nicht verändert.
