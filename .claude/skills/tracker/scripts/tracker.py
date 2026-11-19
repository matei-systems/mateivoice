#!/usr/bin/env python3
"""Tracker für Uploads, Aufrufe, Einnahmen (gta6/daten/tracker.csv).
  tracker.py add --clip <id> --plattform youtube --url <link> --titel "..." [--kampagne <id>] [--rate 1.0]
  tracker.py update --clip <id> --plattform youtube --aufrufe 12345 [--einnahmen 3.2] [--status ausgezahlt]
  tracker.py summary
"""
import argparse, csv, datetime, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
CSV = ROOT / "gta6" / "daten" / "tracker.csv"
FELDER = ["clip_id", "datum", "quelle_kanal", "kampagne_id", "plattform", "url", "titel", "aufrufe",
          "rate_pro_1000_eur", "einnahmen_eur", "status", "notiz"]


def lesen():
    with CSV.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def schreiben(zeilen):
    with CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FELDER)
        w.writeheader()
        w.writerows(zeilen)


def zahl(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("add")
    p.add_argument("--clip", required=True); p.add_argument("--plattform", required=True)
    p.add_argument("--url", default=""); p.add_argument("--titel", default="")
    p.add_argument("--kanal", default=""); p.add_argument("--kampagne", default="")
    p.add_argument("--rate", type=float, default=None, help="Rate pro 1.000 Aufrufe in EUR")
    u = sub.add_parser("update")
    u.add_argument("--clip", required=True); u.add_argument("--plattform", required=True)
    u.add_argument("--aufrufe", type=int); u.add_argument("--einnahmen", type=float)
    u.add_argument("--status"); u.add_argument("--notiz")
    sub.add_parser("summary")
    a = ap.parse_args()
    zeilen = lesen()

    if a.cmd == "add":
        info_p = ROOT / "gta6" / "clips" / a.clip / "info.json"
        info = json.loads(info_p.read_text(encoding="utf-8")) if info_p.exists() else {}
        if any(z["clip_id"] == a.clip and z["plattform"] == a.plattform for z in zeilen):
            sys.exit("Eintrag existiert schon → update benutzen.")
        zeilen.append({"clip_id": a.clip, "datum": datetime.date.today().isoformat(),
                       "quelle_kanal": a.kanal or info.get("kanal", ""), "kampagne_id": a.kampagne,
                       "plattform": a.plattform, "url": a.url, "titel": a.titel, "aufrufe": 0,
                       "rate_pro_1000_eur": "" if a.rate is None else a.rate, "einnahmen_eur": 0,
                       "status": "online", "notiz": ""})
    elif a.cmd == "update":
        treffer = [z for z in zeilen if z["clip_id"] == a.clip and z["plattform"] == a.plattform]
        if not treffer:
            sys.exit("Kein Eintrag gefunden.")
        z = treffer[0]
        if a.aufrufe is not None:
            z["aufrufe"] = a.aufrufe
            if a.einnahmen is None and z["rate_pro_1000_eur"] not in ("", None):
                z["einnahmen_eur"] = round(a.aufrufe / 1000 * zahl(z["rate_pro_1000_eur"]), 2)
        if a.einnahmen is not None:
            z["einnahmen_eur"] = a.einnahmen
        if a.status:
            z["status"] = a.status
        if a.notiz:
            z["notiz"] = a.notiz
    if a.cmd in ("add", "update"):
        schreiben(zeilen)
        print("✅ gespeichert")

    # Zusammenfassung immer ausgeben
    heute = datetime.date.today()
    def summe(f, tage=None):
        return sum(zahl(z[f]) for z in zeilen
                   if tage is None or (heute - datetime.date.fromisoformat(z["datum"])).days < tage)
    print(f"Uploads: {len(zeilen)} | Aufrufe gesamt: {int(summe('aufrufe')):,} | "
          f"Einnahmen gesamt: {summe('einnahmen_eur'):.2f} €")
    print(f"Letzte 30 Tage: {int(summe('aufrufe', 30)):,} Aufrufe, {summe('einnahmen_eur', 30):.2f} € | "
          f"YouTube 90 Tage: {int(sum(zahl(z['aufrufe']) for z in zeilen if z['plattform'].startswith('youtube') and (heute - datetime.date.fromisoformat(z['datum'])).days < 90)):,} Aufrufe")
    nach = {}
    for z in zeilen:
        k = z["quelle_kanal"] or "?"
        nach.setdefault(k, [0, 0.0, 0])
        nach[k][0] += zahl(z["aufrufe"]); nach[k][1] += zahl(z["einnahmen_eur"]); nach[k][2] += 1
    for k, (v, e, n) in sorted(nach.items(), key=lambda x: -x[1][0]):
        print(f"  {k:<20} {n:>3} Clips  {int(v):>10,} Aufrufe  {e:>8.2f} €  Ø {int(v/n):,}/Clip")


if __name__ == "__main__":
    main()
