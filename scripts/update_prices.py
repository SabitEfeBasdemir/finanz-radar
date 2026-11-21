#!/usr/bin/env python3
"""Fiyatlar ve geçmiş tepki istatistikleri.
- data/insights.json + watchlist.txt içindeki her sembol için 2 yıllık günlük kapanışları çeker (Yahoo spark, 20'li gruplar).
- data/prices.json'a son 6 ayı yazar (uygulamadaki grafikler için).
- Her haber kaydına şunları ekler:
    since: haberden önceki son kapanıştan bugüne fiyat değişimi (%) ve geçen işlem günü
    hist:  hissenin son 2 yılında benzer büyüklükte ve aynı yönde günlük hareketler kaç kez oldu,
           sonraki 5 ve 20 işlem gününde fiyat kaç kez yükseldi, ortalama ne kadar değişti
    vol:   hissenin tipik (medyan) günlük hareketi, %
Grafik için ek dosyalar:
    data/i/<SEMBOL>.csv  gün içi: son 5 işlem günü, 15 dakikalık (her taramada) -> "Gün" ve "Hafta"
    data/m/<SEMBOL>.csv  borsaya açılıştan bugüne aylık kapanışlar (günde bir kez) -> "Maks."
Sadece standart kütüphane."""
import datetime, json, pathlib, statistics, sys, time, urllib.parse, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
MIN_MOVE = 2.0      # bundan küçük hareketler için "benzer durum" aranmaz
GAP = 5             # birbirine 5 işlem gününden yakın olaylar tek sayılır


def spark(syms, rng, interval):
    """Yahoo spark: 20'li gruplar halinde {sembol: [(unix_zaman, kapanış), ...]}"""
    out = {}
    for k in range(0, len(syms), 20):
        part = syms[k:k + 20]
        url = f"https://query1.finance.yahoo.com/v8/finance/spark?range={rng}&interval={interval}&symbols=" + urllib.parse.quote(",".join(part))
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
            for s, v in d.items():
                h = [(t, c) for t, c in zip(v.get("timestamp") or [], v.get("close") or []) if c]
                if len(h) > 2:
                    out[s] = h
        except Exception as e:
            print("hata", rng, part[0], e, file=sys.stderr)
        time.sleep(0.3)
    return out


def write_csv(folder, data, fmt, keep):
    """Her sembol için tek dosya; artık kullanılmayan dosyaları siler."""
    d = root / "data" / folder
    d.mkdir(exist_ok=True)
    for s, h in data.items():
        (d / f"{s}.csv").write_text("t,c\n" + "".join(fmt(t, c) for t, c in h))
    for f in d.glob("*.csv"):
        if f.stem not in keep:
            f.unlink()


def fetch(syms):
    out = {}
    for k in range(0, len(syms), 20):
        part = syms[k:k + 20]
        url = "https://query1.finance.yahoo.com/v8/finance/spark?range=2y&interval=1d&symbols=" + urllib.parse.quote(",".join(part))
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
            for s, v in d.items():
                h = [(datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat(), c)
                     for t, c in zip(v.get("timestamp") or [], v.get("close") or []) if c]
                if len(h) > 30:
                    out[s] = h
        except Exception as e:
            print("hata", part[0], e, file=sys.stderr)
        time.sleep(0.3)
    return out


def pc(a, b):
    return round((a / b - 1) * 100, 1)


