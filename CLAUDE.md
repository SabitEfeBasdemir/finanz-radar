# Yatırım Radarı

Static PWA (index.html, app.js, style.css, sw.js) served by GitHub Pages from the repo root.
The UI is Turkish. Data lives in `data/insights.json` (news analysis) and `data/prices.json` (price history).

## Daily update (run by the scheduled cloud task)

1. Research the last ~24–48 hours of company news for listed companies and funds/ETFs in the US and Europe.
   Use reputable sources (Reuters, Bloomberg, FT, WSJ, CNBC, Handelsblatt, company press releases, SEC/regulatory filings).
   Look for: signed deals and partnerships, large orders/contracts, investments and funding rounds, government support or subsidies,
   M&A, buybacks, earnings surprises, guidance changes, regulatory approvals/bans, lawsuits, scandals, management changes,
   and sharp price moves with a clear reason.
2. Pick the 5–15 most meaningful events. Only include an event if at least one source confirms it; never invent or guess facts.
   If a rumour is widely reported but unconfirmed, say so in `summary` and use signal `watch`.
3. Prepend new items to `data/insights.json` `items` (newest first). Drop items older than 60 days. Do not duplicate an event already present.
   Set top-level `updated` to today's date (YYYY-MM-DD) and remove the `note` field.
   Each item:
   ```json
   {"ticker":"NVDA","name":"NVIDIA","market":"US|EU","type":"stock|fund","signal":"bullish|watch|bearish",
    "category":"Anlaşma|Yatırım|Devlet desteği|Satın alma|Geri alım|Bilanço|Yönetim|Dava/Skandal|Düzenleme|Ürün",
    "date":"YYYY-MM-DD","headline":"...","summary":"...","why":"...","risk":"...",
    "sources":[{"title":"Kaynak – başlık","url":"https://..."}]}
   ```
   - `ticker` must be the Yahoo Finance symbol (European ones with suffix, e.g. `ASML.AS`, `SAP.DE`, `MC.PA`, `NOVO-B.CO`).
   - Write `headline`, `summary`, `why` (why it could move the price), `risk` (what could go wrong) in Turkish, short and plain.
   - This is information, not investment advice: describe possible effects, never tell the reader to buy or sell.
4. Run `python3 scripts/update_prices.py` to refresh `data/prices.json` for every ticker.
5. Validate both JSON files parse (`python3 -m json.tool`), then commit as "Günlük güncelleme YYYY-MM-DD" and push to `main`.
