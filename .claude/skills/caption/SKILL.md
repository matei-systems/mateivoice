---
name: caption
description: Erstellt Titel, Beschreibungstext und Hashtags für einen GTA-6-Clip, getrennt für YouTube Shorts und TikTok, inklusive Pflicht-Credits und Kampagnen-Tags. Verwenden vor dem Upload.
---

# Caption: Titel, Text, Hashtags

## Input
`info.json` (Kanal, Hook, Erlaubnis), `words.json`, Kampagnenregeln aus `gta6/daten/kampagnen.json`.

## YouTube Shorts
- **Titel** ≤ 60 Zeichen, Keyword "GTA 6" vorn, Neugier statt Spoiler, max. 1 Emoji
- **Beschreibung**: 1 Satz Kontext · `🎮 Streamer: <Name> – <Kanal-URL>` · Kampagnen-Pflichttext · 3–5 Hashtags (`#gta6 #shorts #<streamer> …`)

## TikTok
- **Caption** ≤ 150 Zeichen: Hook-Satz + `@<streamer-tiktok>` (wenn vorhanden) + 3–6 Hashtags (`#gta6 #gta6clips #gaming #fyp`-Mix aus groß und nischig)
- Bei Clips > 60 s im Creator-Rewards-Programm: kein Hinweis auf andere Plattformen

## Pflicht
- **Credit an den Streamer in jedem Post** (Name + Link)
- Alle Pflicht-Hashtags/Erwähnungen der Kampagne exakt übernehmen; verbotene Tags weglassen
- Keine irreführenden Titel ("LEAK", "OFFIZIELL"), keine Rockstar-Logos/Markennamen als Kanalidentität
- Wenn die Plattform es verlangt: Hinweis "bearbeitete Inhalte"/"KI-generiert" (nur falls KI-Stimme/-Bild genutzt)

## Ausgabe
Codeblöcke zum Kopieren (YouTube-Titel, YouTube-Beschreibung, TikTok-Caption) und in `info.json` unter `"caption"` speichern. Danach: `regel-check` (Kampagnenregeln) → Upload durch den Nutzer → `tracker add`.
