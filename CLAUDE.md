# Yatırım Radarı

Static PWA (index.html, i18n.js, app.js, style.css, sw.js) served by GitHub Pages from the repo root.
UI languages: Turkish, German, English (`i18n.js`). Visitors can only change the language; the design is fixed in the
"TASARIM AYARLARI" block at the top of `style.css` (do not add user-facing theme settings).

## Data

- `data/universe.json`: tracked companies (S&P 500/400/600 + major European indices), built monthly by `scripts/build_universe.py`.
- `data/sectors.json`: 11 sectors ranked by 3-month return of a US and a European sector ETF; top 10 are `active` (`scripts/update_sectors.py`).
- `data/insights.json`: news items. Two kinds:
  - automatic (`"auto": true`): written daily by `scripts/fetch_news.py` with keyword rules, headline/summary in the source language,
    `why`/`risk` come from category templates in `i18n.js`. Kept 14 days.
  - Claude analysis (`"ai": true`): written weekly by the Claude routine below. Kept 60 days.
- `data/prices.json`: 6-month closes for every ticker in insights (`scripts/update_prices.py`).

The daily free update runs in GitHub Actions (`.github/workflows/daily.yml`), not Claude.

## Weekly Claude analysis (run by the scheduled cloud routine)

1. `git pull`. Read `data/insights.json` and `data/sectors.json`.
2. From the automatic items of the last 7 days, plus your own web research across the active sectors in the US and Europe,
   pick the 10–20 most important events of the week: those most likely to change a company's growth outlook
   (big deals and orders, M&A, government support, approvals, guidance changes, scandals). Verify each with at least one
   reputable source (Reuters, Bloomberg, FT, WSJ, CNBC, Handelsblatt, company IR, regulators). Never invent or guess facts.
3. Prepend one item per event to `items`:
   ```json
   {"ai":true,"ticker":"NVDA","name":"NVIDIA","market":"US|EU","type":"stock|fund","sector":"tech",
    "signal":"bullish|watch|bearish","category":"deal|mna|investment|gov|buyback|earnings|mgmt|legal|regulation|trial|analyst|product",
    "date":"YYYY-MM-DD",
    "headline":{"tr":"...","de":"...","en":"..."},
    "summary":{"tr":"...","de":"...","en":"..."},
    "why":{"tr":"...","de":"...","en":"..."},
    "risk":{"tr":"...","de":"...","en":"..."},
    "sources":[{"title":"Reuters – ...","url":"https://..."}]}
   ```
   - `sector` is a key from `data/sectors.json`; `ticker` is the Yahoo Finance symbol (e.g. `ASML.AS`, `SAP.DE`, `AZN.L`).
   - `why`: concretely why this could move the stock (e.g. "this contract is ~8% of annual revenue"). `risk`: what could go wrong.
   - Short, plain language in all three languages. Information only: never tell the reader to buy or sell.
   - If an automatic item covers the same event, remove that automatic item so it is not shown twice.
4. Run `python3 scripts/update_prices.py`, validate all JSON in `data/` with `python3 -m json.tool`,
   commit as "Haftalık Claude analizi YYYY-MM-DD" and push to `main`.
