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
        ──► Route Handler (media, export, health, webhooks, chat-SSE, jobs, CSV-Export)
Externe Anbieter (alle austauschbar; im Testmodus Sandbox/Mock):
  E-Mail (dev-outbox | SMTP) · Zahlung (Sandbox | Verotel, gesperrt) · Auszahlung (Sandbox)
  · Video (Mock | LiveKit) · Alters-/ID-Prüfung (Mock) · Dateispeicher (lokal)
Echtzeit: PostgreSQL LISTEN/NOTIFY → In-Process-Hub → Server-Sent Events
```

### Module (`src/server`)

| Modul | Verantwortung |
|---|---|
| `auth` | Passwort-Hashing (scrypt), Sitzungen, TOTP, Rollen/Berechtigungen (6 Rollen), Registrierung, Reset, Kontolöschung |
| `staff` | Mitarbeiter-Einladung (Einmal-Link), Rollenwechsel, Deaktivierung, „mindestens ein Admin“ |
| `settings` | Admin-konfigurierbare Einstellungen (Zod-Schemas, Historie, Audit, 5-s-Cache), Kategorien |
| `creators` | Suche, öffentliche Profile, Veröffentlichungs-Checkliste, Bearbeitung, Prüfung |
| `compliance` | Pflichterklärungen (versioniert, unveränderlich), Beweissicherung, Datenschutzanfragen, Aufbewahrungsjob |
| `age` / `verification` | Altersprüfung Zuschauer (je Land konfigurierbar) / Alters-&ID-Prüfung Creator (Mock) |
| `video` | Zustandsautomat, private Chats, Streams, Beitritts-Token (Mock HMAC / LiveKit JWT), Abrechnung pro Minute, Anbieter-Webhooks |
| `chat` / `realtime` | Chat mit Filtern, Stummschalten, Moderation / LISTEN-NOTIFY-Hub für SSE |
| `social` / `tips` | Blockieren, Favoriten / Trinkgelder mit Provisionsaufteilung |
| `ledger` | Doppelte Buchführung, Idempotenz, Testguthaben, Kulanzerstattung, Abgleich |
| `payments` | Checkout, Anbieter-Adapter (Sandbox, Verotel), Webhook-Verarbeitung, Erstattung/Chargeback, Pakete |
| `payouts` | Auszahlungsprofil (IBAN verschlüsselt), Antrag mit Ledger-Reservierung, Freigabe/Ausführung (Vier-Augen) |
| `risk` / `finance` | Regelbasierte Risikosignale / Finanzbericht und CSV-Export |
| `email` | Vorlagen (Text+HTML), Warteschlange mit Wiederholungen, SMTP-Adapter, Abmelde-Token |
| `moderation` | Meldungen mit Priorität (inkl. Chatnachrichten), Sanktionen, Begründungen, Einsprüche, Stream-Beenden |
| `support` | Tickets und Nachrichten |
| `media` | Upload-Validierung, Neu-Kodierung, privater Speicher, Auslieferung mit Berechtigungsprüfung |
| `notifications` | In-App-Benachrichtigungen, Benachrichtigung von Mitarbeitern nach Berechtigung |
| `admin` | Kennzahlen (inkl. aktuelle Zuschauer, Risiko, Finanzen), Nutzerlisten (maskiert), Konfigurationsübersicht |
| `privacy` | Datenexport (Art. 15/20 DSGVO) |
| `audit`, `rate-limit`, `crypto`, `log`, `errors` | Querschnitt |

### Schichten & Regeln

1. **UI** (`app/`, `components/`) enthält keine Geschäftslogik und berechnet keine verbindlichen Beträge.
2. **Server Actions** (`actions/`) prüfen Authentifizierung/Berechtigung (`assertPermission`) und rufen Services auf.
3. **Services** prüfen erneut (Defense in Depth) und kapseln Transaktionen.
4. **Datenbank** sichert Invarianten zusätzlich per Constraints und Triggern ab.

## Datenmodell (42 Tabellen)

Neu in Stage 2: `platform_settings`, `platform_settings_history` (append-only), `categories`, `favorites`,
`user_blocks`, `chat_messages`, `chat_mutes`, `creator_declarations` (append-only), `age_verifications`,
`legal_holds`, `privacy_requests`, `moderation_actions` (append-only), `risk_events`, `creator_payout_profiles`;
erweitert: `payouts` (Workflow, Snapshot Euro-Wert, „ein offener Antrag je Creator“), `email_outbox` (Warteschlange),
`users.country`.

- **Konten:** `users`, `auth_sessions` (nur Token-Hash), `auth_tokens` (nur Hash), `user_consents` (Dokumentversionen),
  `notification_preferences`
- **Creator:** `creator_profiles`, `creator_offers` (Preis-Grenzen per CHECK), `creator_verifications`
  (CHECK: Mock ≠ „verified“), `media_assets`
- **Buchhaltung:** `ledger_accounts` (Saldo, CHECK ≥ 0 außer Systemkonten), `ledger_transactions`
  (eindeutiger `idempotency_key`, max. eine Umkehr je Buchung), `ledger_entries`, `coin_packages`, `payment_orders`,
  `payment_events` (eindeutig je Anbieter-Ereignis), `payouts` (CHECK: `TEST_COIN` nur simuliert über Anbieter `sandbox`)
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
- **Provision:** Plattform-Einstellung `commission.platformBps` (Standard **2500 = 25 % Plattform / 75 % Model**,
  änderbar nur mit Begründung, Historie + Audit). Creator-Anteil = ⌊Brutto × (10000 − bps) / 10000⌋, Rest Plattform.
  Der Satz wird je Sitzung (Snapshot bei Anfrage) bzw. je Trinkgeld-Buchung gespeichert – Änderungen wirken nie rückwirkend.
- **Käufe:** Bestellung `pending` → Anbieter → signiertes Ereignis an `/api/webhooks/payments/[provider]` →
  Prüfung (Signatur, Bestellung, Betrag/Währung, Idempotenz) → Buchung `purchase` (Clearing → Kundenkonto).
  Erstattung/Chargeback: Umkehr; bereits verbrauchte Münzen werden als Verlust dem Plattformkonto belastet.
- **Auszahlungen:** Antrag bucht `creator_earnings → system_payout_clearing` (Reservierung); Ausführung bucht
  `system_payout_clearing → system_payout_settled`; Ablehnung/Fehlschlag/Rückzug bucht die Reservierung zurück.
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
| Auszahlung beantragt / freigegeben / ausgeführt / abgelehnt / fehlgeschlagen | `payouts.status` (Sandbox-Ausführung im Testmodus) |
| Trinkgeld | Buchung `tip` (Kunde → Creator 75 % / Plattform 25 %) + Chatnachricht |

## Video-Architektur

- `VideoProvider`-Schnittstelle: `createRoom`, `issueJoinToken` (Mock: HMAC; LiveKit: JWT mit Raum-/Rollenrechten,
  nur Creator senden, keine Aufzeichnung), `verifyJoinToken`, `closeRoom` (LiveKit: Raum löschen). Details: [STREAMING.md](STREAMING.md).
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
9. **Feste Themen-/Sprachlisten** statt Freitext-Tags – Kategorien sind seit Stage 2 von Mitarbeitern pflegbar.
10. **Chat über Server-Sent Events + PostgreSQL LISTEN/NOTIFY statt WebSockets.** Next.js-Route-Handler unterstützen
    keine WebSocket-Upgrades; ein eigener Node-Server würde die Server-/Client-Grenzen und das Deployment
    verkomplizieren. SSE (TLS, Cookie-Authentifizierung, automatische Wiederverbindung) deckt den Empfang ab, gesendet
    wird über CSRF-geschützte Server Actions mit Rate-Limits. NOTIFY ist transaktional (keine Ereignisse für
    zurückgerollte Vorgänge) und funktioniert über mehrere Instanzen ohne zusätzliche Infrastruktur. Grenze: viele
    tausend gleichzeitige Verbindungen pro Instanz → dann Hub gegen Redis/NATS tauschen (gleiche Schnittstelle).
    Die Anforderung „Secure WebSocket handling“ wird damit sinngemäß (verschlüsselte, authentifizierte Echtzeitverbindung)
    erfüllt, technisch aber über SSE.
11. **Einstellungen in der Datenbank statt Umgebungsvariablen** für Geschäftsregeln (Provision, Limits, Flags,
    Länder) – mit Validierung, Begründungspflicht, unveränderlicher Historie; Geheimnisse bleiben in der Umgebung.
12. **Webhooks als echte HTTP-Route, auch in der Sandbox** – die Sandbox-Kasse stellt Ereignisse per HTTP-POST
    zu; damit durchläuft der Testbetrieb denselben Pfad (Signatur, Idempotenz, Betragsprüfung) wie ein echter Anbieter.
13. **Vier-Augen-Prinzip für Auszahlungen** und **Statement of Reasons** für jede Moderationsmaßnahme als
    unveränderliche Datensätze (DB-Trigger) – Nachvollziehbarkeit für Kartennetzwerke, DSA und Prüfungen.
14. **Race-Conditions über Sperren + Datenbankregeln:** kritische Abläufe (Auszahlungsantrag, Kauflimits, Buchungen)
    prüfen unter Zeilensperre; zusätzlich sichern partielle Unique-Indizes die Invarianten ab.
15. **Eigener Migrationslauf mit einer Transaktion je Migration** (`scripts/migrate.ts`, kompatibel zur
    drizzle-Migrationstabelle, mit Advisory-Lock gegen parallele Läufe): Der Standard-Migrator führt alle
    ausstehenden Migrationen in einer Transaktion aus; neu hinzugefügte Enum-Werte dürfen in PostgreSQL aber erst
    nach dem Commit verwendet werden. Ohne diese Änderung schlug eine **frische** Installation fehl (durch E2E entdeckt).

## Internationalisierung / Expansion

Markt, Locale und Zeitzone liegen zentral in `config/platform.ts`. Texte sind derzeit deutsch im Code; für DE/EU-Expansion
ist eine Übersetzungsschicht (z. B. `next-intl`) vorgesehen, sobald ein zweiter Markt konkret wird – bewusst nicht vorab
eingebaut, um die erste Version schlank zu halten.
