#!/usr/bin/env python3
"""Regel-Check: Exit 0 = erlaubt, Exit 1 = STOPP.
Aufruf: check.py --kanal <name> [--url <quelle>] [--plattform youtube|tiktok]
"""
import argparse, datetime, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
FREIGABEN = ROOT / "gta6" / "daten" / "freigaben.json"


def pruefe(kanal, url="", plattform=""):
    kanal = (kanal or "").strip().lower()
    if not kanal:
        return False, "Kein Quellkanal angegeben."
    try:
        daten = json.loads(FREIGABEN.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False, f"{FREIGABEN} fehlt."
    heute = datetime.date.today().isoformat()
    for e in daten.get("eintraege", []):
        if e.get("kanal", "").lower() != kanal:
            continue
        if e.get("typ") not in ("kampagne", "freigabe"):
            continue
        if not e.get("nachweis"):
            return False, f"Eintrag für '{kanal}' hat keinen Nachweis."
        if e.get("gueltig_bis") and e["gueltig_bis"] < heute:
            return False, f"Erlaubnis für '{kanal}' ist seit {e['gueltig_bis']} abgelaufen."
        erlaubt = [p.lower() for p in e.get("plattformen", [])]
        if plattform and erlaubt and plattform.lower() not in erlaubt:
            return False, f"'{kanal}' erlaubt nur {erlaubt}, nicht {plattform}."
        return True, f"OK: {e['typ']} '{e.get('kampagne_id') or e.get('nachweis')}' für '{kanal}'."
    return False, f"Keine Kampagne und keine Freigabe für '{kanal}'."


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanal", required=True)
    ap.add_argument("--url", default="")
    ap.add_argument("--plattform", default="")
    a = ap.parse_args()
    ok, grund = pruefe(a.kanal, a.url, a.plattform)
    print(("✅ " if ok else "⛔ STOPP: ") + grund)
    sys.exit(0 if ok else 1)
