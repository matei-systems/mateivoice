#!/usr/bin/env python3
"""Lädt einen Abschnitt (yt-dlp) und schneidet ihn auf 9:16 (ffmpeg). Regel-Check ist Pflicht.
Aufruf:
  schnitt.py --kanal <streamer> --url <vod/clip-url> --start 00:12:03 --ende 00:12:41 [--layout blur|crop|facecam]
  schnitt.py --kanal <streamer> --datei roh.mp4 [--start ... --ende ...]   # lokale Datei
Ausgabe: gta6/clips/<clip_id>/{roh.mp4, clip.mp4, info.json}
"""
import argparse, datetime, json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".claude" / "skills" / "regel-check" / "scripts"))
from check import pruefe  # noqa: E402

W, H = 1080, 1920
LAYOUTS = {
    # Gameplay klein mittig, unscharfer Hintergrund: sicher für alles
    "blur": (f"[0:v]split=2[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
             f"boxblur=20:2,eq=brightness=-0.08[bg];[b]scale={W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"),
    # Mitte ausschneiden: maximal groß, Ränder gehen verloren
    "crop": f"[0:v]scale=-2:{H},crop={W}:{H},setsar=1",
    # Facecam (oben links, 1/4 Bild) oben, Gameplay unten
    "facecam": (f"[0:v]split=2[a][b];[a]crop=iw/4:ih/4:0:0,scale={W}:{H*2//5}:force_original_aspect_ratio=increase,"
                f"crop={W}:{H*2//5}[cam];[b]scale=-2:{H*3//5},crop={W}:{H*3//5}[game];[cam][game]vstack,setsar=1"),
}


def zu_sek(t):
    if t is None:
        return None
    teile = [float(x) for x in str(t).split(":")]
    s = 0.0
    for x in teile:
        s = s * 60 + x
    return s


def run(cmd):
    print("▶", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanal", required=True)
    q = ap.add_mutually_exclusive_group(required=True)
    q.add_argument("--url")
    q.add_argument("--datei")
    ap.add_argument("--start")
    ap.add_argument("--ende")
    ap.add_argument("--layout", choices=LAYOUTS, default="blur")
    ap.add_argument("--id", help="Clip-ID (Standard: kanal-datum-uhrzeit)")
    a = ap.parse_args()

    ok, grund = pruefe(a.kanal)
    print(("✅ " if ok else "⛔ STOPP: ") + grund)
    if not ok:
        sys.exit(1)

    cid = a.id or f"{a.kanal.lower()}-{datetime.datetime.now():%Y%m%d-%H%M%S}"
    ordner = ROOT / "gta6" / "clips" / cid
    ordner.mkdir(parents=True, exist_ok=True)
    roh, clip = ordner / "roh.mp4", ordner / "clip.mp4"
    s, e = zu_sek(a.start), zu_sek(a.ende)
    if s is not None and e is not None and not (5 <= e - s <= 180):
        sys.exit("Länge muss zwischen 5 und 180 s liegen.")

    if a.url:
        if not shutil.which("yt-dlp"):
            sys.exit("yt-dlp fehlt → pip install -r gta6/requirements.txt")
        cmd = ["yt-dlp", "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4",
               "-o", str(roh), "--force-overwrites"]
        if s is not None and e is not None:
            cmd += ["--download-sections", f"*{s}-{e}", "--force-keyframes-at-cuts"]
        run(cmd + [a.url])
        s = e = None  # Abschnitt ist schon geschnitten
    else:
        shutil.copy(a.datei, roh)

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"]
    if s is not None:
        cmd += ["-ss", str(s)]
    cmd += ["-i", str(roh)]
    if s is not None and e is not None:
        cmd += ["-t", str(e - s)]
    cmd += ["-filter_complex", LAYOUTS[a.layout] + "[v]", "-map", "[v]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", "30", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-movflags", "+faststart", str(clip)]
    run(cmd)
    info = {"clip_id": cid, "kanal": a.kanal.lower(), "quelle": a.url or a.datei, "start": a.start,
            "ende": a.ende, "layout": a.layout, "erlaubnis": grund, "erstellt": datetime.datetime.now().isoformat()}
    (ordner / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Fertig: {clip}")


if __name__ == "__main__":
    main()
