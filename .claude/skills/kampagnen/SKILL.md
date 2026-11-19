---
name: kampagnen
description: Sucht im Web aktive GTA-6-Clipping-Kampagnen (bezahltes Clippen pro 1.000 Aufrufe) und speichert Rate, Regeln, Plattformen und Einreichweg. Verwenden, wenn der Nutzer Geld-Kampagnen, Clipping-Jobs, CPM-Raten oder neue Quellen sucht.
---

# Clipping-Kampagnen finden

## Suchen (WebSearch, mehrere Abfragen parallel)
- "GTA 6 clipping campaign", "GTA 6 clippers wanted", "<Streamername> clipping program"
- Plattformen für Content-Rewards/Clipping-Programme (z. B. Whop Content Rewards, Vyro, ClipFarm u. ä. – aktuelle Anbieter per Suche ermitteln, nicht raten)
- Discord-/X-Posts von Streamern: "paying clippers", "clip my streams"
Nur echte, aktuelle Seiten übernehmen. Nichts erfinden: fehlt eine Angabe, `null` eintragen.

## Für jede Kampagne erfassen (`gta6/daten/kampagnen.json` → `kampagnen[]`)
```json
{"id": "kurz-eindeutig", "name": "...", "streamer": ["kanalname"], "anbieter": "...",
 "url": "https://...", "rate_pro_1000": 1.0, "waehrung": "USD",
 "budget_rest": null, "min_aufrufe_auszahlung": null, "max_pro_clip": null,
 "plattformen": ["youtube_shorts","tiktok"], "laenge_s": [15, 60],
 "pflicht": ["#tag", "@streamer im Text"], "verboten": ["..."],
 "einreichen": "Link im Portal", "geprueft_am": "JJJJ-MM-TT"}
```

## Danach
1. Tabelle zeigen, sortiert nach Rate × realistische Reichweite. Warnsignale markieren: Vorabgebühr, kein Impressum, Auszahlung nur in Krypto, unrealistisch hohe Raten → **nicht empfehlen**.
2. Für jede Kampagne, der der Nutzer beitreten will: Eintrag in `gta6/daten/freigaben.json` mit `typ: "kampagne"` anlegen (siehe Skill `regel-check`) – erst **nachdem** der Nutzer bestätigt, dass er angenommen wurde.
3. Abgelaufene Kampagnen (Budget leer, Frist vorbei) auf `"status": "beendet"` setzen.
