# Abschlussbericht Stage 2 – Project Aurora (22.11.2026)

Branch: `claude/aurora-platform-foundation` · Verzeichnis `platform/` · Kein Pull Request erstellt.

## A. Fertiggestellt
- **Premium-Dark-Design** über Design-Tokens (alle Seiten, mobil geprüft); bestehendes Branding/Name beibehalten.
- **Öffentliche Seiten:** Start, Entdecken (Suche, Filter, DB-Kategorien), Profile (Merken/Blockieren/Melden),
  Live-Seite mit Chat, **Preise & Münzen**, **Hilfe-Center**, **Kontakt**, Sicherheit, Recht (Entwürfe),
  Registrierung mit **DACH-Länderauswahl**, Login, Wartungsseite.
- **Zuschauer-Konto:** Guthaben, Sandbox-Kauf, Kaufhistorie, Favoriten, Altersprüfung (Mock), Sitzungen,
  Privatsphäre (Blockierliste, Datenexport, Löschprüfung), Benachrichtigungen, Sicherheit/2FA.
- **Creator-Studio:** Pflichterklärungen (versioniert, unveränderlich), Veröffentlichungs-Checkliste,
  Auszahlungskonto (IBAN Mod-97, verschlüsselt), Auszahlungsanträge, Live-Chat-Moderation, LiveKit-Kamera.
- **Finanzen:** Provision **75/25 admin-konfigurierbar** (Historie, Snapshot je Vorgang); Sandbox-Kasse mit
  **signierten Webhooks über eine echte HTTP-Route**; Betragsprüfung, Idempotenz, Erstattung/Chargeback mit
  Verlustbuchung; Kauflimits; **Trinkgelder**; **Auszahlungs-Workflow** (Reservierung, Haltefrist, Freigabe,
  Vier-Augen-Ausführung, Sandbox); Risikosignale; **Finanzbericht + CSV-Export**; Paketverwaltung.
- **Zahlungsanbieter:** Vergleich CCBill/Segpay/Verotel; **Verotel-FlexPay-Adapter** (gegen offizielles
  Signaturbeispiel getestet; Echtzahlung gesperrt).
- **Chat in Echtzeit** (SSE + PostgreSQL LISTEN/NOTIFY), Rate-Limits, Filter für Links/Kontaktdaten,
  Wiederholungssperre, Stummschalten, Blockieren, Melden, Löschen mit Begründung.
- **Streaming:** LiveKit-Adapter (raumgebundene Kurzzeit-Token, nur Creator senden, keine Aufzeichnung,
  Raum-Löschung bei Moderation, signierte Webhooks), CSP-Freigabe nur bei Konfiguration.
- **Compliance:** Altersprüfung für Zuschauer (je Land), Veröffentlichung nur mit Prüfung+Erklärungen+Freigabe,
  automatische **Beweissicherung** bei kritischen Meldungen, **Statement of Reasons** für alle Maßnahmen,
  Stream-Beenden durch Moderation, Datenschutzanfragen, Aufbewahrungsjob, Löschregeln.
- **Mitarbeiterbereich:** Rollen **Admin, Moderation, Support, Finanzen** (minimale Rechte, Pflicht-2FA),
  persönliche Einladungen, Einstellungen (Provision, Auszahlung, Kauflimits, Feature-Flags, Wartungsmodus,
  Länder/Altersprüfung, Streaming, Chat, Aufbewahrung, E-Mail), Kategorien, Live-Übersicht mit aktuellen Zuschauern.
- **E-Mails:** 17 Vorlagen (Text+HTML) inkl. Willkommen, Verifizierung, Reset, Bewerbung, Prüfstatus, Kauf,
  Erstattung, Auszahlung (Antrag/Abschluss/Ablehnung), Sicherheit, Support, Sperre, Einladung; Warteschlange mit
  Backoff; **SMTP-Adapter**; Abmeldung (RFC 8058) für optionale Kategorien; Absender nur aus `EMAIL_FROM`.
- **Jobs-Endpunkt** (`/api/jobs/run`, Bearer-geschützt), Dokumentation (Recht DACH, Anbieter, Streaming,
  Architektur/ADRs, Sicherheit, Tests, Deployment, Kosten, Marketing).

