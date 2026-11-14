# Yatırım Radarı

Static PWA (index.html, app.js, style.css, sw.js) served by GitHub Pages from the repo root.
The UI is Turkish. Data files:
- `data/sectors.json`: sectors ranked by 3-month return of a US and a European sector ETF (written by `scripts/update_sectors.py`).
- `data/insights.json`: news analysis items (written by the daily task).
- `data/prices.json`: 6-month price history for every ticker in insights (written by `scripts/update_prices.py`).

## Daily update (run by the scheduled cloud task)

Goal: cover the whole investable universe of publicly listed companies and funds/ETFs in the US and Europe
(NYSE, Nasdaq, and European exchanges such as Xetra, Euronext, LSE, SIX, Borsa Italiana, BME, Nasdaq Nordic),
organised by sector, and surface every company where something happened that could move the share price.

1. Run `python3 scripts/update_sectors.py`. Read `data/sectors.json`; the sectors with `"active": true` are today's top 10 by return.
2. Research each active sector, in parallel (one subagent per sector if the Agent tool is available). For each sector, cover the
   last ~24–48 hours in both the US and Europe, small/mid caps as well as large caps:
   - sector news searches (e.g. "<sector> stocks news today", "<sector> Aktien News", "STOXX 600 <sector>"), plus company press releases
     and regulatory filings (SEC 8-K, EU ad-hoc/Ad-hoc-Mitteilung, RNS);
   - the day's biggest gainers and losers in that sector on both sides of the Atlantic, and *why* they moved;
   - event types: signed deals and partnerships, large orders/contracts, investments and funding rounds, government support or subsidies,
     M&A, buybacks, earnings surprises, guidance changes, regulatory approvals/bans, clinical-trial results, lawsuits, scandals,
     management changes, index inclusions, analyst up/downgrades with a clear rationale.
   Aim for 5–10 events per sector (≈50–100 per day). Quality over count: skip routine noise, but do not stop at the obvious mega caps.
   Prefer reputable sources (Reuters, Bloomberg, FT, WSJ, CNBC, MarketWatch, Barron's, Handelsblatt, Les Echos, Il Sole 24 Ore,
   company IR pages, regulators). Only include an event if at least one source confirms it; never invent or guess facts.
   If a rumour is widely reported but unconfirmed, say so in `summary` and use signal `watch`.
3. Prepend new items to `data/insights.json` `items` (newest first). Drop items older than 30 days. Do not duplicate an event already present.
   Set top-level `updated` to today's date (YYYY-MM-DD) and remove the `note` field.
   Each item:
   ```json
   {"ticker":"NVDA","name":"NVIDIA","market":"US|EU","type":"stock|fund","sector":"tech",
    "signal":"bullish|watch|bearish",
    "category":"Anlaşma|Yatırım|Devlet desteği|Satın alma|Geri alım|Bilanço|Yönetim|Dava/Skandal|Düzenleme|Ürün|Klinik çalışma|Analist",
    "date":"YYYY-MM-DD","headline":"...","summary":"...","why":"...","risk":"...",
    "sources":[{"title":"Kaynak – başlık","url":"https://..."}]}
   ```
   - `sector` is a `key` from `data/sectors.json` (tech, health, energy, finance, industrials, discretionary, staples, communication,
     materials, utilities, realestate).
   - `ticker` must be the Yahoo Finance symbol (European ones with exchange suffix, e.g. `ASML.AS`, `SAP.DE`, `MC.PA`, `NOVO-B.CO`, `AZN.L`).
   - Write `headline`, `summary`, `why` (why it could move the price), `risk` (what could go wrong) in Turkish, short and plain.
   - This is information, not investment advice: describe possible effects, never tell the reader to buy or sell.
4. Run `python3 scripts/update_prices.py` to refresh `data/prices.json` for every ticker.
5. Validate the three JSON files parse (`python3 -m json.tool`), then commit as "Günlük güncelleme YYYY-MM-DD" and push to `main`.
