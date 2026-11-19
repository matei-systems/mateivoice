# GTA-6-Clip-Pipeline (YouTube Shorts & TikTok)

Ziel: Erlaubte GTA-6-Stream-Momente als 9:16-Clips posten und über Clipping-Kampagnen (Rate pro 1.000 Aufrufe) sowie YouTube-/TikTok-Programme Geld verdienen.

## Goldene Regeln
1. **Kein Clip ohne Erlaubnis.** `regel-check` vor jedem Schnitt und jedem Upload. `⛔ STOPP` nie umgehen.
2. **Nichts installieren ohne OK des Nutzers** (`pip install -r gta6/requirements.txt`: yt-dlp, faster-whisper; ffmpeg ist Voraussetzung).
3. Keine Fakten erfinden (Raten, Live-Zeiten, Schwellen) – per Websuche prüfen, sonst `null`.
4. Jeden Schritt dem Nutzer in 1–2 Sätzen erklären, auf Deutsch.
5. Credit an den Streamer in jedem Post.

## Ablauf (Skills in `.claude/skills/`)
```
EINMALIG / WÖCHENTLICH
  kanal       → Name, Banner, Text, Upload-Plan, Fortschritt Partnerprogramm   → gta6/plan/kanal.md
  kampagnen   → bezahlte GTA-6-Clipping-Kampagnen + Regeln                      → gta6/daten/kampagnen.json
  streams     → große GTA-6-Streamer + Live-Zeiten (DE-Zeit)                    → gta6/daten/streamer.json
  regel-check → Kampagne/Freigabe eintragen                                     → gta6/daten/freigaben.json

PRO STREAM
  trend       → Chat live beobachten, Hype melden                               → gta6/daten/hype/*.jsonl
  momente     → beste 20–60 s als Rangliste (Start/Ende)

PRO CLIP
  regel-check → erlaubt? sonst STOPP
  schnitt     → yt-dlp + ffmpeg → 9:16                                         → gta6/clips/<id>/clip.mp4
  hook        → erster Satz / Overlay (3 Varianten)
  untertitel  → faster-whisper, Wort für Wort + Hook einbrennen                → gta6/clips/<id>/final.mp4
  caption     → Titel, Text, Hashtags (YT + TikTok), Kampagnen-Pflichtangaben
  regel-check → Kampagnenregeln final prüfen → Nutzer lädt hoch
  tracker add → Upload eintragen; später tracker update (Aufrufe/Einnahmen)  → gta6/daten/tracker.csv
```

## Daten
| Datei | Inhalt |
|---|---|
| `gta6/daten/freigaben.json` | Erlaubnisse (Kampagne/Freigabe + Nachweis) – Grundlage des Regel-Checks |
| `gta6/daten/kampagnen.json` | Kampagnen mit Rate, Regeln, Plattformen |
| `gta6/daten/streamer.json` | Streamer, Live-Zeiten, Erlaubnisstatus |
| `gta6/daten/tracker.csv` | Uploads, Aufrufe, Einnahmen |
| `gta6/clips/<id>/` | roh.mp4, clip.mp4, words.json, untertitel.ass, final.mp4, info.json (nicht im Git) |

## Schnellbefehle
```bash
python3 .claude/skills/regel-check/scripts/check.py --kanal <streamer>
python3 .claude/skills/trend/scripts/chat_watch.py <streamer>
python3 .claude/skills/momente/scripts/kandidaten.py gta6/daten/hype/<datei>.jsonl --stream-start <UTC>
python3 .claude/skills/schnitt/scripts/schnitt.py --kanal <streamer> --url <vod> --start 01:02:03 --ende 01:02:40
python3 .claude/skills/untertitel/scripts/untertitel.py gta6/clips/<id>/clip.mp4 --sprache de --hook "..."
python3 .claude/skills/tracker/scripts/tracker.py summary
```
Uploads macht der Nutzer selbst (kein automatisches Posten).
