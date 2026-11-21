#!/usr/bin/env python3
""""Potansiyeli olan şirketler" listesi -> data/potential.json (Claude kullanmaz, ücretsiz).

Seçim:
- Hisse fiyatı yaklaşık 10–40 € (ABD/İngiltere/İsviçre/İskandinav fiyatları güncel kurla avroya çevrilir).
- Son 14 günde destekleyici haberi olan şirketler: anlaşma/sipariş, devlet desteği, yatırım, onay, klinik sonuç,
  ürün, güçlü bilanço (yükseliş sinyalli). Dava/skandal gibi olumsuz haberler puan düşürür.
- Küçük ve orta ölçekli şirketler (S&P 600 / 400) öne çıkar.
Puan = olay ağırlıkları (yenilere daha fazla) + fiyat ivmesi + küçük şirket bonusu.

Her şirket için otomatik "destekleyici noktalar" (TR/EN) üretir: hangi haberler, son 1 ay fiyat hareketi,
hissenin kendi geçmişinde benzer yükselişlerden sonra ne olduğu.
Claude'un haftalık notları ayrı dosyada durur (data/potential_notes.json) ve bu betik ona dokunmaz.
Sadece standart kütüphane."""
import datetime as dt, json, pathlib, statistics, sys, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
PMIN, PMAX = 9.5, 42.0           # avro fiyat aralığı (10–40 €, kur oynaklığı için küçük pay)
DAYS = 14
TOP = 15
W = {"gov": 5, "deal": 4, "regulation": 4, "trial": 4, "investment": 3, "mna": 2, "product": 2, "earnings": 2, "buyback": 1, "analyst": 1, "move": 1, "mgmt": 0}
NEG = {"legal": -5}
SMALL = {"S&P 600": 3, "S&P 400": 1.5}
BIG = {"S&P 500", "FTSE 100", "EURO STOXX 50", "DAX", "CAC 40", "SMI", "AEX", "FTSE MIB", "IBEX 35", "OMX Stockholm 30"}  # büyük şirket endeksleri: listeye alınmaz
SUFFIX_CCY = {"L": "GBp", "SW": "CHF", "ST": "SEK", "CO": "DKK", "HE": "EUR", "OL": "NOK"}
FX_SYM = {"USD": "EURUSD=X", "GBP": "EURGBP=X", "CHF": "EURCHF=X", "SEK": "EURSEK=X", "DKK": "EURDKK=X", "NOK": "EURNOK=X"}

CAT_TXT = {  # olay türü -> kısa açıklama (TR, EN)
    "gov": ("Devlet / kamu desteği ya da kamu siparişi", "Government support or public contract"),
    "deal": ("Yeni anlaşma, sipariş veya ortaklık", "New deal, order or partnership"),
    "regulation": ("Onay / lisans haberi", "Approval or licence news"),
    "trial": ("Klinik çalışma sonucu", "Clinical trial result"),
    "investment": ("Yatırım / genişleme / sermaye", "Investment, expansion or capital"),
    "mna": ("Satın alma / birleşme haberi", "M&A news"),
    "product": ("Yeni ürün", "New product"),
    "earnings": ("Güçlü bilanço / tahmin", "Strong results or guidance"),
    "buyback": ("Geri alım / temettü", "Buyback or dividend"),
    "analyst": ("Analist not artırımı", "Analyst upgrade"),
    "move": ("Sert fiyat hareketi", "Big price move"),
}


def fx_rates():
    syms = ",".join(FX_SYM.values())
    url = f"https://query1.finance.yahoo.com/v8/finance/spark?range=5d&interval=1d&symbols={syms}"
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20))
        return {c: [x for x in d[s]["close"] if x][-1] for c, s in FX_SYM.items() if s in d}
    except Exception as e:
        print("kur hatası", e, file=sys.stderr)
        return {"USD": 1.10, "GBP": 0.84, "CHF": 0.93, "SEK": 11.1, "DKK": 7.46, "NOK": 11.7}


def series(tk):
    f = root / "data/p" / f"{tk}.csv"
    if not f.exists():
        return None
    rows = [l.split(",") for l in f.read_text().splitlines()[1:] if "," in l]
    return [(d, float(c)) for d, c in rows]


def to_eur(tk, price, fx):
    suf = tk.rsplit(".", 1)[1] if "." in tk else ""
    ccy = SUFFIX_CCY.get(suf, "EUR" if suf else "USD")
    if ccy == "GBp":
        price, ccy = price / 100, "GBP"
    return price if ccy == "EUR" else price / fx.get(ccy, 1)


def pc(a, b):
    return round((a / b - 1) * 100, 1)


def tr_pct(x):
    """Türkçe yüzde: +%21,5"""
    return ("+" if x > 0 else "−" if x < 0 else "") + "%" + f"{abs(x):.1f}".replace(".", ",")


def en_pct(x):
    return ("+" if x > 0 else "−" if x < 0 else "") + f"{abs(x):.1f}%"


def L(v, lang):
    return v.get(lang) or v.get("en") or v.get("tr") or "" if isinstance(v, dict) else (v or "")


