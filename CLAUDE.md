# Yatırım Radarı

Static PWA (index.html, i18n.js, app.js, style.css, sw.js) served by GitHub Pages from the repo root.
UI languages: Turkish and English (`i18n.js`; German strings remain in the file but are not offered). Visitors can only change the language; the design is fixed in the
"TASARIM AYARLARI" block at the top of `style.css` (do not add user-facing theme settings).

## Data

- `data/universe.json`: tracked companies (S&P 500/400/600 + major European indices), built monthly by `scripts/build_universe.py`.
- `data/sectors.json`: 11 sectors ranked by 3-month return of a US and a European sector ETF; top 10 are `active` (`scripts/update_sectors.py`).
- `data/insights.json`: news items. Two kinds:
  - automatic (`"auto": true`): written daily by `scripts/fetch_news.py` with keyword rules, headline/summary in the source language,
    `why`/`risk` come from category templates in `i18n.js`. `scripts/translate_items.py` turns headline/summary into
    `{"en": original, "tr": machine translation}` (free Google endpoint, no Claude). Kept 7 days. The scan runs 6 times a day (see the workflow).
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
    "headline":{"tr":"...","en":"..."},
    "summary":{"tr":"...","en":"..."},
    "why":{"tr":"...","en":"..."},
    "risk":{"tr":"...","en":"..."},
    "outlook":{"tr":"...","en":"..."},
    "precedent":{"tr":"...","en":"..."},
    "sources":[{"title":"Reuters – ...","url":"https://..."}]}
   ```
   - `sector` is a key from `data/sectors.json`; `ticker` is the Yahoo Finance symbol (e.g. `ASML.AS`, `SAP.DE`, `AZN.L`).
   - `why`: concretely why this could move the stock (e.g. "this contract is ~8% of annual revenue"). `risk`: what could go wrong.
   - `outlook` ("Bundan sonra ne olabilir?"): 2–4 sentences. Describe the upside scenario and the downside scenario and what
     each depends on, and name the next concrete things to watch with dates where known (next earnings date, regulatory decision,
     deal closing, analyst day). Say which scenario looks more likely given the facts and why, but never as a buy/sell call.
   - `precedent` ("Geçmişte benzer olaylar"): 2–3 sentences on comparable past events and how the stock or its peers reacted,
     with years and rough % moves (e.g. "When Pfizer bought Seagen in 2023, Seagen rose ~15% on the day; Pfizer fell ~3% over
     the following month."). Only use precedents you can verify through search; add their sources to `sources`. If none
     can be verified, write that there is no close precedent instead of inventing one.
   - The app separately shows statistics computed from the stock's own 2-year price history (fields `since`, `day`, `vol`,
     `hist` added by `scripts/update_prices.py`); do not write or edit those fields.
   - Short, plain language in Turkish and English (no German). Information only: never tell the reader to buy or sell.
   - If an automatic item covers the same event, remove that automatic item so it is not shown twice.
4. Do NOT run `scripts/update_prices.py` (Yahoo is blocked in the cloud sandbox; GitHub Actions refreshes prices several times a day).
   Validate all JSON in `data/` with `python3 -m json.tool`. Keep `data/insights.json` compact (`separators=(",",":")`, `ensure_ascii=False`),
   commit as "Haftalık Claude analizi YYYY-MM-DD" and push to `main`.
