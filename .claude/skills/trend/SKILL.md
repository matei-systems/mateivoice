---
name: trend
description: Beobachtet laufende GTA-6-Streams live, erkennt Hype im Chat (Nachrichten-Spitzen, KEKW/OMG/"clip it") und meldet die Stelle mit Uhrzeit. Verwenden, wenn der Nutzer einen Stream überwachen oder "sag mir, wenn was passiert" will.
---

# Trend: Hype im Chat erkennen

## Voraussetzung
Nur Streamer mit Erlaubnis beobachten (`regel-check`, Liste in `gta6/daten/streamer.json`). Beobachten ist harmlos, aber wir sparen Zeit für Clips, die wir nicht posten dürfen.

## Start (Twitch, anonym, kein Login nötig)
```bash
python3 .claude/skills/trend/scripts/chat_watch.py <kanal>            # endlos
python3 .claude/skills/trend/scripts/chat_watch.py <kanal> --dauer-min 120
```
Im Hintergrund laufen lassen (Bash `run_in_background` oder Monitor-Tool) und neue `🔥 HYPE`-Zeilen dem Nutzer melden: Uhrzeit (in Europe/Berlin umrechnen), Stärke (Faktor), Chat-Beispiele.

Stellschrauben: `--faktor` (Standard 2.5× über Ø der letzten 5 min), `--min` (Mindestnachrichten pro 10 s; bei kleinen Kanälen 5–8, bei großen 40+).

## Was passiert mit den Meldungen
- Gespeichert in `gta6/daten/hype/<kanal>-<datum>.jsonl`
- Skill `momente` macht daraus Clip-Fenster (Chat reagiert ~5–20 s **nach** dem Ereignis)
- Melden im Format: `🔥 20:41:10 | xQc-artig 4.2x | "KEKW" "NO WAY" → momente?`

## Andere Plattformen
YouTube-Live/Kick: kein Skript enthalten. Alternativ nach dem Stream die Chat-Wiederholung oder die meistgesehenen Stellen ("Most replayed" auf YouTube) nutzen.

Hinweis: Netzwerk der Cloud-Umgebung kann Twitch-IRC (Port 6697) blockieren → dann auf dem eigenen PC starten.
