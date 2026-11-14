#!/usr/bin/env python3
"""data/insights.json + watchlist.txt içindeki sembollerin 6 aylık günlük kapanışları -> data/prices.json
Yahoo Finance spark uç noktası, 20'li gruplar halinde (yüzlerce sembol için hızlı). Sadece standart kütüphane."""
import json, pathlib, sys, time, urllib.parse, urllib.request, datetime
root = pathlib.Path(__file__).resolve().parent.parent
ins = json.loads((root/"data/insights.json").read_text())
syms = {i["ticker"] for i in ins["items"]}
wl = root/"watchlist.txt"
if wl.exists(): syms |= {l.strip() for l in wl.read_text().splitlines() if l.strip() and not l.startswith("#")}
syms = sorted(syms); out = {}
for k in range(0, len(syms), 20):
    part = syms[k:k+20]
    url = "https://query1.finance.yahoo.com/v8/finance/spark?range=6mo&interval=1d&symbols=" + urllib.parse.quote(",".join(part))
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
        for s, v in d.items():
            h = [[datetime.datetime.utcfromtimestamp(t).date().isoformat(), round(c, 2)] for t, c in zip(v.get("timestamp") or [], v.get("close") or []) if c is not None]
            if h: out[s] = {"currency": v.get("currency"), "history": h}
    except Exception as e:
        print("hata", part[0], e, file=sys.stderr)
    time.sleep(0.3)
(root/"data/prices.json").write_text(json.dumps({"updated": datetime.date.today().isoformat(), "tickers": out}, separators=(",", ":")))
print(len(out), "/", len(syms), "sembol")
