---
name: schnitt
description: Lädt einen erlaubten GTA-6-Stream-Abschnitt mit yt-dlp und schneidet ihn mit ffmpeg auf 9:16 (1080x1920) für YouTube Shorts/TikTok. Verwenden, sobald ein Moment (Start/Ende) feststeht. Führt automatisch den Regel-Check aus.
---

# Schnitt: laden & 9:16

## Befehl
```bash
python3 .claude/skills/schnitt/scripts/schnitt.py --kanal <streamer> --url <vod-url> \
  --start 01:23:10 --ende 01:23:52 --layout blur
```
- `--layout blur` (Standard): ganzes Gameplay mittig, unscharfer Hintergrund – oben/unten Platz für Hook & Untertitel
- `--layout crop`: Bildmitte, maximal groß (gut bei Action in der Bildmitte)
- `--layout facecam`: Facecam oben (nimmt an: Cam oben links, ¼ Bild), Gameplay unten – Position bei Bedarf im Skript anpassen
- `--datei roh.mp4` statt `--url` für schon heruntergeladene Dateien

Ergebnis: `gta6/clips/<clip_id>/clip.mp4` + `info.json` (Quelle, Zeiten, Erlaubnis). Ton wird auf −14 LUFS normalisiert.

## Regeln
- Bricht bei fehlender Erlaubnis mit `⛔ STOPP` ab → **nicht umgehen**, sondern `regel-check`/`kampagnen` nutzen.
- Nur Abschnitte laden, keine ganzen VODs (spart Zeit und ist meist Kampagnenregel).
- Fehlt yt-dlp: Nutzer um OK zum Installieren fragen (`pip install -r gta6/requirements.txt`).

Weiter mit `untertitel` → `hook` → `caption`.
