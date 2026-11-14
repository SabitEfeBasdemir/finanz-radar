#!/usr/bin/env python3
"""Günlük otomatik haber taraması (yapay zekâ yok, ücretsiz) -> data/insights.json
- data/universe.json içindeki, data/sectors.json'da "active" olan sektörlerdeki tüm şirketleri tarar.
- Her şirket için Yahoo Finance haber akışını (RSS) okur ve günlük fiyat değişimini çeker.
- Başlıkları kelime kurallarıyla kategoriye (anlaşma, satın alma, bilanço...) ve sinyale (yükseliş/izle/düşüş) ayırır.
- Önemli bir olay türü içeren ya da o gün sert hareket eden şirketleri kaydeder.
Sadece Python standart kütüphanesi kullanır."""
import datetime as dt, email.utils, hashlib, json, pathlib, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

root = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0"}
HOURS = 48          # bu kadar saatten eski haberler alınmaz
BIG_MOVE = 5.0      # bu yüzdeden fazla hareket eden hisse, olay türü olmasa da kaydedilir
MAX_PER_TICKER = 2
MAX_NEW = 250       # günde en fazla bu kadar yeni kayıt
KEEP_AUTO_DAYS = 7
KEEP_AI_DAYS = 60

# (kategori, kalıp, ağırlık) — ilk eşleşen kategori kullanılır, sıra önemlidir.
CATS = [
    ("mna", r"\b(acquir\w*|acquisition|merger|merge|takeover|buyout|to buy|agrees to buy|bid for|übernahme|fusion|rachat)\b", 5),
    ("legal", r"\b(lawsuit|sues?|sued|probe|investigation|fraud|scandal|fined?|settle\w*|antitrust|recall\w*|subpoena|charged|indict\w*|class action|whistleblower)\b", 5),
    ("gov", r"\b(government|subsid\w*|grant|federal|pentagon|department of|commission|chips act|tariffs?|sanction\w*|state aid|bundesregierung|ministry)\b", 4),
    ("regulation", r"\b(fda|ema|approv\w*|clearance|cleared|regulator\w*|ban|banned|licen[cs]e|authori[sz]ation)\b", 4),
    ("trial", r"\b(trial|phase [1-3i]+|study data|topline|clinical)\b", 4),
    ("deal", r"\b(contract|agreement|partnership|partners with|deal|orders?|wins|awarded|collaborat\w*|supply|signs?|signed|joint venture|alliance)\b", 4),
    ("buyback", r"\b(buyback|repurchase|special dividend|dividend (hike|increase|raise))\b", 3),
    ("mgmt", r"\b(ceo|cfo|chief executive|chairman|resign\w*|steps? down|appoint\w*|succession|ousted)\b", 3),
    ("investment", r"\b(public offering|share offering|stock offering|capital raise|invest\w*|funding|raises \$|capex|expan\w*|new plant|factory|gigafactory|stake|ipo|spin-?off)\b", 3),
    ("earnings", r"\b(earnings|results|quarter\w*|q[1-4]|revenue|profit|guidance|outlook|forecast|beats?|miss(es)?|eps)\b", 3),
    ("analyst", r"\b(upgrade\w*|downgrade\w*|price target|initiat\w* coverage|outperform|underperform|overweight|underweight)\b", 2),
    ("product", r"\b(launch\w*|unveil\w*|introduc\w*|rollout|new model|release[sd]?)\b", 2),
]
BULL = r"\b(beat\w*|tops?|raise[sd]?|hike\w*|surg\w*|soar\w*|jump\w*|rall\w*|record|wins?|won|approv\w*|upgrade\w*|strong\w*|boost\w*|expand\w*|climb\w*|gain\w*|outperform|overweight|accelerat\w*|award\w*)\b"
BEAR = r"\b(miss\w*|cuts?|slash\w*|plung\w*|tumbl\w*|slump\w*|fall\w*|fell|drop\w*|sink\w*|sank|lawsuit|probe|fraud|recall\w*|downgrade\w*|weak\w*|delay\w*|reject\w*|warn\w*|layoff\w*|halt\w*|loss\w*|underperform|underweight|crash\w*|offering|dilut\w*|investigation|scandal|fined?|ban)\b"
NOISE = r"(\?$|stocks? to (buy|watch)|\bbest .* stocks?\b|top \d+ |should you buy|is it time to|here's (why|how|what)|what to know|crushed|motley fool|zacks rank|\d+ reasons)"


def get(url, timeout=20):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def moves(tickers):
    """Yahoo spark: 20'li gruplar halinde son iki kapanıştan günlük yüzde değişim."""
    out = {}
    for i in range(0, len(tickers), 20):
        part = tickers[i:i + 20]
        try:
            d = json.loads(get("https://query1.finance.yahoo.com/v8/finance/spark?range=5d&interval=1d&symbols="
                               + urllib.parse.quote(",".join(part))))
            for s, v in d.items():
                c = [x for x in (v.get("close") or []) if x is not None]
                if len(c) >= 2 and c[-2]:
                    out[s] = round((c[-1] / c[-2] - 1) * 100, 1)
        except Exception as e:
            print("spark hata", part[0], e, file=sys.stderr)
        time.sleep(0.2)
    return out


