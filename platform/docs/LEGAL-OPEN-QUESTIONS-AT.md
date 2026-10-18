# Rechtliche Vorbereitung Österreich – offene Fragen

> **Wichtig:** Diese Liste ist eine strukturierte Vorbereitung für die fachliche Beratung (Rechtsanwalt/-anwältin,
> Steuerberatung, ggf. Datenschutzberatung). Sie ist **keine Rechtsberatung** und enthält **keine Freigaben**.
> Genannte Gesetze/Regelwerke sind Prüfhinweise; Anwendbarkeit, Schwellenwerte und aktuelle Fassungen sind
> fachlich zu bestätigen.

Legende: **T** = technisch bereits vorbereitet · **R** = rechtlich/fachlich zu klären · **A** = abhängig von Anbieterfreigabe

## 1. Unternehmen & Gewerbe

| Frage | Status |
|---|---|
| Rechtsform (z. B. e.U. vs. GmbH) – Haftung, Kosten, Anforderungen von Zahlungsanbietern | R |
| Erforderliche Gewerbeberechtigung(en) für Plattformbetrieb und Vermittlung | R |
| Firmenbuch, UID-Nummer, Kammerzugehörigkeit | R |
| Impressum/Offenlegung (u. a. ECG, UGB, GewO, MedienG) – Struktur liegt als Entwurf vor (`/legal/imprint`) | T, R |

## 2. Zahlungen & Münzen

| Frage | Status |
|---|---|
| Rechtliche Einordnung der Münzen (Vorauszahlung, Gutschein, E-Geld?) und ggf. Ausnahmen (z. B. begrenzte Netze) | R |
| Ist die Weiterleitung von Erlösen an Creator ein erlaubnispflichtiger Zahlungsdienst? Modell „Merchant of Record“ über Anbieter? | R, A |
| Gültigkeit/Verfall von Münzen, Erstattung nicht verbrauchter Münzen bei Kündigung/Kontolöschung | R (technisch: Buchungsjournal vorbereitet) |
| Anforderungen der Kartennetzwerke an Adult-Content-Händler (z. B. Prüfung/Einwilligung der Creator, Inhaltsprüfung vor Veröffentlichung, Beschwerdeprozess) | A, R (technisch: Prüf-Workflow, Meldungen, Audit vorhanden) |
| Rückbuchungen nach verbrauchten Münzen: Verrechnung mit Creator-Einnahmen? | R (technisch: Klärungsfall wird markiert) |
| Preisangaben: Münzpreise in Euro inkl. USt. klar ausweisen (Preisauszeichnung) | R, T (Beispielpreise als „Beispiel“ markiert) |

## 3. Vertragsmodell

| Frage | Status |
|---|---|
| Plattform als Vermittler (Marktplatz) oder als Leistungserbringer gegenüber Kunden? Folgen für Haftung, Verbraucherrecht, USt. | R |
| Creator-Vertrag: Selbstständigkeit, Vergütung, Rechte an Inhalten, Einwilligungen, Kündigung, Sperren | R (Entwurf `/legal/creator-agreement`) |
| AGB für Kunden inkl. Haftung, Gerichtsstand, Streitbeilegung | R (Entwurf `/legal/terms`) |
| Bemessungsgrundlage der 30-%-Provision (brutto/netto, Zahlungsgebühren, USt.) | R (technisch: zentral konfigurierbar, je Buchung gespeichert) |

## 4. Datenschutz (DSGVO, DSG)

| Frage | Status |
|---|---|
| Rechtsgrundlagen je Verarbeitung, Speicherdauern, Löschkonzept | R (technisch: Export, Löschung/Anonymisierung vorhanden) |
| Können Daten Rückschlüsse auf das Sexualleben zulassen (besondere Kategorien, Art. 9 DSGVO)? Folgen für Einwilligung und Schutzmaßnahmen | R |
| Datenschutz-Folgenabschätzung (Art. 35) | R |
| Auftragsverarbeiter (Hosting, E-Mail, Zahlung, Video, ID-Prüfung), Drittlandübermittlungen | R, A |
| Aufbewahrungspflichten für Buchungsdaten vs. Löschwunsch | R (technisch: Buchungen pseudonymisiert erhalten) |
| Cookies: nur technisch notwendige Cookies im Prototyp (Sitzung, Altershinweis) – Bestätigung, dass kein Banner nötig ist | R |

