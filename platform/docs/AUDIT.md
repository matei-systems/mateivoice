# Audit des Bestands (Stand vor Ausbaustufe 2)

Geprüft wurden Code, Schema, Tests und Dokumentation des Branches `claude/aurora-platform-foundation`
(≈ 15 300 Zeilen TypeScript, 28 Tabellen, 57 Routen, 126 Unit-/Integrations- und 24 E2E-Tests – alle grün beim
Wiederaufsetzen der Umgebung).

## 1. Funktioniert (durch Tests belegt)

- Registrierung, Login, E-Mail-Bestätigung (nur Dev-Outbox), Passwort-Reset, serverseitige Sitzungen, TOTP-2FA
  (Pflicht für Admins), Rate-Limits, Honeypot, Kontolöschung, Datenexport
- Rollen `customer` / `creator` / `admin` mit zentraler Berechtigungsmatrix und IDOR-Schutz
- Buchungsjournal (doppelte Buchführung, Idempotenz, Parallelitätsschutz, Trigger), Testguthaben, Abrechnung privater
  Chats pro Minute, Rückerstattung/Rückbuchung, Abgleich
- Mock-Video: Anfrage/Annahme/Beitritt/Ende, Verbindungsabbruch, öffentliche Streams (ohne Bild/Ton)
- Moderation (Meldungen mit Priorität, Sanktionen, Einsprüche), Support-Tickets, In-App-Benachrichtigungen
- Kunden-, Creator- und Adminbereich, öffentliche Seiten, Rechtstext-Entwürfe, SEO-Grundlagen, Sicherheitsheader/CSP

## 2. Teilweise umgesetzt

| Bereich | Lücke |
|---|---|
| Zahlungen | Kein HTTP-Webhook-Endpunkt; Kauf nur als Admin-Simulation; keine Kunden-Kaufstrecke (Sandbox) |
| Provision | 30 % per Umgebungsvariable statt **admin-konfigurierbar**; neue Vorgabe: 25 % Plattform / 75 % Model |
| Auszahlungen | Nur Ansicht; kein Antrag, keine Freigabe, keine Haltefrist/Mindestbetrag |
| Creator-Onboarding | Keine Einwilligungs-/Rechteerklärungen (Consent, Content-Rights); Verifizierung nur Mock |
| Veröffentlichung | Im Testmodus werden freigegebene Profile **auch ohne (Test-)Verifizierung** angezeigt |
| Zuschauer-Altersprüfung | Nur Altershinweis + Selbstauskunft – für Deutschland (geschlossene Benutzergruppe) nicht ausreichend |
| Admin | Nur eine allmächtige Rolle; keine Moderator-/Support-/Finanzrollen; Einstellungen nur lesbar; Pakete/Kategorien nicht pflegbar |
| E-Mail | Nur Text, nur Dev-Outbox; viele Pflicht-Benachrichtigungen fehlen; kein SMTP-Adapter; kein Abmeldelink |
| Streaming | Nur Mock; kein Anbieter-Adapter |
| Datenschutz | Export/Löschung vorhanden; keine Antrags-Protokollierung, keine Aufbewahrungsfristen-Jobs, kein Legal Hold |

## 3. Fehlt

Echtzeit-Chat, Blockieren, Favoriten, Help Center, Preis-/Credits-Erklärseite, Kontaktseite als eigene Seite,
Fraud-Signale, Finanzberichte, Mitarbeiterverwaltung, Wartungsmodus, Feature-Flags, Takedown-Workflow mit
Begründung, Landeszuordnung (DE/AT/CH) der Nutzer, Premium-Dark-Design.

## 4. Defekt / inkonsistent

- `handlePaymentWebhook` existiert, ist aber über keine Route erreichbar (Doku nennt einen Webhook-Pfad).
- Veröffentlichungsregel im Testmodus widerspricht „Profil erst nach allen Prüfungen veröffentlichen“.
- Kontolöschung berücksichtigt keine offenen Creator-Guthaben/Auszahlungen.

## 5. Sicherheitsbefunde

- Fehlendes Least-Privilege für Mitarbeiter (alle Admins dürfen alles).
- Kein Captcha (Honeypot + Rate-Limits vorhanden).
- `style-src 'unsafe-inline'` (bewusster Kompromiss, dokumentiert).
- IP-basierte Limits setzen einen korrekt konfigurierten Reverse Proxy voraus (dokumentiert).
- Keine Sicherheits-E-Mails bei neuen Anmeldungen/2FA-Änderungen.

## 6. Vor Produktion zwingend

Rechtsprüfung (AT/DE/CH), Unternehmensgründung, schriftliche Freigaben von Zahlungs-, Auszahlungs-, Verifizierungs-,
Hosting- und E-Mail-Anbietern, KJM-taugliche Altersverifikation für Zuschauer in Deutschland, echte Creator-KYC,
Penetrationstest, Betriebs-/Moderationsprozesse mit Personal.

## Umsetzungsplan dieser Stufe

1. Datenmodell erweitern (Einstellungen, Mitarbeiterrollen, Auszahlungen, Chat, Favoriten, Blockieren, Einwilligungen,
   Zuschauer-Altersprüfung, Risikosignale, Legal Hold, Datenschutzanträge, Land)
2. Finanzsystem: konfigurierbare Provision, Paketpflege, Sandbox-Kaufstrecke mit signierten Webhooks, Auszahlungs-Workflow,
   Erstattungen, Berichte, Fraud-Signale
3. Compliance-Workflows, Mitarbeiter-RBAC, Einstellungen/Wartung/Flags
4. Chat (SSE), Favoriten, Help Center, Preise
5. Premium-Dark-Design
6. LiveKit-Adapter, E-Mail-Templates + SMTP-Adapter
7. Tests aller Journeys, Security-Review, Dokumentation
