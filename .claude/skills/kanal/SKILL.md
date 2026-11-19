---
name: kanal
description: Plant den YouTube-Kanal (und TikTok-Profil) für GTA-6-Clips – Name, Banner, Kanaltext, Upload-Plan – und verfolgt den Weg ins YouTube-Partnerprogramm bzw. TikTok-Creator-Programm. Verwenden bei Kanal-Setup, Branding, Upload-Rhythmus oder Fragen zur Monetarisierung/Fortschritt.
---

# Kanal planen & Partnerprogramm verfolgen

Ergebnis immer in `gta6/plan/kanal.md` speichern (überschreiben, Datum oben).

## 1. Name (5 Vorschläge)
- kurz, leicht auszusprechen, nicht nur "GTA6" (Rockstar-Marke nicht als alleinigen Namen nutzen → Verwechslungs-/Markenproblem)
- Muster: `<Wort> Clips`, `<Wort> Highlights`, `Vice<Wort>` (Fantasie-Wort, kein offizielles Logo)
- Verfügbarkeit des @Handles auf YouTube und TikTok per Websuche prüfen lassen

## 2. Banner & Profilbild
- Banner 2560×1440, Sicherheitszone 1546×423 in der Mitte; Text: Kanalname + "Tägliche GTA-6-Highlights"
- Kein offizielles Rockstar-Artwork verwenden; eigene Farben (Neon-Pink/Türkis passt zum Vice-City-Stil)
- Wenn der Canva-Connector verfügbar ist: Banner dort erstellen, sonst eine Bildbeschreibung liefern

## 3. Kanaltext (Über mich)
3–4 Sätze: was (beste GTA-6-Stream-Momente), wie oft, Credit-Hinweis ("Alle Clips mit Erlaubnis der Streamer / über offizielle Clipping-Kampagnen, Credit in jeder Beschreibung").

## 4. Upload-Plan
- Start: 2–3 Shorts pro Tag, gleiche Uhrzeiten (z. B. 12:00, 17:00, 20:30 Europe/Berlin), an Streamer-Livezeiten aus `gta6/daten/streamer.json` anpassen (Clip 1–3 h nach dem Moment posten)
- Gleichen Clip auf YouTube Shorts und TikTok, nur wenn die Kampagne beide erlaubt
- Wochenplan als Tabelle (Tag | Uhrzeit | Plattform | Quelle)

## 5. Monetarisierung verfolgen
Aktuelle Schwellen **jedes Mal per Websuche prüfen** (ändern sich). Stand der bekannten Regeln als Ausgangspunkt:
- **YouTube Partnerprogramm**: Stufe 1 (Fan-Funding) ca. 500 Abos + 3 Uploads/90 Tage + 3 Mio. Shorts-Aufrufe/90 Tage; volle Werbeeinnahmen ca. 1.000 Abos + 10 Mio. Shorts-Aufrufe/90 Tage. Achtung Richtlinie "wiederverwendete Inhalte": Clips brauchen eigene Bearbeitung (Schnitt, Untertitel, Hook) – sonst Ablehnung.
- **TikTok Creator Rewards**: ca. 10.000 Follower, 100.000 Aufrufe/30 Tage, Videos **über 1 Minute** werden vergütet → für TikTok-Kohle eher 60–70-s-Clips.
- **Clipping-Kampagnen** zahlen meist unabhängig davon pro 1.000 Aufrufe – das ist am Anfang die Haupteinnahme.

Fortschritt: Zahlen aus `python3 .claude/skills/tracker/scripts/tracker.py summary` plus vom Nutzer genannte Abo-/Followerzahlen in `kanal.md` unter "Fortschritt" eintragen (Datum | Abos | Shorts-Aufrufe 90 T | % bis Ziel | Prognose).
