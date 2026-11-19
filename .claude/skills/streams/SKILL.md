---
name: streams
description: Ermittelt große GTA-6-Streamer (Twitch, YouTube, Kick) und ihre typischen Live-Zeiten in deutscher Zeit, priorisiert nach Kampagne/Freigabe. Verwenden, wenn der Nutzer wissen will, wen er clippen soll oder wann jemand live ist.
---

# GTA-6-Streamer & Live-Zeiten

## Vorgehen
1. Per WebSearch aktuelle Top-GTA-6-Streamer finden (Ranglisten-Seiten wie Twitch-Kategorie-Statistiken, StreamsCharts/TwitchTracker-artige Seiten, News). DE und EN getrennt betrachten.
2. Pro Streamer Live-Zeiten aus dem öffentlichen Stream-Zeitplan (Twitch-Schedule, Kanalinfo) oder aus Statistikseiten (übliche Startzeit) übernehmen. In **Europe/Berlin** umrechnen.
3. Abgleich mit `gta6/daten/kampagnen.json` und `freigaben.json`: Streamer mit Kampagne/Freigabe zuerst.
4. Speichern in `gta6/daten/streamer.json`:
```json
{"kanal": "name", "plattform": "twitch", "url": "https://twitch.tv/name", "sprache": "de",
 "avg_zuschauer": 0, "live_zeiten": [{"tage": "Mo-Fr", "von": "19:00", "bis": "01:00"}],
 "erlaubnis": "kampagne|freigabe|keine", "quelle": "https://...", "geprueft_am": "JJJJ-MM-TT"}
```

## Ausgabe
- Tabelle: Streamer | Plattform | Ø Zuschauer | Live (DE-Zeit) | Erlaubnis
- Streamer mit `erlaubnis: keine` nur als "Freigabe anfragen" listen – **nicht clippen** (Skill `regel-check`).
- Hinweis: Zeiten sind Erfahrungswerte; aktuell live = Kanalseite prüfen oder Skill `trend` starten.
