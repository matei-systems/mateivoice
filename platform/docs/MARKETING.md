# SEO- und Marketing-Strategie (DACH)

> Grundsätze: **keine** Fake-Profile, erfundenen Zuschauerzahlen, Bewertungen, Testimonials oder
> Verdienstversprechen; **kein** Spam, keine Doorway-/Spam-Seiten; Werbung nur auf Kanälen, die Adult-Inhalte
> ausdrücklich erlauben, und nur jugendschutzkonform (Werbung für pornografische Angebote unterliegt in DE
> zusätzlichen Beschränkungen, § 6 JMStV – ⚖️ prüfen). Es wurden **keine** Anzeigen geschaltet und keine externen
> Nachrichten versendet.

## Technische SEO (umgesetzt)
- Metadaten je Seite, Sitemap, `robots.txt`; private Bereiche `noindex` (Header + Metadaten)
- Creator-Profile **standardmäßig nicht indexiert** – nur mit ausdrücklicher Zustimmung des Creators
  (`allowSearchIndexing`) und nie für Testprofile
- Kennzeichnung für Jugendschutzfilter (RTA-Label im `<head>`)
- Schnelle Seiten (Server Components, lokale Schriften, keine Drittanbieter-Skripte)

## Inhalte, die ranken dürfen (ohne Adult-Inhalte im Snippet)
- Ratgeber: „Wie funktionieren Münzen?“, „Sicherheit für Creator“, „Altersprüfung erklärt“, Hilfe-Center
- Creator-Akquise: Seite „Für Creator“ mit ehrlichen Konditionen (75 % Anteil, Auszahlungsregeln), keine Verdienstbeispiele mit erfundenen Zahlen
- Transparenz: Sicherheit & Jugendschutz, Community-Richtlinien, Moderationsgrundsätze

## Kanäle
| Kanal | Eignung | Hinweise |
|---|---|---|
| Organische Suche (Ratgeber, Marke) | hoch | langfristig, jugendschutzkonforme Snippets |
| Adult-Werbenetzwerke / Traffic-Börsen | mittel | nur seriöse Netzwerke mit Brand-Safety; keine Pop-unders mit irreführenden Inhalten |
| Affiliate-Programm (Creator werben Kunden) | mittel | klare Kennzeichnung als Werbung, keine Spam-Methoden; Provision über das Ledger nachvollziehbar (nicht implementiert) |
| Creator-Social-Media (eigene Kanäle) | hoch | Creator teilen eigene Profile – Plattformrichtlinien der Netzwerke beachten |
| Branchen-Events/Verbände (B2B, Creator-Gewinnung) | mittel | |
| Google/Meta Ads | gering | Richtlinien untersagen bzw. beschränken Adult stark – nicht einplanen |

## Messung (datenschutzfreundlich)
- Keine Tracking-Cookies ohne Einwilligung; serverseitige, aggregierte Kennzahlen (Registrierungen, Käufe,
  Aktivierung Creator) sind bereits im Admin-Dashboard; Kampagnen über UTM-Parameter in Server-Logs auswerten
- Erfolgskennzahlen: Anteil verifizierter Kunden, Kaufquote, Creator-Aktivierung (Freigabe → erster Stream),
  Chargeback-Quote (< 0,5 % als Ziel, Kartennetzwerk-Schwellen beachten), Meldungsbearbeitungszeit (< 7 Werktage)
