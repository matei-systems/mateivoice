# Zahlungsanbieter: Vergleich, Integrationsstand, Go-Live-Checkliste

> **Stand:** Es besteht **kein Vertrag** und **keine Freigabe** eines Zahlungsanbieters. Echtzahlungen sind im
> Code gesperrt (`realCoinsEnabled() === false` in `src/server/ledger/service.ts`) – unabhängig von der
> Konfiguration. Wir haben **keinen** Anbieter kontaktiert und stellen das Geschäftsmodell gegenüber keinem
> Anbieter anders dar, als es ist.

## Vergleich (aus öffentlicher Dokumentation; Konditionen bitte direkt anfragen)

| Kriterium | CCBill | Segpay | Verotel (FlexPay) |
|---|---|---|---|
| Adult-Fokus | Ja (etabliert im Adult-Bereich) | Ja | Ja (EU-Sitz, NL) |
| Live-Cam / Tokens / Marktplatz mit Auszahlungen an Dritte | ⚖️ anfragen | ⚖️ anfragen | ⚖️ anfragen |
| Server-Benachrichtigungen | Webhooks (JSON/Form), Ereignisse z. B. `NewSaleSuccess` | Postbacks (Merchant Portal konfigurierbar) | Postbacks per GET, Antwort `OK` (200) binnen 30 s, sonst Auto-Erstattung bei Kartenzahlung |
| Herkunftsprüfung | Dokumentiert: **IP-Bereich** 64.38.212.1–254; keine Signatur dokumentiert gefunden | ⚖️ in Doku nicht eindeutig gefunden → IP-Filter/geheime URL + Abgleich | **SHA-256-Signatur** über Parameter mit Signaturschlüssel (offizielles Beispiel nachgerechnet ✅) |
| Erstattung per API | ⚖️ prüfen | ⚖️ prüfen | In der FlexPay-Doku keine Erstattungs-API gefunden (Gutschrift über Control Center; `credit`-Postback) |
| Chargeback-Benachrichtigung | ⚖️ prüfen (Ereignistypen) | ⚖️ prüfen | `chargeback`-Postback (sperrt Käufer) |
| Testmodus | ⚖️ prüfen | Testmodus im Merchant Portal (für NATS dokumentiert) | In der öffentlichen Doku nicht gefunden |
| Gebühren, Reserve, Auszahlungsrhythmus, Chargeback-Gebühren | ⚖️ **anfragen** | ⚖️ **anfragen** | ⚖️ **anfragen** |
| Länder/Währungen | ⚖️ | ⚖️ | EUR, USD, GBP, AUD, CAD, CHF, DKK, NOK, SEK (FlexPay) |

Wir nennen bewusst **keine Gebührensätze**: Öffentlich kursierende Zahlen stammen aus Sekundärquellen und sind
für Adult/High-Risk stark individuell (Reserve, Volumen, Chargeback-Quote).

**Fragen an jeden Anbieter (Onboarding):**
1. Freigabe für Live-Webcam mit virtueller Währung (Münzen), Trinkgeldern und **Auszahlungen an Creator**
   (Marktplatz)? Wer ist „Merchant of Record“? Benötigen wir Payout-Services des Anbieters?
2. Kartennetzwerk-Anforderungen (Mastercard AN 5196 / Visa) – welche Nachweise (Creator-KYC, Einwilligungen,
   Inhaltsprüfung, Beschwerdefristen) prüft der Acquirer?
3. Webhook-Sicherheit (Signatur, IP-Bereiche, Wiederholungen), Erstattungs-/Chargeback-Ereignisse.
4. Gebühren, Rolling Reserve, Auszahlungsfrequenz, Mindestumsatz, Chargeback-Gebühren und -Schwellen.
5. 3-D Secure/SCA, unterstützte Zahlarten (Karten, SEPA, Sofortüberweisung, Paysafecard …), Länder DACH.

## Implementierungsstand