## 5. Alters- und Identitätsprüfung, Jugendschutz

| Frage | Status |
|---|---|
| Welche Prüfung ist für **Creator** erforderlich (Alter, Identität, Einwilligung aller sichtbaren Personen)? | R, A (technisch: Schnittstelle + Freischaltlogik) |
| Ist für **Kunden** eine echte Altersverifikation erforderlich (statt Selbstauskunft)? Relevante Regelungen in AT; für spätere DE-Expansion insbesondere Jugendmedienschutz-Staatsvertrag | R (aktuell: Altershinweis + Selbstauskunft, klar gekennzeichnet) |
| Anforderungen aus EU-Recht zum Schutz Minderjähriger auf Online-Plattformen (u. a. DSA, Leitlinien der Kommission) | R |
| Kennzeichnung für Jugendschutzfilter | T (Meta „rating: adult“) |

## 6. Plattformpflichten (EU Digital Services Act u. a.)

| Frage | Status |
|---|---|
| Einstufung (Hosting-Dienst / Online-Plattform), Ausnahmen für Klein-/Kleinstunternehmen | R |
| Melde- und Abhilfeverfahren, Begründung von Entscheidungen, internes Beschwerdemanagement | T (Meldungen, begründete Entscheidungen, Einsprüche), R |
| Kontaktstellen für Behörden und Nutzer, Transparenzberichte | R |
| Meldung von Verdacht auf Straftaten (insb. Darstellungen Minderjähriger) an Behörden/Meldestellen (z. B. österreichische Meldestelle), Beweissicherung | R (technisch: kritische Priorität, Sperre, Audit) |
| Nachverfolgbarkeit gewerblicher Anbieter (Creator als Unternehmer?) | R, A |
| Nationale Plattform-Regelungen in AT (Anwendbarkeit/Schwellen prüfen) | R |

## 7. Verbraucherrecht

| Frage | Status |
|---|---|
| Informationspflichten vor Vertragsschluss, Bestellbutton-Gestaltung für Münzkäufe | R |
| Widerrufsrecht bei digitalen Dienstleistungen/Inhalten und dessen Erlöschen | R |
| Kündigung, Gewährleistung bei digitalen Leistungen | R |

## 8. Steuern & Meldepflichten

| Frage | Status |
|---|---|
| Umsatzsteuer bei elektronisch erbrachten Dienstleistungen an Verbraucher (Leistungsort, OSS) | R |
| Gilt die Plattform umsatzsteuerlich als Leistungserbringer für über sie erbrachte elektronische Leistungen der Creator? | R |
| Plattform-Meldepflichten zu Einkünften von Anbietern (EU-Richtlinie DAC7 und nationale Umsetzung) | R (technisch: Einnahmen je Creator buchhalterisch nachvollziehbar) |
| Steuerliche Pflichten der Creator; Informationspflichten der Plattform | R |

## 9. Anbieterfreigaben (vor jeder Integration)

Für **Zahlung, Auszahlung, Video, Alters-/ID-Prüfung, Hosting, E-Mail, Speicher**: aktuelle Nutzungsbedingungen (AUP) auf
Zulässigkeit von Adult-Content prüfen und **schriftliche** Freigabe für das konkrete Geschäftsmodell einholen. Siehe
[PROVIDER-INTEGRATION.md](PROVIDER-INTEGRATION.md).

## Technisch umgesetzt vs. rechtlich offen – Kurzfassung

- **Technisch umgesetzt:** Altershinweis, Selbstauskunft 18+, Zustimmungsnachweis mit Dokumentversion, Rollen/Rechte,
  Melden mit Priorisierung, begründete Moderation mit Einspruch, Audit-Protokoll, Datenexport, Kontolöschung,
  Datensparsamkeit, keine Aufnahmen, Testmodus-Sperre für Produktion, Provision zentral konfigurierbar.
- **Rechtlich offen:** alles in den Tabellen mit **R**. Vor Klärung darf die Plattform **nicht** in den Echtbetrieb gehen;
  die Konfigurationsprüfung verhindert dies technisch zusätzlich (keine echten Anbieter vorhanden).
