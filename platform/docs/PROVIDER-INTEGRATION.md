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
| E-Mail | `EmailAdapter` (`server/notifications/email.ts`) | `dev-outbox`, `disabled` | Adapter implementieren, `EMAIL_PROVIDER` erweitern, Abmeldelinks/Einwilligungen für Marketing beachten |
| Zahlung | `PaymentProvider` (`server/payments/provider.ts`) | `simulated` | `createCheckout`, `verifyWebhook` (Signatur!) implementieren, Webhook-Route anlegen, die `processPaymentEvent` nutzt (Idempotenz vorhanden); `realCoinsEnabled()` erst nach rechtlicher Klärung aktivieren |
| Auszahlung | `payouts` (`server/payouts/service.ts`) | nicht verfügbar | Anbieter-Adapter, KYC der Creator beim Anbieter, Buchungen `payout` aus `creator_earnings` → `system_payout_clearing` (nur `COIN`) |
| Video | `VideoProvider` (`server/video/provider.ts`) | `mock` | `createRoom`, `issueJoinToken` (kurzlebig, an Nutzer/Sitzung gebunden), `verifyJoinToken`, Anbieter-Webhooks auf `video_session_events` (Quelle `provider`, Idempotenz über `provider_event_id`) abbilden; Aufzeichnung deaktiviert lassen |
| Alters-/ID-Prüfung | `IdentityVerificationProvider` (`server/verification/service.ts`) | `mock` | Start + Webhook → Status `verified`/`rejected`; nur Status und Referenz speichern, keine Ausweisdaten |
| Speicher | `StorageAdapter` (`server/media/storage.ts`) | `local` | S3-kompatibler, privater Bucket; Auslieferung weiterhin über `/media/[id]` oder signierte, kurzlebige URLs |
| Captcha (optional) | – | Honeypot | datenschutzfreundlichen Anbieter wählen, CSP anpassen |

## Testanforderungen vor Aktivierung

- Integrationstests für Webhook-Signatur, Doppelzustellung, Reihenfolgevertauschung, Fehlerfälle
- E2E-Durchlauf in `staging` mit Anbieter-Sandbox
- Sicherheitsreview der Änderungen und Aktualisierung von `docs/SECURITY.md`
