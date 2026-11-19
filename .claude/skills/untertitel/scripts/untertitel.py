#!/usr/bin/env python3
"""Wort-für-Wort-Untertitel mit faster-whisper, eingebrannt mit ffmpeg.
Aufruf: untertitel.py gta6/clips/<id>/clip.mp4 [--modell small] [--sprache de] [--hook "Erster Satz"]
Ausgabe: words.json, untertitel.ass, final.mp4 im selben Ordner
"""
import argparse, json, pathlib, subprocess, sys


def t_ass(s):
    s = max(0.0, s)
    return f"{int(s//3600)}:{int(s%3600//60):02d}:{s%60:05.2f}"


def esc(t):
    return t.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


KOPF = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Wort,DejaVu Sans,96,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,2,60,60,560,1
Style: Hook,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,3,18,0,8,70,70,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--modell", default="small", help="tiny|base|small|medium|large-v3")
    ap.add_argument("--sprache", default=None, help="de, en … (leer = automatisch)")
    ap.add_argument("--hook", default=None, help="Text oben in den ersten 3 s")
    ap.add_argument("--nur-ass", action="store_true", help="nicht einbrennen")
    a = ap.parse_args()
    video = pathlib.Path(a.video).resolve()
    ordner = video.parent
    words_json = ordner / "words.json"

    if words_json.exists():
        woerter = json.loads(words_json.read_text(encoding="utf-8"))
    else:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            sys.exit("faster-whisper fehlt → pip install -r gta6/requirements.txt")
        modell = WhisperModel(a.modell, device="auto", compute_type="auto")
        segs, info = modell.transcribe(str(video), language=a.sprache, word_timestamps=True, vad_filter=True)
        woerter = [{"wort": w.word.strip(), "start": round(w.start, 2), "ende": round(w.end, 2)}
                   for s in segs for w in (s.words or []) if w.word.strip()]
        words_json.write_text(json.dumps(woerter, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Sprache: {info.language}, {len(woerter)} Wörter")

    zeilen = [KOPF]
    if a.hook:
        zeilen.append(f"Dialogue: 1,{t_ass(0)},{t_ass(3)},Hook,,0,0,0,,{esc(a.hook)}\n")
    for i, w in enumerate(woerter):
        ende = w["ende"]
        if i + 1 < len(woerter):  # bis zum nächsten Wort stehen lassen (kein Flackern), max 0,6 s Lücke
            ende = min(max(ende, woerter[i + 1]["start"]), w["ende"] + 0.6)
        text = esc(w["wort"]).upper()
        # kleiner "Pop": 80 % → 100 % in 80 ms
        zeilen.append(f"Dialogue: 0,{t_ass(w['start'])},{t_ass(ende)},Wort,,0,0,0,,"
                      f"{{\\fscx80\\fscy80\\t(0,80,\\fscx100\\fscy100)}}{text}\n")
    ass = ordner / "untertitel.ass"
    ass.write_text("".join(zeilen), encoding="utf-8")
    print(f"✅ {ass}")
    if a.nur_ass:
        return
    final = ordner / "final.mp4"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-i", video.name,
                    "-vf", "ass=untertitel.ass", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", final.name],
                   check=True, cwd=ordner)
    print(f"✅ {final}")


if __name__ == "__main__":
    main()
