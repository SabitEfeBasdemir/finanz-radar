#!/usr/bin/env python3
"""Sektörleri getiriye göre sıralar -> data/sectors.json
Her sektör için bir ABD (SPDR) ve bir Avrupa (iShares STOXX Europe 600) sektör fonu kullanılır.
Puan = iki fonun 3 aylık getirisinin ortalaması. En iyi TOP_N sektör "active" olarak işaretlenir;
günlük haber taraması bu sektörlere odaklanır.
Kullanım: python3 scripts/update_sectors.py"""
import json, pathlib, sys, time, urllib.request, datetime

TOP_N = 10
SECTORS = [
    ("tech", "Teknoloji", "XLK", "EXV3.DE"),
    ("health", "Sağlık", "XLV", "EXV4.DE"),
    ("energy", "Enerji", "XLE", "EXH1.DE"),
    ("finance", "Finans", "XLF", "EXV1.DE"),
    ("industrials", "Sanayi ve savunma", "XLI", "EXH4.DE"),
    ("discretionary", "Tüketici (otomotiv, perakende)", "XLY", "EXV5.DE"),
    ("staples", "Temel tüketim", "XLP", "EXH3.DE"),
    ("communication", "İletişim ve medya", "XLC", "EXV2.DE"),
    ("materials", "Hammadde ve kimya", "XLB", "EXV6.DE"),
    ("utilities", "Kamu hizmetleri", "XLU", "EXH9.DE"),
    ("realestate", "Gayrimenkul", "XLRE", "EXI5.DE"),
]

root = pathlib.Path(__file__).resolve().parent.parent


def closes(sym):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1y&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    r = json.load(urllib.request.urlopen(req, timeout=20))["chart"]["result"][0]
    return [c for c in r["indicators"]["quote"][0]["close"] if c is not None]


def ret(v, days):
    if len(v) <= days:
        return None
    return round((v[-1] / v[-1 - days] - 1) * 100, 1)


out = []
for key, name, us, eu in SECTORS:
    row = {"key": key, "name": name, "etf_us": us, "etf_eu": eu}
    r3 = []
    for label, sym in (("us", us), ("eu", eu)):
        try:
            v = closes(sym)
            row[label] = {"m1": ret(v, 21), "m3": ret(v, 63), "y1": ret(v, len(v) - 1)}
            if row[label]["m3"] is not None:
                r3.append(row[label]["m3"])
        except Exception as e:
            print("hata", sym, e, file=sys.stderr)
            row[label] = None
        time.sleep(0.4)
    row["score"] = round(sum(r3) / len(r3), 1) if r3 else None
    out.append(row)
    print(f"{name:32} 3A {row['score']}")

out.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
for i, r in enumerate(out):
    r["rank"] = i + 1
    r["active"] = i < TOP_N

(root / "data/sectors.json").write_text(json.dumps(
    {"updated": datetime.date.today().isoformat(), "basis": "ABD + Avrupa sektör fonlarının 3 aylık ortalama getirisi",
     "sectors": out}, ensure_ascii=False, indent=1))
