---
name: untertitel
description: Erstellt Wort-für-Wort-Untertitel (Karaoke-Stil, groß, mittig) mit faster-whisper und brennt sie samt Hook-Text per ffmpeg in den 9:16-Clip ein. Verwenden nach dem Schnitt oder wenn ein Clip Untertitel braucht.
---

# Untertitel: Wort für Wort

## Befehl
```bash
python3 .claude/skills/untertitel/scripts/untertitel.py gta6/clips/<id>/clip.mp4 --sprache de --hook "<Satz aus hook>"
```
- Modell: `small` (Standard, guter Kompromiss auf CPU). Bei Englisch/Slang besser `medium`; auf schwachem PC `base`.
- `--sprache` setzen, wenn bekannt (stabiler als Auto-Erkennung).
- Ergebnis: `words.json` (Transkript mit Zeiten), `untertitel.ass`, `final.mp4`.

## Korrigieren (wichtig für Qualität)
1. `words.json` lesen; Namen, GTA-Begriffe (Vice City, Lucia, Jason, Leonida …) und Streamer-Slang korrigieren, falsch erkannte Wörter fixen. Beleidigungen/Slurs entfernen oder durch `***` ersetzen.
2. Skript erneut starten – es nutzt die vorhandene `words.json` und transkribiert nicht neu.

## Stil
- Ein Wort gleichzeitig, GROSS, weiß mit schwarzem Rand, kurzer Pop-Effekt, im unteren Drittel über der Plattform-UI
- Hook-Box oben in den ersten 3 s (Text aus Skill `hook`)
- Stil anpassen: Zeile `Style: Wort,...` im Skript (Schriftgröße 96, MarginV 560)

Fehlt faster-whisper → Nutzer um OK für `pip install -r gta6/requirements.txt` fragen. Der erste Lauf lädt das Modell (~500 MB bei `small`).
