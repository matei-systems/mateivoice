# Streaming (LiveKit) – Einrichtung, Sicherheit, Status

> **Status:** Adapter implementiert und mit Unit-Tests geprüft (Token-Rechte, Webhook-Signaturen).
> **BLOCKIERT:** Ein Ende-zu-Ende-Test mit einem echten LiveKit-Server war in der Entwicklungsumgebung nicht
> möglich (Download/Start eines Servers wurde von der Umgebung unterbunden). Der Videobetrieb ist daher
> **nicht** als produktionsbereit getestet.

## Warum LiveKit?
- Open Source (Apache 2.0), WebRTC-SFU, selbst hostbar → keine Abhängigkeit von Plattform-Nutzungsbedingungen,
  die Adult-Inhalte untersagen könnten (bei **LiveKit Cloud** oder anderen Hostern **vorher schriftlich prüfen**).
- Serverseitige Token mit feingranularen Rechten, Webhooks, Raumsteuerung (Beenden durch Moderation).

## Sicherheitsmodell (umgesetzt)
| Anforderung | Umsetzung |
|---|---|
| Keine privaten Schlüssel im Browser | `LIVEKIT_API_SECRET` nur serverseitig; Browser erhält **kurzlebiges** JWT (Standard 5 min) für **genau einen Raum** und **eine Identität** |
| Wer darf senden? | Nur Creator (`canPublish`); Zuschauer/Kunden empfangen nur; keine Datenkanäle (`canPublishData=false`) |
| Keine Aufzeichnung | Keine Recording-/Egress-Rechte (`roomRecord=false`, `recorder=false`); die App startet nie eine Aufnahme |
| Zugangskontrolle | Token nur nach serverseitiger Prüfung (Rolle, Altersprüfung, Blockierung, Sitzungsstatus, Zuschauerlimit) |
| Zuschauerlimit | `maxParticipants` je Raum aus Einstellung `streaming.maxViewersPerStream` + serverseitige Prüfung |
| Beenden durch Moderation | Raum wird serverseitig gelöscht (`deleteRoom`) → alle Verbindungen getrennt; Begründung an den Creator |
| Webhooks | `/api/webhooks/video/livekit`, Prüfung per `WebhookReceiver` (JWT mit SHA-256 des Inhalts); idempotent über Ereignis-ID; `room_finished` beendet laufende Sitzungen (keine weiteren Minuten) |
| Abrechnung | Unverändert serverseitig (Herzschläge + Zeitstempel); der Browser liefert keine Beträge |
| CSP | `connect-src` enthält den LiveKit-Ursprung nur, wenn `VIDEO_PROVIDER=livekit` gesetzt ist |

## Einrichtung (selbst gehostet, Kurzfassung)
1. LiveKit-Server auf eigener Infrastruktur (Hoster mit Adult-Erlaubnis!) mit TLS betreiben (`wss://`),
   TURN aktivieren (Mobilfunknetze), API-Key/Secret erzeugen.
2. Umgebung setzen: `VIDEO_PROVIDER=livekit`, `LIVEKIT_URL=wss://…`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   (Secret-Manager).
3. Webhook-URL in LiveKit konfigurieren: `https://<APP_URL>/api/webhooks/video/livekit`.
4. Testen (siehe unten), erst dann für Nutzer aktivieren.

## Offene Tests vor dem Echtbetrieb (BLOCKIERT in dieser Umgebung)
- Verbindungsaufbau Creator (Senden) und Zuschauer (Empfangen) über `livekit-client`
- Ablehnung manipulierter/abgelaufener Token, Zuschauerlimit, Moderations-Beenden
- Webhook-Zustellung echter Server-Ereignisse, Verhalten bei Netzabbrüchen, TURN
- Last-/Kostentest (Bandbreite je Zuschauer, Simulcast)

## Alternativen (nicht implementiert)
Verwaltete Dienste (z. B. Agora, AWS IVS, Mux) sind schnell integrierbar, verbieten aber teils Adult-Inhalte in
ihren Nutzungsbedingungen → vor einer Entscheidung **schriftlich** prüfen. Die Schnittstelle
`src/server/video/provider.ts` erlaubt einen Austausch ohne Änderung der Geschäftslogik.
