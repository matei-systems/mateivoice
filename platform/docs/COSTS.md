# Kosten & Budget (500–1.500 €)

> Alle Beträge sind **grobe Schätzungen** zur Planung und müssen beim jeweiligen Anbieter aktuell geprüft werden.
> Es wurden **keine** kostenpflichtigen Dienste angelegt oder Verträge abgeschlossen.

## Entwicklungskosten (bisher)

| Posten | Kosten | Anmerkung |
|---|---|---|
| Next.js, React, TypeScript, Tailwind, Drizzle, Zod, Vitest, Playwright, lucide-react, sharp, qrcode | 0 € | Open Source (MIT/Apache/ISC) |
| Schriften Inter & Fraunces | 0 € | SIL Open Font License, lokal eingebunden (keine Google-Fonts-Abrufe zur Laufzeit) |
| PostgreSQL lokal | 0 € | |
| Externe SaaS | 0 € | bewusst keine |

## Laufende Betriebskosten (Schätzung, nach Anbieterfreigaben)

| Posten | Zweck | Fixkosten/Monat (grob) | Nutzungsabhängig | Kostenlose/günstige Alternative | Offene Freigabe |
|---|---|---|---|---|---|
| Hosting (VPS) | App + DB auf einem Server | ca. 5–40 € | Traffic | Selbst betriebener VPS statt PaaS | Adult-AUP des Hosters |
| Managed PostgreSQL (optional) | Betrieb/Backups | ca. 0–50 € | Speicher | PostgreSQL auf dem VPS + `pg_dump` | ja |
| Objektspeicher + Backups | Bilder, Backups | ca. 1–10 € | GB/Monat | lokaler Speicher + verschlüsselte Offsite-Kopie | ja |
| Domain + DNS | | ca. 1–3 € (jährlich bezahlt) | | – | Registrar-AUP |
| E-Mail-Versand | Bestätigung, Reset | 0–20 € | pro E-Mail | kleines Kontingent eines Anbieters | **ja (Adult)** |
| Alters-/ID-Prüfung | Creator-KYC | oft 0 € Fix | **pro Prüfung** (häufig mehrere €/Prüfung) | – | **ja (Adult)** |
| Video (WebRTC/Streaming) | Live & privat | 0–100 € | **pro Teilnehmerminute** – größter variabler Posten | Selbst gehosteter SFU (z. B. Open Source) – höherer Betriebsaufwand | **ja (Adult)** |
| Zahlungsanbieter (High-Risk) | Münzkauf | evtl. Einrichtung/Monatsgebühr | **Transaktionsgebühren** meist deutlich höher als Standard | – | **ja (Adult)** |
| Fehlerüberwachung | Monitoring | 0 € (Free-Tier) | Ereignisse | Logs + Health-Check | Datenschutz prüfen |
| Rechts-/Steuerberatung | siehe LEGAL-Dokument | einmalig, voraussichtlich größter Budgetposten | | | – |

### Empfehlung für das Budget

1. Rechts-/Steuerberatung und Anbieterfreigaben priorisieren – ohne sie ist kein Echtbetrieb möglich.
2. Zunächst ein einzelner VPS (App + DB) mit täglichem verschlüsselten Backup.
3. Video- und Zahlungsanbieter erst nach schriftlicher Freigabe; Kostenmodelle pro Minute/Transaktion vorab durchrechnen.
4. Keine zusätzlichen SaaS-Abos, solange Free-Tiers oder eigener Betrieb genügen.

## Skalierung (spätere Kostentreiber)

- Video-Minuten (dominant), Zahlungsgebühren, KYC pro Creator, Speicher für Medien, Moderationsaufwand (Personal).
- Architektur erlaubt horizontale Skalierung der App-Instanzen (Sitzungen/Rate-Limits liegen in PostgreSQL,
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` für mehrere Instanzen setzen).
