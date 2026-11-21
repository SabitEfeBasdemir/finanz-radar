#!/usr/bin/env python3
"""Takip edilen şirket listesini oluşturur -> data/universe.json
ABD: S&P 500 + S&P MidCap 400 + S&P SmallCap 600 (büyük, orta, küçük ölçek).
Avrupa: EURO STOXX 50, DAX, CAC 40, FTSE 100, SMI, AEX, FTSE MIB, IBEX 35, OMX Stockholm 30.
Kaynak: Wikipedia endeks üye tabloları. Ayda bir çalışması yeterli (GitHub Actions bunu yapar).
Gereksinim: pandas + lxml."""
import io, json, pathlib, re, sys, urllib.request, datetime
import pandas as pd

root = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (finanz-radar personal script)"}

# Farklı endekslerin sektör adlarını uygulamadaki 11 sektör anahtarına eşler (ilk eşleşen kazanır).
SECTOR_RULES = [
    ("realestate", r"real estate|reit|immobil"),
    ("utilities", r"utilit|electric|water|gas distribution|multi-utilities|versorg"),
    ("energy", r"energy|oil|gas|petrol|renewable"),
    ("health", r"health|pharma|biotech|medical|life science|drug"),
    ("finance", r"financ|bank|insur|invest|asset manag|capital market|brokerage|exchange|payment|reinsur"),
    ("tech", r"tech|software|semiconductor|information|it services|computer|electronic"),
    ("communication", r"communic|telecom|media|entertain|interactive|publishing|broadcast|advertis"),
    ("materials", r"material|chemic|steel|metal|mining|basic resource|paper|packag|construction material|cement|forest"),
    ("staples", r"staple|food|beverage|tobacco|household|personal care|drug retail|brew|agri|grocery"),
    ("discretionary", r"discretion|automob|auto|apparel|luxury|retail|leisure|hotel|travel|restaurant|consumer|textile|home|gaming|e-commerce|distribution|personal goods|gambling|tourism|clothes|cosmetic"),
    ("industrials", r"industr|aerospace|defen|machin|transport|airline|logist|construct|engineer|electrical|business services|commercial|building|shipping|aviation|manufactur|infrastructure"),
]


def sector_key(label):
    s = str(label).lower()
    for key, pat in SECTOR_RULES:
        if re.search(pat, s):
            return key
    return None


def tables(url):
    html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode()
    return pd.read_html(io.StringIO(html))


def pick(ts, need):
    for t in ts:
        cols = [str(c) for c in t.columns]
        if all(any(n.lower() in c.lower() for c in cols) for n in need) and len(t) >= 15:
            return t
    raise ValueError(f"tablo yok: {need}")


def col(t, *names):
    for c in t.columns:
        if any(n.lower() in str(c).lower() for n in names):
            return c
    raise KeyError(names)


