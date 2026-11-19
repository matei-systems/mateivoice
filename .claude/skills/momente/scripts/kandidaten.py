#!/usr/bin/env python3
"""Macht aus Hype-Meldungen Clip-Fenster (20–60 s) mit VOD-Zeitstempeln.
Aufruf: kandidaten.py <hype.jsonl> --stream-start 2026-11-19T18:02:00Z [--vorlauf 25] [--nachlauf 15] [--top 10]
"""
import argparse, datetime, json, pathlib


def ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))


def hms(sek):
    sek = max(0, int(sek))
    return f"{sek//3600:02d}:{sek%3600//60:02d}:{sek%60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("datei")
    ap.add_argument("--stream-start", required=True, help="UTC-Startzeit des Streams/VODs, ISO")
    ap.add_argument("--vorlauf", type=int, default=25, help="Sekunden vor der Chat-Spitze")
    ap.add_argument("--nachlauf", type=int, default=15)
    ap.add_argument("--min-laenge", type=int, default=20)
    ap.add_argument("--max-laenge", type=int, default=60)
    ap.add_argument("--top", type=int, default=10)
    a = ap.parse_args()
    start = ts(a.stream_start)
    evs = [json.loads(z) for z in pathlib.Path(a.datei).read_text(encoding="utf-8").splitlines() if z.strip()]
    evs.sort(key=lambda e: e["zeit_utc"])
    fenster = []
    for e in evs:
        t = (ts(e["zeit_utc"]) - start).total_seconds()
        von, bis = t - a.vorlauf, t + a.nachlauf
        if fenster and von <= fenster[-1]["bis"] + 5 and bis - fenster[-1]["von"] <= a.max_laenge:
            f = fenster[-1]
            f["bis"] = max(f["bis"], bis)
            f["score"] = round(f["score"] + e.get("score", 1), 2)
            f["beispiele"] += e.get("beispiele", [])[:2]
        else:
            fenster.append({"von": von, "bis": bis, "score": e.get("score", 1),
                            "beispiele": e.get("beispiele", [])[:3], "zeit_utc": e["zeit_utc"]})
    for f in fenster:
        if f["bis"] - f["von"] < a.min_laenge:
            f["von"] = f["bis"] - a.min_laenge
        f["von"] = max(0, f["von"])
    fenster.sort(key=lambda f: -f["score"])
    out = [{"rang": i + 1, "start": hms(f["von"]), "ende": hms(f["bis"]), "laenge_s": int(f["bis"] - f["von"]),
            "score": f["score"], "chat_zeit_utc": f["zeit_utc"], "beispiele": f["beispiele"][:4]}
           for i, f in enumerate(fenster[: a.top])]
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