def analyse(item, h):
    dates, c = [d for d, _ in h], [x for _, x in h]
    ret = [None] + [(c[i] / c[i - 1] - 1) * 100 for i in range(1, len(c))]
    # Haber gününün işlem günü indeksi (o gün veya sonraki ilk işlem günü)
    # Hafta sonu / tatil haberi: henüz işlem günü yok -> i = len(c) (son işlem gününden sonrası)
    i = next((k for k, d in enumerate(dates) if d >= item.get("date", "")), len(c))
    res = {"vol": round(statistics.median(abs(r) for r in ret[-250:] if r is not None), 1)}
    if i == 0:
        return res
    if i < len(c):
        res["since"] = {"pct": pc(c[-1], c[i - 1]), "days": len(c) - i}
        if ret[i] is not None:
            res["day"] = round(ret[i], 1)   # haber günündeki kapanış hareketi
    move = item.get("move")
    if move is None and i < len(c):
        move = ret[i]
    if move is None or abs(move) < MIN_MOVE:
        return res
    thr = max(MIN_MOVE, round(abs(move) * 0.7, 1))
    sign = 1 if move > 0 else -1
    ev, last = [], -GAP
    for j in range(1, i - 20):
        if ret[j] is not None and ret[j] * sign >= thr and j - last >= GAP:
            ev.append(j)
            last = j
    if not ev:
        res["hist"] = {"n": 0, "thr": thr, "dir": sign}
        return res
    f5 = [pc(c[j + 5], c[j]) for j in ev if j + 5 < len(c)]
    f20 = [pc(c[j + 20], c[j]) for j in ev if j + 20 < len(c)]
    res["hist"] = {
        "n": len(ev), "thr": thr, "dir": sign, "years": round(i / 250, 1),
        "up5": sum(x > 0 for x in f5), "n5": len(f5), "avg5": round(statistics.mean(f5), 1) if f5 else None,
        "up20": sum(x > 0 for x in f20), "n20": len(f20), "avg20": round(statistics.mean(f20), 1) if f20 else None,
        "last": dates[ev[-1]],
    }
    return res


def main():
    path = root / "data/insights.json"
    ins = json.loads(path.read_text())
    syms = {i["ticker"] for i in ins["items"]}
    wl = root / "watchlist.txt"
    if wl.exists():
        syms |= {l.strip() for l in wl.read_text().splitlines() if l.strip() and not l.startswith("#")}
    # Avro kurları: "1.000 € yatırsaydın" hesabı için (hisse para birimi -> EUR, her iki tarihteki kurla)
    syms |= {"EURUSD=X", "EURGBP=X", "EURCHF=X", "EURSEK=X", "EURDKK=X", "EURNOK=X"}
    data = fetch(sorted(syms))

    # Kartlardaki mini grafikler için son 30 işlem günü tek dosyada (hızlı yükleme)
    prices = {s: {"history": [[d, round(x, 2)] for d, x in h[-30:]]} for s, h in data.items()}
    (root / "data/prices.json").write_text(json.dumps({"updated": datetime.date.today().isoformat(), "tickers": prices}, separators=(",", ":")))
    # Detay grafiği için her sembolün 2 yıllık kapanışları ayrı dosyada: data/p/<SEMBOL>.csv
    # (satır başına bir gün; git yalnızca eklenen son satırları saklar, depo şişmez)
    pdir = root / "data/p"
    pdir.mkdir(exist_ok=True)
    for s, h in data.items():
        (pdir / f"{s}.csv").write_text("date,close\n" + "".join(f"{d},{round(x, 4)}\n" for d, x in h))
    for f in pdir.glob("*.csv"):
        if f.stem not in data and f.stem not in syms:
            f.unlink()

    # Gün içi (son 5 işlem günü, 15 dk) — her taramada
    intra = spark(sorted(syms), "5d", "15m")
    write_csv("i", intra, lambda t, c: f"{t},{round(c, 4)}\n", syms)
    # Borsaya açılıştan bugüne (aylık) — günde bir kez, yeni semboller için hemen
    stamp = root / "data/m/_gun.txt"
    today = datetime.date.today().isoformat()
    mdir = root / "data/m"
    mdir.mkdir(exist_ok=True)
    need = sorted(syms) if not stamp.exists() or stamp.read_text().strip() != today else \
        sorted(s for s in syms if not (mdir / f"{s}.csv").exists())
    if need:
        mx = spark(need, "max", "1mo")
        for s, h in mx.items():
            (mdir / f"{s}.csv").write_text("t,c\n" + "".join(
                f"{datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date().isoformat()},{round(c, 4)}\n" for t, c in h))
        stamp.write_text(today)
    for f in mdir.glob("*.csv"):
        if f.stem not in syms:
            f.unlink()
    print(f"gün içi {len(intra)} sembol, tarihsel {len(need)} sembol yenilendi")

    n = 0
    for it in ins["items"]:
        h = data.get(it["ticker"])
        if not h:
            continue
        for k in ("since", "hist", "vol", "day"):
            it.pop(k, None)
        it.update(analyse(it, h))
        n += "hist" in it
    path.write_text(json.dumps(ins, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(data)} / {len(syms)} sembol, {n} kayıtta geçmiş tepki istatistiği")


if __name__ == "__main__":
    main()