SOURCES = [
    # ad, url, piyasa, sembol sütunu, isim sütunu, sektör sütunu, Yahoo soneki (sembolde yoksa)
    ("S&P 500", "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "US", "Symbol", "Security", "GICS Sector", ""),
    ("S&P 400", "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies", "US", "Symbol", "Security", "GICS Sector", ""),
    ("S&P 600", "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies", "US", "Symbol", "Company", "GICS Sector", ""),
    ("EURO STOXX 50", "https://en.wikipedia.org/wiki/EURO_STOXX_50", "EU", "Ticker", "Name", "Sector", ""),
    ("DAX", "https://en.wikipedia.org/wiki/DAX", "EU", "Ticker", "Company", "Sector", ""),
    ("CAC 40", "https://en.wikipedia.org/wiki/CAC_40", "EU", "Ticker", "Company", "Sector", ""),
    ("FTSE 100", "https://en.wikipedia.org/wiki/FTSE_100_Index", "EU", "Ticker", "Company", "sector", ".L"),
    ("SMI", "https://en.wikipedia.org/wiki/Swiss_Market_Index", "EU", "Ticker", "Name", "Sector", ".SW"),
    ("AEX", "https://en.wikipedia.org/wiki/AEX_index", "EU", "Ticker", "Company", "Sector", ""),
    ("FTSE MIB", "https://en.wikipedia.org/wiki/FTSE_MIB", "EU", "Ticker", "Company", "Sector", ""),
    ("IBEX 35", "https://en.wikipedia.org/wiki/IBEX_35", "EU", "Ticker", "Company", "Sector", ""),
    ("OMX Stockholm 30", "https://en.wikipedia.org/wiki/OMX_Stockholm_30", "EU", "Ticker", "Company", "sector", ""),
]

universe, unmapped = {}, []
for idx, url, market, tcol, ncol, scol, suffix in SOURCES:
    try:
        t = pick(tables(url), [tcol, scol])
        tc, nc, sc = col(t, tcol), col(t, ncol, "Security", "Company", "Name"), col(t, scol)
    except Exception as e:
        print("hata", idx, e, file=sys.stderr)
        continue
    n = 0
    for _, r in t.iterrows():
        sym = re.sub(r"\[.*?\]", "", str(r[tc])).strip()
        if not sym or sym == "nan":
            continue
        if market == "US":
            sym = sym.replace(".", "-")  # BRK.B -> BRK-B (Yahoo)
        elif suffix and "." not in sym:
            sym = sym.rstrip(".") + suffix
        key = sector_key(r[sc])
        if not key:
            unmapped.append((idx, sym, r[sc]))
            continue
        if sym not in universe:
            universe[sym] = {"ticker": sym, "name": re.sub(r"\[.*?\]", "", str(r[nc])).strip(),
                             "market": market, "sector": key, "index": idx}
            n += 1
    print(f"{idx:18} {n} şirket")

if unmapped:
    print("sektörü eşlenemeyenler:", unmapped[:30], file=sys.stderr)
EXTRA = [["GLD", "SPDR Gold Shares", "US", "metals", "fund"], ["IAU", "iShares Gold Trust", "US", "metals", "fund"], ["SLV", "iShares Silver Trust", "US", "metals", "fund"], ["SIVR", "abrdn Silver ETF", "US", "metals", "fund"], ["GDX", "VanEck Gold Miners ETF", "US", "metals", "fund"], ["GDXJ", "VanEck Junior Gold Miners ETF", "US", "metals", "fund"], ["SIL", "Global X Silver Miners ETF", "US", "metals", "fund"], ["SILJ", "Amplify Junior Silver Miners ETF", "US", "metals", "fund"], ["GC=F", "Altın (vadeli)", "US", "metals", "fund"], ["SI=F", "Gümüş (vadeli)", "US", "metals", "fund"], ["4GLD.DE", "Xetra-Gold", "EU", "metals", "fund"], ["XAD5.MI", "Xtrackers Physical Gold", "EU", "metals", "fund"], ["NEM", "Newmont", "US", "metals", "stock"], ["AEM", "Agnico Eagle Mines", "US", "metals", "stock"], ["WPM", "Wheaton Precious Metals", "US", "metals", "stock"], ["FNV", "Franco-Nevada", "US", "metals", "stock"], ["GOLD", "Barrick Mining", "US", "metals", "stock"], ["KGC", "Kinross Gold", "US", "metals", "stock"], ["PAAS", "Pan American Silver", "US", "metals", "stock"], ["AG", "First Majestic Silver", "US", "metals", "stock"], ["HL", "Hecla Mining", "US", "metals", "stock"], ["CDE", "Coeur Mining", "US", "metals", "stock"], ["EXK", "Endeavour Silver", "US", "metals", "stock"], ["SSRM", "SSR Mining", "US", "metals", "stock"], ["FRES.L", "Fresnillo", "EU", "metals", "stock"], ["EDV.L", "Endeavour Mining", "EU", "metals", "stock"], ["HOC.L", "Hochschild Mining", "EU", "metals", "stock"], ["BOL.ST", "Boliden", "EU", "metals", "stock"], ["SPY", "SPDR S&P 500 ETF", "US", "finance", "fund"], ["QQQ", "Invesco QQQ (Nasdaq 100)", "US", "tech", "fund"], ["SMH", "VanEck Semiconductor ETF", "US", "tech", "fund"], ["ITA", "iShares US Aerospace & Defense ETF", "US", "industrials", "fund"], ["ICLN", "iShares Global Clean Energy ETF", "US", "utilities", "fund"], ["URA", "Global X Uranium ETF", "US", "energy", "fund"], ["XBI", "SPDR S&P Biotech ETF", "US", "health", "fund"], ["ARKK", "ARK Innovation ETF", "US", "tech", "fund"], ["EUNL.DE", "iShares Core MSCI World", "EU", "finance", "fund"], ["IS3N.DE", "iShares Core MSCI EM IMI", "EU", "finance", "fund"], ["DFEN.DE", "VanEck Defense UCITS ETF", "EU", "industrials", "fund"], ["QDVE.DE", "iShares S&P 500 IT Sector", "EU", "tech", "fund"]]
# Altın/gümüş, madenciler ve seçili fonlar/ETF'ler (endeks listelerinde yok, elle takip edilir)
for t, n, m, sec, typ in EXTRA:
    universe[t] = {"ticker": t, "name": n, "market": m, "sector": sec, "index": "Takip listesi", "type": typ}
rows = sorted(universe.values(), key=lambda x: (x["market"], x["ticker"]))
(root / "data/universe.json").write_text(json.dumps(
    {"updated": datetime.date.today().isoformat(), "count": len(rows), "companies": rows}, ensure_ascii=False))
print("toplam", len(rows))
