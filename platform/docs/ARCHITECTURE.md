# Architektur

## Überblick

Modularer Monolith auf **Next.js 16 (App Router, React 19)**, **TypeScript (strict)** und **PostgreSQL 16**
(Zugriff über **Drizzle ORM** mit SQL-Migrationen). Ein einziger Deploy-Artefakt, eine Datenbank – passend zu Budget
(500–1.500 €) und Teamgröße. Module sind über klare Service-Grenzen getrennt und können später bei Bedarf herausgelöst
werden.

```
Browser ──► proxy.ts (CSP-Nonce, HSTS, optimistische Weiterleitung)
        ──► Seiten (Server Components)  ──► server/<modul>/service.ts ──► PostgreSQL
        ──► Server Actions (actions/*)  ──► Berechtigungsprüfung ──► Service
        ──► Route Handler (media, export, health)
Externe Anbieter (alle austauschbar, aktuell Mock/Simulation):
  E-Mail · Zahlung · Auszahlung · Video · Alters-/ID-Prüfung · Dateispeicher
```

### Module (`src/server`)

| Modul | Verantwortung |
|---|---|
| `auth` | Passwort-Hashing (scrypt), Sitzungen, TOTP, Rollen/Berechtigungen, Registrierung, Reset, Kontolöschung |
| `creators` | Suche, öffentliche Profile, Bearbeitung durch Creator, Prüfung durch Admins |
| `verification` | Schnittstelle Alters-/Identitätsprüfung (Mock) |
| `video` | Zustandsautomat, private Chats, öffentliche Streams, Beitritts-Token, Abrechnung pro Minute |
| `ledger` | Doppelte Buchführung, Idempotenz, Testguthaben, Gegenbuchungen, Abgleich |
| `payments` / `payouts` | Zahlungsanbieter-Schnittstelle (simuliert, Webhooks), Auszahlungen (vorbereitet) |
| `moderation` | Meldungen mit Priorität, Sanktionen, Einsprüche |
| `support` | Tickets und Nachrichten |
| `media` | Upload-Validierung, Neu-Kodierung, privater Speicher, Auslieferung mit Berechtigungsprüfung |
| `notifications` | In-App-Benachrichtigungen, E-Mail-Adapter (Dev-Outbox) |
| `admin` | Kennzahlen, Nutzerlisten (maskiert), Konfigurationsübersicht |
| `privacy` | Datenexport (Art. 15/20 DSGVO) |
| `audit`, `rate-limit`, `crypto`, `log`, `errors` | Querschnitt |

### Schichten & Regeln

1. **UI** (`app/`, `components/`) enthält keine Geschäftslogik und berechnet keine verbindlichen Beträge.
2. **Server Actions** (`actions/`) prüfen Authentifizierung/Berechtigung (`assertPermission`) und rufen Services auf.
3. **Services** prüfen erneut (Defense in Depth) und kapseln Transaktionen.
4. **Datenbank** sichert Invarianten zusätzlich per Constraints und Triggern ab.

## Datenmodell (28 Tabellen)

- **Konten:** `users`, `auth_sessions` (nur Token-Hash), `auth_tokens` (nur Hash), `user_consents` (Dokumentversionen),
  `notification_preferences`
- **Creator:** `creator_profiles`, `creator_offers` (Preis-Grenzen per CHECK), `creator_verifications`
  (CHECK: Mock ≠ „verified“), `media_assets`
- **Buchhaltung:** `ledger_accounts` (Saldo, CHECK ≥ 0 außer Systemkonten), `ledger_transactions`
  (eindeutiger `idempotency_key`, max. eine Umkehr je Buchung), `ledger_entries`, `coin_packages`, `payment_orders`,
  `payment_events` (eindeutig je Anbieter-Ereignis), `payouts` (CHECK: nur `COIN`, nie `TEST_COIN`)
- **Video:** `video_sessions` (Preis-/Provisions-Snapshot; partielle Unique-Indizes: eine offene Anfrage je Kunde,
  ein privater Chat je Creator, ein Stream je Creator), `video_session_participants`, `video_session_events`
- **Moderation/Support:** `reports`, `sanctions`, `appeals` (einer je Sanktion), `admin_audit_logs`,
  `support_tickets`, `support_messages`
- **System:** `notifications`, `email_outbox`, `rate_limit_buckets`

Geldbeträge: Münzen als Ganzzahlen (`bigint`), Euro als Cent-Ganzzahlen. Zeitstempel als `timestamptz` (UTC);
Darstellung in `Europe/Vienna`.

### Integritäts-Trigger (`drizzle/0001_integrity_triggers.sql`)

- Jede Buchung ist ausgeglichen (Summe 0, ≥ 2 Einträge) – verzögerter Constraint-Trigger beim Commit.
- Einträge verwenden dieselbe Münzwährung wie Buchung und Konto.
- `ledger_entries`, `ledger_transactions`, `admin_audit_logs` sind append-only (UPDATE/DELETE wird abgewiesen).

## Münzsystem & Abrechnung