| Baustein | Stand |
|---|---|
| Anbieter-Schnittstelle (`src/server/payments/provider.ts`) | ✅ Checkout-Erzeugung, Webhook-Prüfung/Normalisierung, Antwortformat, Erstattungsfähigkeit |
| Sandbox (`simulated`) | ✅ gehostete Kasse (`/checkout/sandbox/[id]`, signierter Link), signierte + zeitgestempelte Webhooks (`t=…,v1=HMAC`, 5 min Toleranz) per **HTTP** an `/api/webhooks/payments/simulated` |
| Verotel FlexPay v4 (`src/server/payments/verotel.ts`) | ✅ Start-URL, SHA-256-Signatur (gegen das **offizielle Beispiel** getestet), Postback-Prüfung, `purchase`/`credit`/`chargeback`, Shop-ID-Prüfung · 🔒 Checkout gesperrt (Echtzahlung) |
| CCBill, Segpay | ⏸ nicht implementiert (erst nach Auswahl; CCBill ohne dokumentierte Signatur → IP-Allowlist + Abgleich nötig) |
| Webhook-Route `/api/webhooks/payments/[provider]` | ✅ nur konfigurierter Anbieter, 64-KB-Limit, Signatur → 400, Fehler → 500 (Anbieter wiederholt) |
| Idempotenz | ✅ `(provider, eventId)` eindeutig; parallele Zustellungen → genau eine Gutschrift (getestet) |
| Betragsprüfung | ✅ Betrag + Währung müssen exakt der Bestellung entsprechen, sonst keine Gutschrift + Risikosignal |
| Gutschrift nie aus dem Frontend | ✅ Rückleitungsseite zeigt nur Status; Gutschrift ausschließlich im Webhook |
| Erstattung/Chargeback | ✅ Umkehr der Gutschrift; verbrauchte Münzen trägt die Plattform (Verlustbuchung), Risikosignal, Benachrichtigung |
| Kauflimits | ✅ Tag/30 Tage (Einstellung `payments`), unter Sperre geprüft |
| Abgleich | ✅ Ledger-Abgleich (Salden = Summe Buchungen) im Dashboard/Finanzbericht; 🟡 Abgleich mit Anbieter-Reports (Settlement-Dateien) erst mit echtem Anbieter |

## Go-Live-Checkliste (alle Punkte erforderlich)

- [ ] Schriftliche Freigabe des Anbieters für genau dieses Geschäftsmodell (inkl. Auszahlungen an Creator)
- [ ] Rechtliche Prüfung (AGB, Widerruf digitaler Leistungen, Preisangaben, Steuer/OSS) – [LEGAL-DACH.md](LEGAL-DACH.md)
- [ ] Integrationstest im Testmodus des Anbieters (Kauf, Ablehnung, Erstattung, Chargeback, Wiederholung)
- [ ] Webhook-Herkunft gemäß Anbieter abgesichert (Signatur bzw. IP-Allowlist)
- [ ] Abgleich gegen Settlement-Reports implementiert
- [ ] Bewusste Codeänderung `realCoinsEnabled()` mit Vier-Augen-Review; `TEST_MODE=false`, `APP_ENV=production`
- [ ] Monitoring/Alarmierung für Webhook-Fehler, Abgleichsabweichungen und Chargeback-Quote

## Quellen
- Verotel FlexPay „Create a purchase order“ (Signatur, Postbacks, Antwort „OK“): https://controlcenter.verotel.com/flexpay-doc/purchase.html
- Verotel Perl-Client (Referenz-Implementierung): https://metacpan.org/pod/Verotel::FlexPay
- CCBill Webhooks User Guide (IP-Bereich, Ereignisse): https://ccbill.com/doc/webhooks-user-guide
- Segpay Postbacks: https://gethelp.segpay.com/docs/Content/DeveloperDocs/ProcessingAPI/06-Postbacks.htm
- Mastercard (2021) zu Adult-Content-Anforderungen: https://www.mastercard.com/news/perspectives/2021/protecting-our-network-protecting-you-preventing-illegal-adult-content-on-our-network/
