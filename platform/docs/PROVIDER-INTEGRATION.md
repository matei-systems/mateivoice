# Integration externer Anbieter

Grundregel: **Keine Integration ohne geprüfte aktuelle Nutzungsbedingungen und schriftliche Freigabe für das konkrete
Adult-Geschäftsmodell.** Bis dahin laufen Mock/Simulation; `src/config/env.ts` verhindert Produktion mit Mock-Anbietern.

## Checkliste je Anbieter

1. Zweck, Datenflüsse, Datenstandort, Auftragsverarbeitungsvertrag
2. Acceptable-Use-Policy zu Adult-Content geprüft → schriftliche Freigabe vorhanden (Ablage im Projektordner)
3. Kosten: Fix, nutzungsabhängig, Skalierung (siehe [COSTS.md](COSTS.md))
4. Sicherheit: Webhook-Signaturen, Schlüsselverwaltung, Rotation
5. Umsetzung hinter der vorhandenen Schnittstelle + Tests + Doku-Update

## Schnittstellen

| Anbieter | Schnittstelle | Aktuell | Umsetzungsschritte |
|---|---|---|---|
| E-Mail | `server/email/service.ts` (Warteschlange) | `dev-outbox`, `smtp` (implementiert, gegen lokalen Testempfänger getestet), `disabled` | SMTP-Dienst mit Adult-Erlaubnis wählen, eigene Domain (SPF/DKIM/DMARC), `EMAIL_FROM` setzen |
| Zahlung | `PaymentProvider` (`server/payments/provider.ts`) | `simulated` (Sandbox), `verotel` (Adapter, Checkout gesperrt) | Freigabe einholen, Testmodus des Anbieters durchspielen, Settlement-Abgleich, dann `realCoinsEnabled()` bewusst freischalten – siehe [PAYMENT-PROVIDERS.md](PAYMENT-PROVIDERS.md) |
| Auszahlung | `payouts` (`server/payouts/service.ts`) | `sandbox` (Workflow vollständig) | Anbieter-Adapter für Ausführung (SEPA-Batch/API), KYC/DAC7-Daten der Creator |
| Video | `VideoProvider` (`server/video/provider.ts`) | `mock`, `livekit` (Adapter + Webhooks implementiert) | LiveKit-Server betreiben (Hoster mit Adult-Erlaubnis), E2E-Test – siehe [STREAMING.md](STREAMING.md) |
| Alters-/ID-Prüfung | `IdentityVerificationProvider` (`server/verification/service.ts`) | `mock` | Start + Webhook → Status `verified`/`rejected`; nur Status und Referenz speichern, keine Ausweisdaten |
| Speicher | `StorageAdapter` (`server/media/storage.ts`) | `local` | S3-kompatibler, privater Bucket; Auslieferung weiterhin über `/media/[id]` oder signierte, kurzlebige URLs |
| Captcha (optional) | – | Honeypot | datenschutzfreundlichen Anbieter wählen, CSP anpassen |

## Testanforderungen vor Aktivierung

- Integrationstests für Webhook-Signatur, Doppelzustellung, Reihenfolgevertauschung, Fehlerfälle
- E2E-Durchlauf in `staging` mit Anbieter-Sandbox
- Sicherheitsreview der Änderungen und Aktualisierung von `docs/SECURITY.md`
