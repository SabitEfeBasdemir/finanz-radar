#!/usr/bin/env python3
""""Hareket Radarı": sert düşüşler ve sert yükselişler -> data/movers.json (Claude kullanmaz, ücretsiz).

Takip edilen bütün şirket ve fonlar (data/universe.json) için data/p/<SEMBOL>.csv günlük fiyatlarına bakar.
"Sert" hareket, hissenin KENDİ normal oynaklığına göre ölçülür (son 1 yılın medyan günlük hareketi):
  - 1 günlük hareket >= 3 × normal günlük hareket ve en az %5 (hisse) / %2 (fon, altın, gümüş), ya da
  - 5 günlük hareket >= 6 × normal günlük hareket ve en az %10 (hisse) / %4 (fon, altın, gümüş).
Böylece altın/gümüş gibi sakin varlıklar daha küçük ama kendileri için olağan dışı hareketlerde de listelenir.

Her kayıt için: hareket, 52 haftalık zirveye/dibe uzaklık, piyasa geneli aynı gün ne yaptı (SPY / MSCI World),
varsa o günlerin haberi ve hissenin kendi 2 yıllık geçmişinde benzer hareketlerden 1 hafta / 1 ay / 3 ay sonra ne olduğu.
Sadece standart kütüphane."""
import datetime as dt, json, pathlib, statistics

root = pathlib.Path(__file__).resolve().parent.parent
TOP = 15
GAP = 5


def series(tk):
    f = root / "data/p" / f"{tk}.csv"
    if not f.exists():
        return None
    rows = [l.split(",") for l in f.read_text().splitlines()[1:] if "," in l]
    return [(d, float(c)) for d, c in rows if c]


def pc(a, b):
    return round((a / b - 1) * 100, 1)


def after_stats(c, ret, sign, thr, i_now, span):
    """Geçmişte (son olaydan önce) aynı yönde >= thr'lik `span` günlük hareketlerden sonra ne oldu."""
    ev, last = [], -GAP
    for j in range(span, i_now - 5):
        r = (c[j] / c[j - span] - 1) * 100
        if r * sign >= thr and j - last >= GAP:
            ev.append(j)
            last = j
    out = {"n": len(ev), "thr": round(thr, 1)}
    for k, h in (("w1", 5), ("m1", 21), ("m3", 63)):
        f = [pc(c[j + h], c[j]) for j in ev if j + h < len(c) and j + h < i_now]
        if f:
            out[k] = {"n": len(f), "up": sum(x > 0 for x in f), "avg": round(statistics.mean(f), 1)}
    return out


def main():
    uni = json.loads((root / "data/universe.json").read_text())["companies"]
    ins = json.loads((root / "data/insights.json").read_text())["items"]
    news = {}
    for it in sorted(ins, key=lambda x: x.get("date", ""), reverse=True):
        news.setdefault(it["ticker"], it)
    mk = {}
    for m in ("SPY", "EUNL.DE"):
        s = series(m)
        if s and len(s) > 6:
            mk[m] = {"d1": pc(s[-1][1], s[-2][1]), "d5": pc(s[-1][1], s[-6][1]), "date": s[-1][0]}

    data = {}
    latest = ""
    for c in uni:
        s = series(c["ticker"])
        if s and len(s) > 260:
            data[c["ticker"]] = (c, s)
            latest = max(latest, s[-1][0])

    out = []
    for tk, (comp, s) in data.items():
        if s[-1][0] < (dt.date.fromisoformat(latest) - dt.timedelta(days=4)).isoformat():
            continue   # fiyatı güncel değil
        dates, c = [d for d, _ in s], [x for _, x in s]
        rets = [(c[i] / c[i - 1] - 1) * 100 for i in range(1, len(c))]
        vol = statistics.median(abs(r) for r in rets[-250:]) or 0.5
        calm = comp.get("type") == "fund" or comp.get("sector") == "metals"
        d1, d5 = pc(c[-1], c[-2]), pc(c[-1], c[-6])
        hi52, lo52 = max(c[-252:]), min(c[-252:])
        pick = None
        if abs(d1) >= max(3 * vol, 2 if calm else 5):
            pick = ("1d", d1, abs(d1) / vol, 1)
        elif abs(d5) >= max(6 * vol, 4 if calm else 10):
            pick = ("5d", d5, abs(d5) / (vol * 2.2), 5)
        if not pick:
            continue
        period, move, z, span = pick
        sign = 1 if move > 0 else -1
        hist = after_stats(c, rets, sign, abs(move) * 0.7, len(c) - span, span)
        n = news.get(tk)
        fresh = n if n and n.get("date", "") >= dates[-span - 1] else None
        market = mk.get("SPY" if comp.get("market") == "US" else "EUNL.DE", {})
        out.append({
            "ticker": tk, "name": comp["name"], "market": comp["market"], "sector": comp["sector"],
            "type": comp.get("type", "stock"), "index": comp.get("index", ""),
            "kind": "rally" if sign > 0 else "drop", "period": period, "move": move, "z": round(z, 1),
            "vol": round(vol, 2), "d1": d1, "d5": d5, "m1": pc(c[-1], c[-22]),
            "from_high": pc(c[-1], hi52), "from_low": pc(c[-1], lo52), "date": dates[-1], "price": round(c[-1], 4),
            "market_move": market.get("d1" if period == "1d" else "d5"),
            "news": {"id": fresh.get("id"), "headline": fresh.get("headline"), "date": fresh.get("date"),
                     "ai": bool(fresh.get("ai"))} if fresh else None,
            "hist": hist, "spark": [round(x, 4) for x in c[-30:]],
        })

    def top(kind):
        lst = [r for r in out if r["kind"] == kind]
        lst.sort(key=lambda r: -r["z"])
        sel = lst[:TOP]
        # altın/gümüş tarafında olağan dışı hareket varsa listede mutlaka yer alsın
        for r in lst[TOP:]:
            if r["sector"] == "metals" and len([x for x in sel if x["sector"] == "metals"]) < 4:
                sel.append(r)
        return sel

    res = {"updated": dt.date.today().isoformat(), "market_date": latest, "market": mk,
           "drops": top("drop"), "rallies": top("rally")}
    (root / "data/movers.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")))
    notes = root / "data/move_notes.json"
    if not notes.exists():
        notes.write_text(json.dumps({"updated": None, "notes": {}}, ensure_ascii=False))
    print(f"{len(out)} sert hareket; listede {len(res['drops'])} düşüş, {len(res['rallies'])} yükseliş")
    for k in ("drops", "rallies"):
        for r in res[k][:8]:
            print(f"  {k[:4]} {r['ticker']:9} {r['period']} {r['move']:+6.1f}%  z={r['z']:4.1f}  vol={r['vol']}  {r['sector']}  haber={'var' if r['news'] else '-'}")


if __name__ == "__main__":
    main()
