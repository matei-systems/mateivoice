---
name: hook
description: Schreibt zu jedem GTA-6-Clip den ersten Satz bzw. Text-Overlay der ersten 1–3 Sekunden, der Zuschauer am Wegwischen hindert. Verwenden nach momente/untertitel oder wenn der Nutzer einen Hook, Einstieg oder Overlay-Text will.
---

# Hook: der erste Satz

## Input
`gta6/clips/<id>/words.json` (Transkript) + `info.json` + Beschreibung des Moments aus `momente`.

## Regeln
- **Max. 8 Wörter**, lesbar in < 2 s, Sprache = Zielgruppe (DE-Kanal → Deutsch)
- Spannung erzeugen, **Payoff nicht verraten**; der Clip muss halten, was der Hook verspricht (kein Clickbait-Betrug → schlechte Watchtime)
- Konkret statt generisch: "Er klaut den falschen Wagen…" statt "Krasser GTA-6-Moment"
- Keine Streamer-Beleidigungen, keine Spoiler, die die Kampagne verbietet

## Bewährte Muster
1. **Countdown/Erwartung**: "Wart auf die Polizei…"
2. **Widerspruch**: "Das sollte eigentlich ein leiser Raub werden"
3. **Frage**: "Wie hat er DAS überlebt?"
4. **Rekord/Erstes Mal**: "Erster 5-Sterne-Fahndungslevel in GTA 6"
5. **Reaktions-Teaser**: "Seine Reaktion am Ende 💀"
6. **Direkte Ansprache**: "Du hättest auch abgedrückt"

## Ausgabe
3 Varianten (verschiedene Muster) + Empfehlung mit 1 Satz Begründung. Gewählten Hook in `gta6/clips/<id>/info.json` als `"hook"` speichern und an `untertitel --hook "<text>"` übergeben.
Optional: ist im Clip ein starker gesprochener Satz in den ersten 2 s, Clip dort starten statt Overlay (der beste Hook ist oft der O-Ton).
