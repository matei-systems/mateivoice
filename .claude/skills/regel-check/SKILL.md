---
name: regel-check
description: Prüft vor jedem Download, Schnitt oder Upload, ob für den Quellkanal eine Clipping-Kampagne oder eine schriftliche Freigabe vorliegt. Ohne Erlaubnis Stopp. Immer vor schnitt und vor jedem Upload verwenden, und wenn der Nutzer fragt "darf ich das clippen?".
---

# Regel-Check (Gatekeeper)

**Grundregel: Ohne Erlaubnis kein Clip. Keine Ausnahmen, auch nicht "nur zum Testen".**

## Erlaubt ist ein Clip nur, wenn eines zutrifft
1. **Kampagne**: Der Streamer hat eine aktive Clipping-Kampagne (Eintrag aus Skill `kampagnen`), und der Clip hält deren Regeln ein.
2. **Freigabe**: Schriftliche Erlaubnis des Rechteinhabers (DM, E-Mail, Discord). Den Nachweis als Link oder Screenshot-Pfad ablegen.

## Ablauf
1. Ausführen: `python3 .claude/skills/regel-check/scripts/check.py --kanal <name> --plattform youtube|tiktok`
2. Bei `⛔ STOPP`: abbrechen und dem Nutzer sagen, was fehlt. Vorschlag: Kampagne suchen (`kampagnen`) oder Freigabe-Nachricht entwerfen (siehe unten).
3. Bei `✅`: zusätzlich die **Kampagnenregeln** aus `gta6/daten/kampagnen.json` gegen den Clip prüfen:
   - Pflicht-Tags/Hashtags/Erwähnung (@streamer), Mindest- und Maximallänge, erlaubte Plattformen
   - verbotene Inhalte (z. B. kein Wasserzeichen anderer Clipper, keine Reuploads ganzer Streams)
   - Einreichfrist und Einreichweg (Link im Kampagnenportal)
4. Allgemeine Checks, egal welche Erlaubnis:
   - Keine urheberrechtlich geschützte Musik im Clip (Stream-Musik → Ton prüfen; im Zweifel abmischen oder anderen Moment nehmen)
   - Keine Story-Spoiler, wenn die Kampagne sie verbietet; Rockstar-Inhalte nur als Gameplay mit Streamer-Kommentar, keine reinen Cutscene-Reuploads
   - Keine privaten Daten (Chat-Namen mit Klarnamen, Adressen, Telefonnummern)
   - KI-/Bearbeitungshinweis setzen, wenn die Plattform das verlangt

## Freigabe eintragen (`gta6/daten/freigaben.json`)
```json
{"typ": "freigabe", "kanal": "streamername", "plattformen": ["youtube","tiktok"],
 "nachweis": "gta6/plan/nachweise/streamername-2026-11-19.png", "gueltig_bis": null, "kampagne_id": null}
```
Bei Kampagnen: `"typ": "kampagne"`, `"kampagne_id"` = ID aus kampagnen.json, `"nachweis"` = Kampagnen-URL.

## Vorlage Freigabe-Anfrage (kurz, freundlich)
> Hi <Name>, ich schneide GTA-6-Highlights als Shorts/TikToks (9:16, mit Untertiteln, Credit + Link zu deinem Kanal in jedem Video). Darf ich Clips aus deinen Streams posten und monetarisieren? Wenn du lieber Bedingungen hast (Umsatzbeteiligung, bestimmte Hashtags), sag gern Bescheid.