def main():
    ins = json.loads((root / "data/insights.json").read_text())["items"]
    uni = {c["ticker"]: c for c in json.loads((root / "data/universe.json").read_text())["companies"]}
    fx = fx_rates()
    today = dt.date.today()
    by = {}
    for it in ins:
        try:
            age = (today - dt.date.fromisoformat(it["date"])).days
        except Exception:
            continue
        if age <= DAYS and it.get("type", "stock") == "stock":
            by.setdefault(it["ticker"], []).append((age, it))

    out = []
    for tk, evs in by.items():
        s = series(tk)
        if not s or len(s) < 30:
            continue
        if uni.get(tk, {}).get("index") in BIG:
            continue
        eur = to_eur(tk, s[-1][1], fx)
        if not (PMIN <= eur <= PMAX):
            continue
        score, pos, cats = 0.0, [], set()
        for age, it in sorted(evs, key=lambda e: e[0]):
            c = it.get("category")
            rec = 1.0 if age <= 3 else 0.7 if age <= 7 else 0.45
            if c in NEG:
                score += NEG[c] * rec
                continue
            w = W.get(c, 0)
            if it.get("signal") == "bearish":
                w *= -0.5
            elif it.get("signal") == "bullish":
                w *= 1.3
            if it.get("ai"):
                w *= 1.5          # Claude'un doğruladığı olay
            if w > 0 and c not in cats:   # aynı türden ikinci haber az ekler
                pos.append(it)
                cats.add(c)
                score += w * rec
            elif w > 0:
                score += w * rec * 0.3
            else:
                score += w * rec
        if not pos or score < 3:
            continue
        c = [x for _, x in s]
        m1 = pc(c[-1], c[-22]) if len(c) > 22 else None
        m3 = pc(c[-1], c[-64]) if len(c) > 64 else None
        if m1 is not None:
            score += max(-3, min(3, m1 / 6))
        idx = uni.get(tk, {}).get("index", "")
        score += SMALL.get(idx, 0)
        lead = pos[0]
        hist = lead.get("hist") or {}
        # Otomatik destekleyici noktalar
        pts_tr, pts_en = [], []
        for it in pos[:3]:
            t = CAT_TXT.get(it.get("category"), ("Olay", "Event"))
            d = dt.date.fromisoformat(it["date"])
            pts_tr.append(f"{t[0]} ({d.day}.{d.month}): {L(it.get('headline'), 'tr')}")
            pts_en.append(f"{t[1]} ({d.strftime('%b')} {d.day}): {L(it.get('headline'), 'en')}")
        if m1 is not None:
            pts_tr.append(f"Son 1 ayda fiyat {tr_pct(m1)}" + (f", son 3 ayda {tr_pct(m3)}" if m3 is not None else "") + ".")
            pts_en.append(f"Price {en_pct(m1)} over 1 month" + (f", {en_pct(m3)} over 3 months" if m3 is not None else "") + ".")
        if hist.get("n", 0) >= 3 and hist.get("dir", 0) > 0 and hist.get("n20"):
            thr = f"{hist['thr']:.1f}"
            pts_tr.append(f"Geçmişte: son 2 yılda bu hisse bir günde %{thr.replace('.', ',')}'den fazla {hist['n']} kez yükseldi; "
                          f"1 ay sonra {hist['n20']} durumdan {hist['up20']} tanesinde fiyat daha yüksekti (ortalama {tr_pct(hist['avg20'])}).")
            pts_en.append(f"History: over 2 years this stock rose more than {thr}% in a day {hist['n']} times; "
                          f"a month later it was higher in {hist['up20']} of {hist['n20']} cases (avg {en_pct(hist['avg20'])}).")
        if idx in SMALL:
            pts_tr.append(f"Küçük/orta ölçekli şirket ({idx}): iyi haberler fiyata daha güçlü yansıyabilir, ama oynaklık ve risk de daha yüksektir.")
            pts_en.append(f"Small/mid-cap company ({idx}): good news can move the price more, but volatility and risk are higher too.")
        out.append({
            "ticker": tk, "name": lead.get("name") or uni.get(tk, {}).get("name", tk), "market": lead.get("market"),
            "sector": lead.get("sector") or uni.get(tk, {}).get("sector"), "index": idx,
            "price": round(s[-1][1], 2), "eur": round(eur, 2), "m1": m1, "m3": m3, "score": round(score, 1),
            "events": len(evs), "lead": lead.get("id") or None, "lead_date": lead.get("date"),
            "lead_headline": lead.get("headline"), "cats": sorted(cats),
            "points": {"tr": pts_tr, "en": pts_en},
            "spark": [round(x, 2) for x in c[-30:]],
        })
    out.sort(key=lambda r: -r["score"])
    res = {"updated": today.isoformat(), "range_eur": [10, 40], "fx": {k: round(v, 4) for k, v in fx.items()}, "companies": out[:TOP]}
    (root / "data/potential.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")))
    notes = root / "data/potential_notes.json"
    if not notes.exists():
        notes.write_text(json.dumps({"updated": None, "notes": {}}, ensure_ascii=False))
    print(f"{len(out)} aday, ilk {min(TOP, len(out))} yazıldı")
    for r in out[:TOP]:
        print(f"  {r['ticker']:8} {r['eur']:6.2f}€ skor {r['score']:5.1f} 1A {r['m1']} {r['index']:9} {r['cats']}")


if __name__ == "__main__":
    main()
