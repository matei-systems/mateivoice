# Deployment, Betrieb, Backup & Monitoring

> Ein Produktionsbetrieb ist **derzeit nicht möglich und nicht vorgesehen**: Mit `APP_ENV=production` startet die
> Anwendung nur ohne Testmodus, ohne Sandbox-/Mock-Anbieter und mit HTTPS – echte Anbieter sind noch nicht
> freigegeben, Echtzahlungen sind im Code gesperrt. Für Demos/Abnahmen: `APP_ENV=staging` (Testmodus erlaubt).

## Voraussetzungen
- Node.js ≥ 22, pnpm 10, PostgreSQL 16 (bei mehreren Instanzen: gemeinsamer Speicher für Medien)
- Reverse Proxy mit TLS (Caddy/nginx), der `X-Forwarded-For` **setzt/überschreibt**
- Für SSE-Chat: Proxy-Pufferung für `/api/sessions/*/chat` deaktivieren (Header `X-Accel-Buffering: no` wird gesetzt),
  Idle-Timeout ≥ 60 s

## Ablauf
```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm db:migrate          # additiv, je Migration eine Transaktion, Advisory-Lock; vorher Backup
ADMIN_EMAIL=… ADMIN_USERNAME=… ADMIN_PASSWORD=… pnpm admin:create   # erstes Mitarbeiterkonto (danach Einladungen)
pnpm start
```

## Umgebungsvariablen (ohne Werte)
| Variable | Pflicht | Geheim | Zweck |
|---|---|---|---|
| `APP_ENV` | ja | | development/test/staging/production |
| `APP_URL` | ja | | Öffentliche URL (Produktion: https) |
| `DATABASE_URL` | ja | ✔ | PostgreSQL |
| `AUTH_SECRET` | ja | ✔ | HMAC-Schlüssel (IP-Hashes, Sandbox-Signaturen, Abmeldelinks) |
| `DATA_ENCRYPTION_KEY` | ja | ✔ | AES-256-GCM (TOTP-Geheimnisse, IBAN) |
| `TEST_MODE` | ja | | Produktion: `false` |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | ja | | Mail-Adapter; Absender = eigene verifizierte Domain |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` | bei smtp | | SMTP-Dienst |
| `SMTP_PASSWORD` | bei smtp | ✔ | SMTP-Zugang |
| `PAYMENT_PROVIDER` | ja | | simulated/verotel/none |
| `VEROTEL_SHOP_ID`, `VEROTEL_START_URL` | bei verotel | | Verotel FlexPay |
| `VEROTEL_SIGNATURE_KEY` | bei verotel | ✔ | Signaturschlüssel |
| `PAYOUT_PROVIDER` | ja | | sandbox/none (Produktion: none, bis Anbieter freigegeben) |
| `VIDEO_PROVIDER` | ja | | mock/livekit/none |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY` | bei livekit | | LiveKit |
| `LIVEKIT_API_SECRET` | bei livekit | ✔ | LiveKit-Geheimnis (nur Server) |
| `IDENTITY_PROVIDER` | ja | | mock/none (echter Anbieter offen) |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | ja | | Medienspeicher |
| `JOBS_SECRET` | empfohlen | ✔ | Schutz von `POST /api/jobs/run` |
| `LOG_LEVEL`, `NEXT_PUBLIC_PLATFORM_NAME`, `NEXT_TELEMETRY_DISABLED` | nein | | |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | bei mehreren Instanzen | ✔ | Stabile Server-Action-Verschlüsselung |

## Hintergrundjobs
Minütlich per Cron/Scheduler:
```bash
curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" "$APP_URL/api/jobs/run"
# Teilaufgaben: ?tasks=sessions,email,retention
```
- `sessions`: abgelaufene Anfragen/Verbindungsabbrüche beenden (auch bei Zugriffen)
- `email`: Warteschlange mit Backoff (max. 6 Versuche)
- `retention`: Aufbewahrungsfristen (Chat, E-Mail-Protokoll, Sitzungen, Token) unter Beachtung der Beweissicherung

## Webhook-Endpunkte
| Endpunkt | Methode | Prüfung |
|---|---|---|
| `/api/webhooks/payments/simulated` | POST | HMAC + Zeitstempel (nur Testmodus) |
| `/api/webhooks/payments/verotel` | GET | SHA-256-Signatur + Shop-ID; Antwort `OK` |
| `/api/webhooks/video/livekit` | POST | LiveKit-Signatur (JWT + Body-Hash) |
| `/api/unsubscribe` | POST | signiertes Abmelde-Token (RFC 8058) |

## Schutz vor Datenverlust
- `db:seed`/`db:reset-dev` nur gegen `*_dev`/`*_e2e` (mehrfach abgesichert); Tests nur gegen `*_test`/`*_e2e`.
- Migrationen sind additiv; Journal, Audit, Einstellungs-Historie, Erklärungen und Moderationsbegründungen sind per Trigger unveränderlich.

## Backup & Wiederherstellung
| Was | Wie | Häufigkeit | Aufbewahrung |
|---|---|---|---|
| Datenbank | `pg_dump -Fc`, verschlüsselt, offsite | täglich + vor Releases | 7/4/12 (täglich/wöchentlich/monatlich) – an Aufbewahrungspflichten anpassen |
| Medien | Versionierter Objektspeicher bzw. `rsync`, verschlüsselt | täglich | wie DB |
| Geheimnisse | Secret-Manager | bei Änderung | – |

Monatlicher Wiederherstellungstest; danach Admin-Übersicht „Integrität des Buchungsjournals“ muss grün sein.
Recovery-Ziele (Vorschlag): RPO ≤ 24 h, RTO ≤ 4 h.

## Monitoring
- `GET /api/health` (503 bei DB-Problemen), strukturierte JSON-Logs mit Schwärzung, Fehler-Referenz-IDs
- Finanzbericht mit Ledger-Abgleich; Risikosignale mit hoher Priorität benachrichtigen Finanzen
- Empfohlen: Alarm bei Webhook-Fehlern (5xx), fehlgeschlagenen E-Mails, Abgleichsabweichungen
