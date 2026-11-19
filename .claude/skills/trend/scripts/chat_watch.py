#!/usr/bin/env python3
"""Beobachtet einen Twitch-Chat anonym und meldet Hype-Spitzen.
Aufruf: chat_watch.py <kanal> [--fenster 10] [--faktor 2.5] [--min 15] [--dauer-min 0]
Schreibt jede Meldung als JSON-Zeile nach gta6/daten/hype/<kanal>-<datum>.jsonl
"""
import argparse, collections, datetime, json, pathlib, random, re, socket, ssl, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[4]
HYPE = re.compile(r"\b(kekw|lul|lmao|lmfao|omg|wtf|pog+|poggers|pogchamp|holy|insane|clip+ (it|that)|"
                  r"no way|w+|lol+|haha+|xd+|digga|krass|alter|bruh|monkas|ezy?|gg)\b|!clip|🔥|😂|💀", re.I)


def verbinden(kanal):
    roh = socket.create_connection(("irc.chat.twitch.tv", 6697), timeout=30)
    s = ssl.create_default_context().wrap_socket(roh, server_hostname="irc.chat.twitch.tv")
    s.sendall(f"NICK justinfan{random.randint(10000, 99999)}\r\nJOIN #{kanal}\r\n".encode())
    s.settimeout(1.0)
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kanal")
    ap.add_argument("--fenster", type=int, default=10, help="Sekunden pro Messfenster")
    ap.add_argument("--faktor", type=float, default=2.5, help="Spitze = Faktor x Durchschnitt")
    ap.add_argument("--min", type=int, default=15, help="Mindestnachrichten pro Fenster")
    ap.add_argument("--dauer-min", type=float, default=0, help="0 = endlos")
    a = ap.parse_args()
    kanal = a.kanal.lower().lstrip("#")
    out = ROOT / "gta6" / "daten" / "hype" / f"{kanal}-{datetime.date.today()}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)

    s = verbinden(kanal)
    print(f"👀 Beobachte #{kanal} → {out}", flush=True)
    puffer, verlauf = "", collections.deque(maxlen=30)  # 30 Fenster ≈ 5 min Basis
    n, hype, beispiele = 0, 0, []
    fenster_start, ende = time.time(), time.time() + a.dauer_min * 60 if a.dauer_min else None
    letzte_meldung = 0.0
    while True:
        try:
            daten = s.recv(4096).decode("utf-8", "ignore")
            if not daten:
                raise ConnectionError
            puffer += daten
        except socket.timeout:
            pass
        except (ConnectionError, OSError):
            print("Verbindung weg, neu verbinden …", flush=True)
            time.sleep(5)
            s = verbinden(kanal)
            continue
        while "\r\n" in puffer:
            zeile, puffer = puffer.split("\r\n", 1)
            if zeile.startswith("PING"):
                s.sendall(b"PONG :tmi.twitch.tv\r\n")
            elif " PRIVMSG " in zeile:
                text = zeile.split(" :", 1)[-1]
                n += 1
                if HYPE.search(text):
                    hype += 1
                    if len(beispiele) < 5:
                        beispiele.append(text[:80])
        jetzt = time.time()
        if jetzt - fenster_start >= a.fenster:
            basis = sum(verlauf) / len(verlauf) if verlauf else None
            hype_anteil = hype / n if n else 0
            spitze = basis is not None and len(verlauf) >= 6 and n >= a.min and n >= a.faktor * max(basis, 1)
            if spitze and jetzt - letzte_meldung > 30:
                ev = {"zeit_utc": datetime.datetime.utcfromtimestamp(fenster_start).isoformat() + "Z",
                      "kanal": kanal, "nachrichten": n, "basis": round(basis, 1),
                      "faktor": round(n / max(basis, 1), 1), "hype_anteil": round(hype_anteil, 2),
                      "score": round(n / max(basis, 1) * (1 + hype_anteil), 2), "beispiele": beispiele}
                with out.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
                print(f"🔥 HYPE {ev['zeit_utc']} | {n} Msg ({ev['faktor']}x) | Hype {int(hype_anteil*100)}% | "
                      f"{' / '.join(beispiele[:3])}", flush=True)
                letzte_meldung = jetzt
            verlauf.append(n)
            n, hype, beispiele, fenster_start = 0, 0, [], jetzt
        if ende and jetzt > ende:
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
