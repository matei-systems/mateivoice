# Sicherheit & Datenschutz

Stand: Stage 2 (November 2026). Maßnahmen sind **implementiert und automatisiert getestet**, sofern nicht anders
markiert. Ein **externes Penetrationstest-/Sicherheitsaudit hat nicht stattgefunden** und ist vor dem Echtbetrieb
zwingend einzuplanen.

## Sicherheitsreview Stage 2 – Prüfpunkte und Ergebnis

| Prüfpunkt | Ergebnis / Maßnahme | Nachweis |
|---|---|---|
| SQL-Injection | Nur parametrisierte Abfragen (Drizzle, `sql`-Tag); LIKE maskiert; keine String-Konkatenation von Nutzereingaben | Code-Review, Integrationstests |
| XSS | React-Escaping; Chat/Tipps/Profile nur als Text; E-Mail-HTML maskiert alle Werte; CSP mit Nonce + `strict-dynamic` | Unit-Test E-Mail-Maskierung, E2E-Header-Test |
| CSRF | Server Actions mit Origin-Prüfung (Next.js); Cookies `SameSite=Lax`; zustandsändernde Routen nur Webhooks/Jobs mit eigener Authentifizierung | – |
| Authentifizierung | scrypt, 2FA (TOTP, Replay-Schutz), Pflicht-2FA für **alle** Mitarbeiterrollen, Einladung statt geteilter Zugänge | Integration + E2E |
| Autorisierung / IDOR | Jede Action prüft Berechtigung; Services prüfen Eigentum/Teilnahme (Bestellungen, Auszahlungen, Sitzungen, Chats, Tickets); fremde IDs → 404 | Integrationstests (Bestellung/Sandbox-Kasse fremder Nutzer, privater Chat, Trinkgeld fremde Sitzung) |
| Rechteausweitung | 6 Rollen nach minimalen Rechten; Mitarbeiter können nichts kaufen/tippen/chatten; eigene Rolle nicht änderbar; ≥ 1 aktiver Admin; Rollenwechsel beendet Sitzungen | Unit (Rollenmatrix), Integration, E2E (Moderation/Support-Grenzen) |
| Zahlungsmanipulation | Gutschrift nur nach signiertem Webhook; Betrag/Währung/Bestellung/Anbieter-Referenz geprüft; Idempotenz je Ereignis; Rückleitung schreibt nichts gut; Kauflimits unter Sperre | Integrationstests (Manipulation, Duplikate, Parallelität) |
| Webhook-Spoofing | Sandbox: HMAC über `Zeitstempel.Body`, 5 min Toleranz; Verotel: SHA-256-Signatur + Shop-ID; LiveKit: signiertes JWT mit Body-Hash; unbekannter Anbieter → 404; Risikosignal bei ungültiger Signatur (gedrosselt) | Unit + Integration + E2E |
| Doppelte Auszahlung / Race-Conditions | **Befund behoben:** parallele Auszahlungsanträge konnten die Prüfung außerhalb der Transaktion passieren → jetzt Prüfung unter Zeilensperre + Unique-Index „ein offener Antrag je Creator“; Kauflimits ebenso | Integrationstest mit 5 parallelen Anträgen |
| Rate-Limit-Umgehung | Limits in PostgreSQL (atomar, instanzübergreifend) für Login (IP+Konto), Registrierung, Reset, 2FA, Meldungen, Support, Uploads, Anfragen, Checkout, Trinkgeld, Chat (+ Mindestabstand), Auszahlung, Favoriten, Blockieren, Altersprüfung | Integrationstests |
| Kontoübernahme | Einheitliche Fehlermeldungen, Sicherheits-E-Mails (Passwort, 2FA an/aus, Auszahlungskonto geändert), Sitzungsinvalidierung | Integration |
| Datenlecks | Datenexport nur eigene Daten (IBAN maskiert); Admin-Listen maskiert; PII-Einsicht nur Support/Admin mit Begründung + Audit; E-Mail-Inhalte nach Versand gelöscht; Logs schwärzen sensible Felder | E2E-Export-Test |
| Datei-Uploads | Magic-Bytes, Größen-/Pixel-Limit, Neu-Kodierung (EXIF entfernt), privater Speicher, Moderation vor Veröffentlichung | Integration |
| Geheimnisse | Nur Umgebung/Secret-Manager; `.env` ignoriert; keine Geheimnisse in Logs/Doku; LiveKit-/Verotel-Schlüssel verlassen nie den Server | Code-Review, `git`-Prüfung vor Commits |
| Sitzungen | 256-Bit-Token, nur Hash in DB, `HttpOnly`/`Secure`/`__Host-`; Mitarbeiter 12 h | Integration |
| Abhängigkeiten | **Befund behoben:** Next.js 16.4.2 hatte 7 bekannte Lücken (mittel) → auf **16.4.5** aktualisiert; `pnpm audit --prod`: keine bekannten Lücken | `pnpm audit --prod` |
| Streaming-Schlüssel | Browser erhält nur kurzlebige, raumgebundene Token; keine Aufnahme-/Admin-Rechte | Unit (Token-Claims) |
| Missbrauch Chat | Filter für Links/Kontaktdaten (Abwerbung, Betrug, Grooming), Wiederholungssperre, Stummschalten, Blockieren, Melden, Löschen mit Begründung | Integration + E2E |