def news(sym):
    try:
        x = ET.fromstring(get(f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(sym)}&region=US&lang=en-US"))
    except Exception:
        return sym, []
    now = dt.datetime.now(dt.timezone.utc)
    items = []
    for it in x.iter("item"):
        t = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        try:
            pub = email.utils.parsedate_to_datetime(it.findtext("pubDate"))
        except Exception:
            continue
        if not t or not link or (now - pub).total_seconds() > HOURS * 3600:
            continue
        items.append({"title": t, "desc": (it.findtext("description") or "").strip(), "url": link.split("?.tsrc")[0], "date": pub.date().isoformat()})
    return sym, items


def classify(text):
    low = text.lower()
    for key, pat, w in CATS:
        if re.search(pat, low):
            return key, w
    return None, 0


def signal(text, move):
    low = text.lower()
    s = len(re.findall(BULL, low)) - len(re.findall(BEAR, low))
    if move is not None and abs(move) >= 3:
        s += 2 if move > 0 else -2
    return "bullish" if s > 0 else "bearish" if s < 0 else "watch"


def main():
    uni = json.loads((root / "data/universe.json").read_text())["companies"]
    secs = json.loads((root / "data/sectors.json").read_text())["sectors"]
    active = {s["key"] for s in secs if s.get("active")}
    comp = {c["ticker"]: c for c in uni if c["sector"] in active}
    tickers = sorted(comp)
    print(f"{len(tickers)} şirket taranıyor ({len(active)} sektör)")

    mv = moves(tickers)
    with ThreadPoolExecutor(6) as ex:
        feeds = dict(ex.map(news, tickers))

    path = root / "data/insights.json"
    data = json.loads(path.read_text()) if path.exists() else {"items": []}
    seen = {s.get("url") for i in data.get("items", []) for s in i.get("sources", [])}
    # Aynı gün aynı şirket için zaten kayıt varsa (önceki çalıştırma) toplam MAX_PER_TICKER'ı aşma.
    per_day = {}
    for i in data.get("items", []):
        if i.get("auto"):
            per_day[(i["ticker"], i.get("date"))] = per_day.get((i["ticker"], i.get("date")), 0) + 1
    cand = []
    for sym, items in feeds.items():
        c, m = comp[sym], mv.get(sym)
        # Haberde şirket adı veya sembolü geçmiyorsa (genel piyasa haberi) atla.
        short = re.split(r"[ ,.(]", c["name"])[0].lower()
        picked = []
        for n in items:
            if n["url"] in seen or re.search(NOISE, n["title"].lower()):
                continue
            text = n["title"] + " " + n["desc"]
            if short not in text.lower() and sym.split(".")[0].lower() not in text.lower():
                continue
            cat, w = classify(n["title"]) if classify(n["title"])[0] else classify(text)
            big = m is not None and abs(m) >= BIG_MOVE
            if not cat and not big:
                continue
            score = w + (abs(m) if m is not None else 0)
            picked.append((score, cat or "move", n))
        for score, cat, n in sorted(picked, key=lambda p: -p[0]):
            if per_day.get((sym, n["date"]), 0) >= MAX_PER_TICKER:
                continue
            per_day[(sym, n["date"])] = per_day.get((sym, n["date"]), 0) + 1
            seen.add(n["url"])
            host = urllib.parse.urlparse(n["url"]).netloc.replace("www.", "")
            cand.append((score, {
                "id": hashlib.sha1(n["url"].encode()).hexdigest()[:12], "auto": True,
                "ticker": sym, "name": c["name"], "market": c["market"], "type": "stock", "sector": c["sector"],
                "signal": signal(n["title"] + " " + n["desc"], m), "category": cat, "date": n["date"], "move": m,
                "headline": n["title"], "summary": n["desc"][:400],
                "sources": [{"title": host, "url": n["url"]}]}))
    new = [x for _, x in sorted(cand, key=lambda p: -p[0])[:MAX_NEW]]

    today = dt.date.today()
    def keep(i):
        try:
            age = (today - dt.date.fromisoformat(i.get("date", ""))).days
        except ValueError:
            return False
        return age <= (KEEP_AUTO_DAYS if i.get("auto") else KEEP_AI_DAYS)
    items = new + [i for i in data.get("items", []) if keep(i)]
    items.sort(key=lambda i: i.get("date", ""), reverse=True)
    data.update({"updated": today.isoformat(), "items": items})
    data.pop("note", None)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(new)} yeni kayıt, toplam {len(items)}")


if __name__ == "__main__":
    main()
