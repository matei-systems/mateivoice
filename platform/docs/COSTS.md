# Kosten: Entwicklung, Betrieb, Skalierung

> **Schätzungen zur Planung**, keine Angebote. Es wurden **keine** kostenpflichtigen Dienste angelegt und keine
> Verträge geschlossen. Anbieterpreise (insb. Zahlung, Altersprüfung, Video-Cloud) bitte aktuell anfragen –
> Adult-Geschäftsmodelle werden häufig individuell bepreist.

## Bisherige Entwicklungskosten
Alle eingesetzten Bibliotheken sind Open Source (Next.js, React, Drizzle, Zod, Vitest, Playwright, nodemailer,
LiveKit SDKs, sharp …), Schriften lokal (OFL). Externe SaaS: keine. → **0 € Lizenzkosten.**

## Annahmen für die Hochrechnung
| Parameter | Annahme (anpassen!) |
|---|---|
| Aktiv pro Monat | 30 % der registrierten Nutzer |
| Sehzeit | 4 Stunden/Monat je aktivem Nutzer |
| Videobitrate | 1,5 Mbit/s (720p) ≈ 0,68 GB je Zuschauerstunde |
| Kaufquote / Umsatz | 20 % der Aktiven kaufen, Ø 20 € → Umsatz = U × 0,3 × 0,2 × 20 € |
| Zahlungsgebühren | **p** % vom Umsatz (beim Anbieter anfragen; Platzhalter in der Rechnung: 12 %) |
| Altersprüfung | **a** € je Prüfung (anfragen); einmal je aktivem Neukunden + jedem Creator |
| Creator | 2 % der registrierten Nutzer |

## Hochrechnung je Monat

| | 100 Nutzer | 1.000 Nutzer | 10.000 Nutzer |
|---|---|---|---|
| **Fixkosten** | | | |
| Server (App + DB) | 1 VPS: ca. 10–40 € | 2 VPS + Backups: ca. 50–150 € | App ×2, DB + Replikat, Lastverteiler: ca. 250–700 € |
| Video-Server (selbst gehostetes LiveKit) | im App-Server oder 1 kleiner VPS: 0–30 € | 1 dedizierter Server: ca. 40–120 € | 2–4 Server + TURN: ca. 200–800 € |
| Domain/DNS, Backups-Speicher, Monitoring | ca. 5–15 € | ca. 10–30 € | ca. 30–100 € |
| **Summe fix (ca.)** | **15–85 €** | **100–300 €** | **480–1.600 €** |
| **Nutzungsabhängig** | | | |
| Video-Traffic | 120 Std. ≈ 80 GB (meist im Inklusiv-Traffic) | 1.200 Std. ≈ 0,8 TB (oft inklusive) | 12.000 Std. ≈ 8 TB (Inklusiv-Traffic prüfen; Cloud-Egress kann mehrere hundert € kosten) |
| Zahlungsgebühren (p × Umsatz) | Umsatz ≈ 120 € → bei 12 %: ≈ 15 € | ≈ 1.200 € → ≈ 145 € | ≈ 12.000 € → ≈ 1.440 € |
| Altersprüfungen | ≈ 30 Prüfungen × a | ≈ 300 × a | ≈ 3.000 × a (im 1. Monat; danach nur Neukunden) |
| E-Mail (≈ 5 je Nutzer) | 500 Mails – meist Free-Tier | 5.000 Mails – meist Free-Tier | 50.000 Mails – niedriger zweistelliger €-Betrag |
| **Personal (Moderation/Support/Finanzen)** | nebenberuflich | Teilzeit nötig | mehrere Personen – **größter Kostenblock** |

Formel zum Selbstrechnen: `Gesamt = Fix + Traffic × €/GB + Umsatz × p + Prüfungen × a + Mails × €/Mail + Personal`.

## Einmalige Kosten vor dem Start (nicht im Budget von 500–1.500 € abbildbar, sobald Echtbetrieb)
- Rechts- und Steuerberatung AT/DE/CH (Gutachten, AGB, Creator-Vertrag, Datenschutz, OSS/DAC7) – **größter Posten**
- Gesellschaftsgründung, ggf. Jugendschutzbeauftragte/r, Penetrationstest
- Onboarding-/Einrichtungsgebühren, Rolling Reserve beim Zahlungsanbieter (bindet Liquidität)

## Empfehlung
1. Bis zur Anbieterfreigabe: ein VPS (App + DB + Sandbox), tägliche verschlüsselte Backups → < 50 €/Monat.
2. Budget primär für Rechts-/Steuerberatung und Anbieter-Onboarding einplanen.
3. Selbst gehostetes LiveKit hält variable Videokosten niedrig, erfordert aber Betriebs-Know-how.
4. Keine SaaS-Abos, solange Free-Tiers oder Eigenbetrieb genügen.