## B. Verbessert (gegenüber Stage 1)
- Webhooks waren nicht geroutet → echte Route; Test-Modus veröffentlichte ohne Prüfung → Regeln in allen Modi.
- Kontolöschung ignorierte Guthaben/Verfahren → Hinderungsgründe + Protokoll.
- Ein Admin-Rolle → vier Rollen; 30 % Env-Provision → 25 % Einstellung; Auszahlungen „nur Ansicht“ → Workflow.
- **Sicherheitsbefunde behoben:** Race-Condition bei parallelen Auszahlungsanträgen (Sperre + Unique-Index),
  Kauflimits unter Sperre, Next.js **16.4.2 → 16.4.5** (7 bekannte Lücken), Migrationslauf je Transaktion
  (frische Installation schlug fehl).

## C. Getestet
- **Unit + Integration: 185/185** (16 Dateien) · **E2E: 37/37** (Desktop + Mobil, Produktions-Build)
- Typecheck ✅ · Lint ✅ (0/0) · Build ✅ · `pnpm audit --prod` ✅ keine bekannten Lücken
- 22 Journeys: 17 vollständig automatisiert, 5 im Sandbox-/Mock-Modus (Details in [TESTING.md](TESTING.md)).

## D. Blockiert (externe Abhängigkeiten)
| Punkt | Grund |
|---|---|
| Echtzahlungen | Keine Anbieterfreigabe/kein Vertrag; im Code gesperrt |
| Echte Auszahlungen | Kein Auszahlungsanbieter, kein Creator-KYC/DAC7-Datenerhebung |
| Video Ende-zu-Ende | Kein LiveKit-Server (Start in dieser Umgebung unterbunden) |
| Echte Altersprüfung (Zuschauer/Creator) | Anbieter nicht ausgewählt (KJM-Positivbewertung nötig) |
| Produktiver E-Mail-Versand | Keine eigene Domain/kein SMTP-Dienst mit Adult-Erlaubnis |
| Rechtliche Freigaben | Anwaltliche/steuerliche Prüfung AT/DE/CH ausstehend |

## E. Sicherheit
Review-Tabelle in [SECURITY.md](SECURITY.md) (SQLi, XSS, CSRF, AuthN/Z, Uploads, Geheimnisse, Sitzungen,
Zahlungsmanipulation, Webhook-Spoofing, Rate-Limits, Kontoübernahme, Datenlecks, IDOR, Rechteausweitung).
Offen: externer Penetrationstest, WAF/DDoS, Captcha, 2FA-Wiederherstellungscodes.

## F. Recht
Siehe [LEGAL-DACH.md](LEGAL-DACH.md): bestätigte Anforderungen (JMStV-Altersverifikation, StGB-Grenzen,
DSA Art. 16/17, KoPl-G aufgehoben/KDD-G, Art. 9a MwSt-DVO, DAC7/DPMG, Mastercard-Adult-Regeln) vs. offene
Fragen (AMD-G/MStV-Einordnung, JSFVG-Anwendbarkeit, Widerrufsrecht, Steuerstruktur, Creator-Status).

## G. Deployment
[DEPLOYMENT.md](DEPLOYMENT.md): Migration, erstes Mitarbeiterkonto, Jobs, Webhooks, Backups, Monitoring.
Produktion startet nur ohne Testmodus/Sandbox/Mock und mit HTTPS.

## H. Umgebungsvariablen
Vollständige Liste (ohne Werte, mit Geheim-Kennzeichnung) in [DEPLOYMENT.md](DEPLOYMENT.md) und `.env.example`.

## I. Kosten
[COSTS.md](COSTS.md): 100 / 1.000 / 10.000 Nutzer – Fixkosten ca. 15–85 € / 100–300 € / 480–1.600 € pro Monat
plus nutzungsabhängig (Zahlungsgebühren, Altersprüfungen, Video-Traffic) und Personal (größter Block bei Wachstum).

## J. Startbereitschaft (ehrlich)
**Nicht startbereit für den Echtbetrieb.** Die Plattform ist im Testbetrieb funktional vollständig und getestet,
aber Echtgeld, echtes Video, echte Altersprüfung und produktiver Mailversand hängen an Anbieterfreigaben, und
die rechtliche Prüfung in AT/DE/CH steht aus. Nächste Schritte: Gründung → Rechts-/Steuerberatung →
Altersprüfungs- und Zahlungsanbieter (Freigabe) → LiveKit-Betrieb → Penetrationstest → Staging-Abnahme.
