# Deployment, Betrieb, Backup & Monitoring

> Ein Produktionsbetrieb ist **derzeit nicht möglich und nicht vorgesehen**: Mit `APP_ENV=production` startet die
> Anwendung nur ohne Testmodus und ohne Mock-Anbieter – echte Anbieter sind noch nicht freigegeben.
> Für Demos/Abnahmen eignet sich `APP_ENV=staging` (Testmodus erlaubt, Entwicklungs-Mailbox deaktiviert).

## Voraussetzungen

- Node.js ≥ 22, pnpm 10, PostgreSQL 16
- Reverse Proxy mit TLS (z. B. Caddy oder nginx), der `X-Forwarded-For` **setzt/überschreibt** (nicht anhängt an
  Client-Werte) – sonst sind IP-basierte Rate-Limits umgehbar.

## Ablauf

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm db:migrate          # additiv; vor jedem Release ein Backup ziehen
pnpm start               # Port 3000 hinter dem Reverse Proxy
```

Wichtige Umgebungsvariablen: siehe `.env.example`. Zusätzlich bei mehreren Instanzen:
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (stabil, geheim) und gemeinsamer Dateispeicher.

Beispiel Caddy:

```
plattform.example {
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Forwarded-For {remote_host}
  }
}
```

## Schutz vor Datenverlust durch Entwicklungsbefehle

- `db:seed` läuft nur gegen Datenbanken mit Suffix `_dev`/`_e2e` und nie bei `APP_ENV=staging|production`.
- `db:reset-dev` nur bei `APP_ENV=development`, Datenbank `*_dev` und explizitem `--yes`.
- Integrationstests nur gegen `*_test`, E2E nur gegen `*_e2e`.
- Migrationen löschen keine Daten; Journal/Audit sind per Trigger unveränderlich.

## Backup- und Wiederherstellungskonzept

| Was | Wie | Häufigkeit | Aufbewahrung |
|---|---|---|---|
| Datenbank | `pg_dump -Fc` → verschlüsselt (z. B. `age`/GPG) → Offsite-Speicher | täglich + vor jedem Release | 7 täglich, 4 wöchentlich, 12 monatlich (an Aufbewahrungspflichten anpassen) |
| Medien (`STORAGE_LOCAL_DIR`) | `rsync`/Objektspeicher-Versionierung, verschlüsselt | täglich | wie DB |
| Konfiguration/Geheimnisse | Passwortmanager/Secret-Store, nie im Git | bei Änderung | – |

Wiederherstellung (monatlich testen!):

```bash
createdb aurora_restore_check
pg_restore -d aurora_restore_check backup.dump
DATABASE_URL=…/aurora_restore_check pnpm db:migrate   # bringt das Schema auf den aktuellen Stand
# Plausibilitätsprüfung: Admin-Dashboard → „Integrität des Buchungsjournals“ muss grün sein
```

Recovery-Ziele (Vorschlag): RPO ≤ 24 h, RTO ≤ 4 h.

## Monitoring & Fehlerüberwachung

- **Health-Check:** `GET /api/health` → `{"status":"ok"}` bzw. HTTP 503 bei DB-Problemen (für Uptime-Monitor).
- **Logs:** strukturiertes JSON auf stdout/stderr, sensible Felder werden geschwärzt (`src/server/log.ts`).
  Unerwartete Fehler in Server Actions enthalten eine Referenz-ID, die Nutzern angezeigt wird.
- **Integrität:** Admin-Dashboard gleicht alle Kontosalden mit dem Journal ab (Abweichungen werden rot angezeigt).
- **Wartung:** abgelaufene Anfragen/Verbindungsabbrüche werden bei Zugriffen bereinigt; zusätzlich manuell im
  Admin-Dashboard oder später per Cron (`sweepSessions`). Rate-Limit- und Sitzungsbereinigung: `pruneRateLimits`,
  `pruneExpiredSessions` (für einen periodischen Job vorbereitet).
- **Optional:** Error-Tracking-Dienst (Free-Tier) erst nach Datenschutzprüfung; Hook-Punkt: `src/instrumentation.ts`
  (`onRequestError`).
