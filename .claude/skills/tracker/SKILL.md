---
name: tracker
description: Führt die Tabelle aller Uploads mit Aufrufen und Einnahmen (gta6/daten/tracker.csv), berechnet Einnahmen aus Kampagnenrate pro 1.000 Aufrufe und zeigt, welche Streamer/Clips am meisten bringen. Verwenden nach jedem Upload, beim Aktualisieren von Zahlen oder bei "wie viel habe ich verdient?".
---

# Tracker: Uploads, Aufrufe, Einnahmen

## Befehle
```bash
T=.claude/skills/tracker/scripts/tracker.py
python3 $T add --clip <id> --plattform youtube --url <link> --titel "..." --kampagne <kampagnen-id> --rate 0.90
python3 $T update --clip <id> --plattform youtube --aufrufe 48210        # Einnahmen = Aufrufe/1000 × Rate
python3 $T update --clip <id> --plattform tiktok --einnahmen 4.10 --status ausgezahlt
python3 $T summary
```
- Plattform-Werte: `youtube`, `tiktok`
- Rate in **EUR** eintragen (USD-Raten mit aktuellem Kurs umrechnen und Kurs in `--notiz` vermerken)
- Status: `online` → `eingereicht` (bei Kampagne) → `ausgezahlt` / `abgelehnt`

## Routine
- Täglich: Aufrufe der letzten 7 Tage aktualisieren (Nutzer nennt Zahlen oder kopiert sie aus YouTube Studio / TikTok Analytics)
- Wöchentlich: `summary` auswerten → Welche Streamer, Hooks, Längen bringen am meisten? Empfehlung an `streams`/`hook` zurückgeben und Fortschritt in `kanal` eintragen
- Die CSV lässt sich in Excel/Google Sheets öffnen