- Währungen: `TEST_COIN` (simuliert, immer `simulated = true`) und `COIN` (reserviert, im Prototyp gesperrt).
- **Idempotenz:** `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`; parallele Wiederholungen warten auf den
  Unique-Index und liefern die bestehende Buchung.
- **Atomarität & Überziehungsschutz:** Konten werden in fester Reihenfolge per `SELECT … FOR UPDATE` gesperrt, Salden in
  derselben Transaktion fortgeschrieben.
- **Private Chats (Prepaid je Minute):** Minute *n* wird zu ihrem Beginn berechnet, Schlüssel
  `session:<id>:minute:<n>`. Fehlendes Guthaben → Savepoint-Rollback und Sitzungsende `insufficient_funds`.
  Grundlage sind ausschließlich Server-Zeitstempel; Herzschläge des Browsers lösen nur die Berechnung aus.
- **Provision:** zentral in `config/platform.ts` (3000 bps, vorläufig, per `PLATFORM_COMMISSION_BPS` überschreibbar).
  Creator-Anteil = ⌊Brutto × (10000 − bps) / 10000⌋, Rest Plattform. Der Satz wird je Sitzung/Buchung gespeichert.
- **Korrekturen:** nur Gegenbuchungen (Rückerstattung/Rückbuchung, je Buchung höchstens eine) oder begründete
  Admin-Korrekturen – jeweils mit Audit-Eintrag in derselben Transaktion.

### Zustände (Abbildung der geforderten Stati)

| Geforderter Zustand | Abbildung |
|---|---|
| Testguthaben erstellt | Buchung `test_credit` |
| Testmünzen verwendet | Buchung `session_charge` |
| Transaktion vorgemerkt | `payment_orders.status = pending` |
| Zahlung bestätigt / fehlgeschlagen | `payment_orders.status = confirmed / failed` (+ Buchung `purchase`) |
| Rückerstattung / Rückbuchung | Buchungen `refund` / `chargeback` mit `reversal_of_id` |
| Creator-Anteil vorgemerkt | Gutschrift auf Konto `creator_earnings` |
| Auszahlung ausstehend / abgeschlossen / fehlgeschlagen | `payouts.status` (vorbereitet, nicht ausführbar) |

## Video-Architektur

- `VideoProvider`-Schnittstelle: `createRoom`, `issueJoinToken` (HMAC-signiert, 120 s gültig, an Nutzer+Sitzung+Rolle
  gebunden), `verifyJoinToken`, `closeRoom`. Mock erzeugt keine Streams und keine öffentlichen URLs.
- Zustandsautomat `requested → accepted → active → ended` (+ declined/cancelled/expired/failed), reine Funktion, getestet.
- Beitritt nur für die beiden Teilnehmer (privat) bzw. angemeldete Kunden (öffentlich); Admins sehen Metadaten, treten nie still bei.
- Verbindungsverlust: > 45 s ohne Herzschlag → Ende `connection_lost`; abgelaufene Anfragen werden automatisch beendet.
- Keine Aufzeichnung. Bildschirmaufnahmen durch Gegenüber sind technisch nicht vollständig verhinderbar (offen kommuniziert).

## Architekturentscheidungen (ADR, Kurzform)

1. **Modularer Monolith statt Microservices** – geringe Fixkosten, einfache Transaktionen über Modulgrenzen.
2. **Drizzle ORM + SQL-Migrationen** – volle Kontrolle über Constraints/Trigger, keine Laufzeit-Engine, typsicher.
3. **Eigene Sitzungsverwaltung statt Auth-Framework** – serverseitige Sitzungen (Token-Hash in DB), scrypt nach OWASP,
   TOTP nach RFC 6238 (gegen RFC-Testvektoren geprüft). Begründung: volle Kontrolle über Rollenmodell, Testbarkeit,
   keine versteckten Tabellen. Risiko: Eigenverantwortung für Pflege – durch Tests und Doku abgefedert.
4. **Rate-Limits in PostgreSQL** – kein Redis nötig (Kosten); atomar über UPSERT.
5. **Berechtigungen als reine Funktionen** (`server/auth/permissions.ts`) – zentral, vollständig unit-getestet.
6. **Anbieter hinter Schnittstellen + Testmodus-Sperre** – `env.ts` verweigert Produktion mit Mock/Simulation.
7. **Kein Cache-Components-Modus** – fast alle Seiten sind personalisiert (Sitzung); dynamisches Rendering mit
   CSP-Nonce ist einfacher und sicherer.
8. **Uploads neu kodieren (sharp → WebP)** – entfernt Metadaten/EXIF, verhindert polyglotte Dateien.
9. **Feste Themen-/Sprachlisten** statt Freitext-Tags – reduziert Moderationsaufwand und Missbrauch.

## Internationalisierung / Expansion

Markt, Locale und Zeitzone liegen zentral in `config/platform.ts`. Texte sind derzeit deutsch im Code; für DE/EU-Expansion
ist eine Übersetzungsschicht (z. B. `next-intl`) vorgesehen, sobald ein zweiter Markt konkret wird – bewusst nicht vorab
eingebaut, um die erste Version schlank zu halten.
