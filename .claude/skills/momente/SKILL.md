---
name: momente
description: Findet in einem GTA-6-Stream/VOD die stärksten 20–60 Sekunden für Shorts – aus Chat-Hype (Skill trend), Zuschauer-Hinweisen oder Transkript – und liefert eine Rangliste mit Start/Ende. Verwenden vor dem Schnitt oder wenn der Nutzer "finde die besten Stellen" sagt.
---

# Momente: die besten 20–60 Sekunden

## Quellen (in dieser Reihenfolge)
1. **Hype-Log** aus `trend`: 
   `python3 .claude/skills/momente/scripts/kandidaten.py gta6/daten/hype/<kanal>-<datum>.jsonl --stream-start <UTC-Start des VODs>`
   Den Stream-Start aus der VOD-Seite holen (`yt-dlp --print "%(release_timestamp)s %(timestamp)s" <vod-url>` oder Twitch-Seite).
2. **Twitch-Clips der Community**: oft geclippte Stellen = bewiesener Hype (Kanalseite → Clips → "Top 24h").
3. **YouTube "Meistgesehene Stelle"** bei VODs/Livestream-Archiven.
4. **Transkript-Suche**: Nach dem Schnitt eines größeren Abschnitts mit `untertitel` transkribieren und nach Ausrufen/Pointen suchen.

## Bewertung jedes Kandidaten (0–10, kurz begründen)
- **Sofort verständlich** ohne Kontext? (Verfolgungsjagd, Fail, Glitch, Wutausbruch, Lacher, Rekord)
- **Klarer Höhepunkt** in den letzten 30 % des Clips (Payoff)
- **Ton**: Streamer reagiert hörbar; keine geschützte Musik
- **Spoiler/Regeln** der Kampagne (siehe `regel-check`)

## Schnittgrenzen festlegen
- Start 1–3 s **vor** dem Auslöser (kein langes Intro), Ende 1–2 s nach der Reaktion
- Ziel: YouTube Shorts 20–45 s, TikTok-Monetarisierung > 60 s (dann längeren Kontext nehmen)
- Ausgabe als Tabelle: Rang | Start | Ende | Länge | Score | Was passiert | Hook-Idee
→ weiter mit `schnitt`.
