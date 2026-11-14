#!/usr/bin/env python3
"""data/insights.json + watchlist.txt içindeki sembollerin 6 aylık günlük kapanışlarını çeker -> data/prices.json
Kullanım: python3 scripts/update_prices.py   (internet gerekir; Yahoo Finance herkese açık chart uç noktası)"""
import json, pathlib, sys, time, urllib.request, datetime
root = pathlib.Path(__file__).resolve().parent.parent
ins = json.loads((root/"data/insights.json").read_text())
syms = {i["ticker"] for i in ins["items"]}
wl = root/"watchlist.txt"
if wl.exists(): syms |= {l.strip() for l in wl.read_text().splitlines() if l.strip() and not l.startswith("#")}
out = {}
for s in sorted(syms):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{s}?range=6mo&interval=1d"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        r = json.load(urllib.request.urlopen(req, timeout=20))["chart"]["result"][0]
        ts, cl = r["timestamp"], r["indicators"]["quote"][0]["close"]
        out[s] = {"currency": r["meta"].get("currency"),
                  "history": [[datetime.date.fromtimestamp(t).isoformat(), round(c, 2)] for t, c in zip(ts, cl) if c is not None]}
        print("ok", s, len(out[s]["history"]))
    except Exception as e:
        print("hata", s, e, file=sys.stderr)
    time.sleep(0.5)
(root/"data/prices.json").write_text(json.dumps({"updated": datetime.date.today().isoformat(), "tickers": out}, ensure_ascii=False))
