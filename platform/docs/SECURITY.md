# Sicherheit & Datenschutz

Stand: Prototyp. Die folgenden Maßnahmen sind **implementiert und getestet**, sofern nicht anders markiert.
Ein externes Penetrationstest-/Sicherheitsaudit hat **nicht** stattgefunden und ist vor einem Echtbetrieb einzuplanen.

## Authentifizierung & Sitzungen

- Passwörter: scrypt (N=2¹⁵, r=8, p=3, 16-Byte-Salt, OWASP-Parameter), automatische Neuhashung bei Parameteränderung,
  Mindestlänge 12, Abgleich gegen triviale/häufige Passwörter und eigene Kennungen.
- Sitzungen: 256-Bit-Zufallstoken im Cookie (`HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-`-Präfix bei HTTPS); in der
  Datenbank nur der SHA-256-Hash. Laufzeit 30 Tage, Admins 12 Stunden. Passwortänderung/-reset beendet andere Sitzungen.
- 2FA (TOTP): AES-256-GCM-verschlüsselte Geheimnisse, ±1 Zeitschritt, atomarer Replay-Schutz. Für Admins verpflichtend
  (ohne bestätigte 2FA kein Zugriff auf `/admin` und keine `admin.*`-Aktion).
- Kontoaufzählung: identische Antworten bei Login-Fehlern, Registrierung bereits vorhandener E-Mails (Info-Mail an
  Inhaber) und Passwort-Reset; Timing-Angleichung bei unbekannten Konten.
- E-Mail-Bestätigung per POST (Link-Scanner lösen nichts aus); Token nur gehasht, einmalig, mit Ablauf.
- Keine öffentliche Admin-Registrierung; Admins nur per CLI (`pnpm admin:create`).

## Autorisierung

- Rollen `customer`, `creator`, `admin` mit Berechtigungsmatrix (`server/auth/permissions.ts`); gesperrte Konten dürfen
  nur Konto ansehen, Support kontaktieren und Einspruch einlegen; kritische Aktionen erfordern bestätigte E-Mail.
- Jede Server Action prüft serverseitig (`assertPermission`); Services prüfen zusätzlich Eigentum/Teilnahme (IDOR-Schutz):
  Sitzungen nur für Teilnehmer/Admins, Profile nur durch Eigentümer, Tickets nur für Inhaber, Medien nur öffentlich+frei
  oder für Eigentümer/Admins.
- Versteckte Buttons sind keine Zugriffskontrolle – alle Grenzen sind durch Integrations- und E2E-Tests abgedeckt.

## Web-Sicherheit (OWASP)

- **XSS:** React-Escaping, strikte CSP mit Nonce + `strict-dynamic` für Skripte, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`. Kompromiss: `style-src 'unsafe-inline'` (Inline-Styles für Platzhalter-Verläufe).
- **CSRF:** Server Actions prüfen Origin vs. Host (Next.js); Cookies `SameSite=Lax`; Export-Route ist rein lesend.
- **SQL-Injection:** ausschließlich parametrisierte Abfragen (Drizzle/`sql`-Tag); LIKE-Platzhalter werden maskiert.
- **Header:** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `COOP`, `Permissions-Policy`,
  HSTS bei HTTPS, `X-Powered-By` entfernt, `X-Robots-Tag: noindex` für private Bereiche.
- **Open Redirect:** `safeRedirectPath` erlaubt nur interne Pfade.
- **Uploads:** max. 5 MB, Typprüfung über Magic Bytes, Pixel-Limit, Neu-Kodierung als WebP (entfernt EXIF/GPS),
  Speicherung außerhalb `public/`, Auslieferung mit `nosniff` und restriktiver CSP; Pfad-Traversal ausgeschlossen.
- **Rate-Limits:** Login (IP + Konto), Registrierung, Reset, 2FA, Meldungen, Support, Uploads, Sitzungsanfragen.
- **Bots:** Honeypot-Felder. 🔌 Ein Captcha (z. B. datenschutzfreundliche Variante) ist vorbereitet, aber nicht angebunden.

## Daten & Logs

- Datensparsamkeit: kein Klarname, IP nur als HMAC-Pseudonym, keine Ausweisdaten, keine Kartendaten, keine Aufnahmen.
- Logger schwärzt sensible Felder (Passwort, Token, Cookie, E-Mail, Nachrichten u. a.); Fehler an Nutzer nur mit
  Referenz-ID, Details nur im Server-Log.
- Admin-Listen zeigen E-Mails maskiert; Volleinsicht nur mit Begründung und Audit-Eintrag.
- Unveränderliches Audit-Protokoll für alle Admin-Änderungen.
- Datenexport (JSON) und Kontolöschung (Anonymisierung) im Konto.

## Bekannte Grenzen / offene Punkte

- Kein externes Sicherheitsaudit; kein WAF/DDoS-Schutz (Hosting-abhängig).
- Altershinweis für Gäste ist eine Selbstauskunft (⚖️ rechtlich zu klären, ob Kunden-Altersverifikation nötig ist).
- Wiederherstellungscodes für 2FA fehlen; Notfall-Reset nur über Betrieb (dokumentiert, protokolliert).
- Abhängigkeits-Audit (Stand Prototyp): Produktionsabhängigkeiten ohne bekannte Schwachstellen; zwei Befunde nur in
  Entwicklungswerkzeugen (`braces` über ESLint-Plugin, altes `esbuild` über `drizzle-kit`) – nicht im Laufzeitpfad.
- Client-IP stammt aus `X-Forwarded-For`; in Produktion muss der Reverse Proxy diesen Header **setzen/überschreiben**.

## Minderjährige & rechtswidrige Inhalte

- Plattform ausschließlich 18+; Creator-Funktionen erst nach Alters-/Identitätsprüfung (Anbieter offen).
- Meldekategorien „Verdacht auf Minderjährige“, „Nicht einvernehmlich“, „Rechtswidrig“ → automatisch **kritisch**,
  sofortige Benachrichtigung aller Admins, Hervorhebung im Admin-Dashboard.
- Sperren beenden laufende Sitzungen und Anmeldungen sofort.
- ⚖️ Verbindlicher Prozess für Beweissicherung und Meldung an Behörden/Meldestellen muss rechtlich festgelegt werden.
