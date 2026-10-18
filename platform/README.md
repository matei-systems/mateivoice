# Project Aurora – Prototyp einer Live-Webcam-Plattform (18+)

> **Arbeitsname.** „Project Aurora“ ist zentral über `NEXT_PUBLIC_PLATFORM_NAME` bzw. `src/config/platform.ts` austauschbar.
>
> **Status: Prototyp im Testmodus.** Keine echten Zahlungen, keine echten Streams, keine echte Alters-/Identitätsprüfung,
> keine echten E-Mails. Alle Profile sind fiktive, gekennzeichnete Testdaten. Rechtstexte sind Entwürfe.

Eine Plattform für öffentliche Live-Streams und private 1:1-Videochats zwischen volljährigen Kundinnen/Kunden und
erwachsenen Creatorn. Erster Markt: Österreich. Architektur, Sicherheit und Buchhaltung sind so angelegt, dass echte
Anbieter später ohne Umbau angebunden werden können – **erst nach Prüfung und schriftlicher Freigabe**.

## Inhalt

- [Was funktioniert – ehrliche Statusübersicht](#statusübersicht)
- [Schnellstart (lokal)](#schnellstart)
- [Befehle](#befehle)
- [Testkonten](#testkonten)
- [Projektstruktur](#projektstruktur)
- Weiterführend: [Architektur](docs/ARCHITECTURE.md) · [Sicherheit](docs/SECURITY.md) · [Tests](docs/TESTING.md) ·
  [Rechtliche offene Fragen AT](docs/LEGAL-OPEN-QUESTIONS-AT.md) · [Kosten](docs/COSTS.md) ·
  [Deployment, Backup & Monitoring](docs/DEPLOYMENT.md) · [Anbieter-Integration](docs/PROVIDER-INTEGRATION.md)

## Statusübersicht

Legende: ✅ fertig implementiert & getestet · 🟡 teilweise · 🧪 simuliert (Testmodus) · 🎨 nur visuell ·
🔌 von externem Anbieter abhängig · ⚖️ rechtlich zu prüfen

| Bereich | Status | Anmerkung |
|---|---|---|
| Designsystem (Tokens Hellrosa/Weiß/Pink, Komponenten, Animationen, `prefers-reduced-motion`) | ✅ | `src/app/globals.css`, `src/components/ui` |
| Startseite, Suche/Filter/Sortierung, Creator-Karten, Profilseiten | ✅ | Serverseitige Suche, leere/Lade-/Fehlerzustände |
| Responsive & mobile Navigation (Tab-Leiste + Menü) | ✅ | E2E-geprüft ohne horizontales Scrollen |
| Registrierung, Login, Abmelden, E-Mail-Bestätigung, Passwort-Reset | ✅ / 🔌 | E-Mails landen nur in der Dev-Mailbox (`/dev/mailbox`) |
| Sitzungen, Rollen, Berechtigungen (serverseitig), Rate-Limits, Honeypot | ✅ | Kein Captcha-Anbieter (🔌 optional später) |
| 2FA (TOTP) – Pflicht für Admins | ✅ | QR-Code, Replay-Schutz, verschlüsselte Geheimnisse |
| Kunden-Dashboard (Testguthaben, Kontoauszug, Sitzungen, Hinweise, Einstellungen, Datenexport, Kontolöschung) | ✅ | |
| Creator-Studio (Profil, Bilder, Preise, Live-Status, Anfragen, Einnahmen inkl. Provision) | ✅ | |
| Auszahlungen | 🎨 🔌 ⚖️ | Vorbereitete Ansicht; Testmünzen per DB-Constraint nie auszahlbar |
| Admin-Bereich (Dashboard, Nutzer, Profilprüfung, Meldungen, Sanktionen, Einsprüche, Transaktionen, Support, Konfiguration, Audit) | ✅ | 2FA-pflichtig, jede Änderung im unveränderlichen Audit-Log |
| Münzsystem / Buchungsjournal (doppelte Buchführung, Idempotenz, Parallelität) | ✅ 🧪 | Nur `TEST_COIN`; echte Münzen gesperrt ⚖️ |
| Münzkauf | 🧪 🔌 ⚖️ | Simulierter Zahlungsanbieter inkl. signierter Webhooks (nur Admin-Simulation) |
| Video: Sitzungsmodell, Zustandsautomat, Zugriffstoken, Abrechnung pro Minute, Verbindungsabbruch | ✅ 🧪 | Kein Videoanbieter → kein Bild/Ton (🔌) |
| Alters-/Identitätsprüfung für Creator | 🧪 🔌 ⚖️ | Mock kann per DB-Constraint nie „verifiziert“ erzeugen |
| Altershinweis für Gäste | ✅ ⚖️ | Selbstauskunft, **keine** Altersverifikation |
| Moderation (Meldungen mit Priorität, Sanktionen, Einsprüche) | ✅ | Behördliche Meldewege ⚖️ |
| Support (Kontaktformular, Tickets, Antworten) | ✅ / 🔌 | Antworten an Gäste per E-Mail noch nicht möglich |
| Benachrichtigungen | ✅ (In-App) / 🔌 (E-Mail/Push) | |
| SEO (Metadaten, Sitemap, Robots, noindex privater Bereiche) | ✅ | Profile standardmäßig nicht indexiert |
| Rechtstexte (Impressum, AGB, Datenschutz, Creator-Vereinbarung, Richtlinien) | 🎨 ⚖️ | Entwürfe mit markierten offenen Punkten |

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
| `pnpm admin:create` | Admin-Konto per CLI anlegen (`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) |
| `pnpm audit:deps` | Schwachstellen-Prüfung der Produktionsabhängigkeiten |

## Testkonten

Nach `pnpm db:seed` (nur Entwicklung; Passwort = `SEED_DEFAULT_PASSWORD` aus `.env`):

| Rolle | E-Mail | Hinweis |
|---|---|---|
| Admin | `admin@aurora.test` | 2FA: TOTP-Geheimnis aus `SEED_ADMIN_TOTP_SECRET` bzw. Seed-Ausgabe |
| Kunde | `kunde@aurora.test` | mit Testguthaben und Beispielsitzung |
| Kunde (unbestätigt) | `kunde.unbestaetigt@aurora.test` | zeigt Einschränkungen ohne E-Mail-Bestätigung |
| Creator | `creator@aurora.test` | Profil „Aria“, freigegeben, Testmodus-Verifizierung |

Es gibt **keine** öffentliche Admin-Registrierung und keine Standard-Zugangsdaten in Produktion (Seed verweigert dort den Start).

## Projektstruktur

```
platform/
├─ drizzle/                  SQL-Migrationen (inkl. Integritäts-Trigger)
├─ scripts/                  migrate, seed, reset-dev, create-admin (mit Schutzprüfungen)
├─ src/
│  ├─ app/                   Routen (App Router): Marketing, Auth, /account, /studio, /admin, /sessions
│  ├─ actions/               Server Actions (dünne Schicht: Auth-Prüfung → Service)
│  ├─ components/            UI-Designsystem (ui/), Layout, Feature-Komponenten
│  ├─ config/                env.ts (validiert), platform.ts (Geschäftsregeln), catalog.ts
│  ├─ lib/                   reine Hilfsfunktionen (Formatierung, Labels, Verifizierungslogik)
│  └─ server/                Geschäftslogik (modularer Monolith)
│     ├─ auth/  creators/  ledger/  payments/  payouts/  video/  verification/
│     ├─ moderation/  support/  media/  notifications/  admin/  privacy/
│     └─ db/                 Drizzle-Schema & Client
└─ tests/  unit/  integration/  e2e/
```

Die vorhandene Datei `index.html` im Repository-Wurzelverzeichnis (Landingpage „Matei Voice AI“) gehört zu einem anderen
Projekt und wurde nicht verändert.