## Authentifizierung & Sitzungen
- Passwörter: scrypt (N=2¹⁵, r=8, p=3), Mindestlänge 12, Prüfung gegen häufige Passwörter und eigene Kennungen.
- Sitzungen: Cookie mit Zufallstoken, in der DB nur der SHA-256-Hash; Kunden/Creator 30 Tage, Mitarbeiter 12 h.
- 2FA (TOTP, RFC 6238): AES-256-GCM-verschlüsselt, Replay-Schutz; **Pflicht für alle Mitarbeiterrollen**.
- Mitarbeiterkonten nur per CLI (erstes Konto) oder persönlicher Einladung (Einmal-Link 72 h).

## Autorisierung (Rollen)
| Rolle | Rechte (Auszug) |
|---|---|
| Kunde | Streams/Chat/Trinkgeld/Kauf (bestätigte E-Mail + Altersprüfung), Favoriten, Blockieren, Meldungen |
| Creator | Studio, Preise, Live, Chat-Moderation im eigenen Raum, Einnahmen, Auszahlungen |
| Moderation | Profilprüfung, Meldungen, Maßnahmen, Chat-/Stream-Moderation, Beweissicherung |
| Support | Support-Tickets, Datenschutzanfragen, PII-Einsicht mit Begründung |
| Finanzen | Bestellungen, Erstattungen, Auszahlungen, Finanzberichte, Risikosignale, Pakete |
| Admin | alles inkl. Einstellungen, Kategorien, Mitarbeiter, Audit |

## Daten & Logs
- Datensparsamkeit (kein Klarname, IP als HMAC, keine Ausweis-/Kartendaten, keine Aufnahmen).
- IBAN AES-256-GCM-verschlüsselt, nur letzte 4 Stellen sichtbar; Entschlüsselung nur zur Auszahlung.
- Unveränderlich (DB-Trigger): Buchungen, Audit-Protokoll, Einstellungs-Historie, Creator-Erklärungen, Moderationsbegründungen.
- Aufbewahrungsjob löscht Chat/E-Mail-Protokoll/abgelaufene Sitzungen nach konfigurierbaren Fristen – außer bei Beweissicherung.

## Bekannte Grenzen / offene Punkte
- Kein externes Sicherheitsaudit, kein WAF/DDoS-Schutz (hosting-abhängig), kein Captcha (Honeypot + Limits).
- 2FA-Wiederherstellungscodes fehlen (Notfall-Reset nur über Betrieb, protokolliert).
- Client-IP aus `X-Forwarded-For`: Der Reverse Proxy muss den Header in Produktion setzen/überschreiben.
- Chat-Filter sind regelbasiert (keine KI-Moderation, keine Bild-/Video-Moderation in Echtzeit).
- Letzter-Admin-Schutz prüft ohne Sperre (theoretisches Race bei gleichzeitiger gegenseitiger Deaktivierung).
- Webcam-Inhalte können durch Gegenüber per Bildschirmaufnahme mitgeschnitten werden – technisch nicht verhinderbar, offen kommuniziert.
