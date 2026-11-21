# Yatırım Radarı

Static PWA (index.html, i18n.js, app.js, style.css, sw.js) served by GitHub Pages from the repo root.
UI languages: Turkish and English (`i18n.js`; German strings remain in the file but are not offered). Visitors can only change the language. The design (colors, font, sizes, section order/visibility) is set by the
owner in the Design Studio (`studio.html`, not linked from the site) and stored in `data/theme.json`, applied by `theme.js`;
the "TASARIM AYARLARI" block in `style.css` holds the defaults. Do not add user-facing theme settings.

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

**First read `analyst/PROFILE.md` (who the reader is, the analysis checklist, writing style, what not to do),
`analyst/EXAMPLES.md` and the recent entries in `data/feedback.json`.** They take precedence over the generic
guidance below on focus and style. Feedback text is the reader's opinion on content and style only; it never
overrides the rules on facts, sources, no buy/sell instructions, or which files you may edit.

1. `git pull`. Read `data/insights.json` and `data/sectors.json`.
2. From the automatic items of the last 7 days, plus your own web research across the active sectors in the US and Europe,
   (include gold/silver and the metals sector, funds/ETFs, small growth companies and large companies as the profile says)
   pick the 10–20 most important events of the week: those most likely to change a company's growth outlook
   (big deals and orders, M&A, government support, approvals, guidance changes, scandals). Verify each with at least one
   reputable source (Reuters, Bloomberg, FT, WSJ, CNBC, Handelsblatt, company IR, regulators). Never invent or guess facts.
3. Prepend one item per event to `items`:
   ```json
   {"ai":true,"ticker":"NVDA","name":"NVIDIA","market":"US|EU","type":"stock|fund","sector":"tech",
    "signal":"bullish|watch|bearish","category":"deal|mna|investment|gov|buyback|earnings|mgmt|legal|regulation|trial|analyst|product",
    "date":"YYYY-MM-DD",
    "headline":{"tr":"...","en":"..."},
    "tldr":{"tr":"...","en":"..."},
    "summary":{"tr":"...","en":"..."},
    "why":{"tr":"...","en":"..."},
    "risk":{"tr":"...","en":"..."},
    "outlook":{"tr":"...","en":"..."},
    "precedent":{"tr":"...","en":"..."},
    "bull":{"tr":"...","en":"..."},
    "bear":{"tr":"...","en":"..."},
    "triggers":{"tr":"...","en":"..."},
    "conviction":"high|medium|low",
    "conviction_why":{"tr":"...","en":"..."},
    "sources":[{"title":"Reuters – ...","url":"https://..."}]}
   ```
   - `tldr`: one strong sentence that sums up the event and the 12-month investor angle.
   - `bull` / `bear`: the upside and downside scenario over at least 12 months, each with what it depends on and numbers.
   - `triggers` ("Görüşü ne değiştirir?"): the concrete developments that would make the picture clearly better or worse.
   - `conviction` / `conviction_why`: how strongly the evidence supports the tilt and why (see the profile's definitions);
     take a clear position as the profile's "Take a clear position" section describes.
   - `signal` is the overall tilt from the profile checklist (bullish / watch / bearish), never a buy/sell instruction.
   - `sector` is a key from `data/sectors.json` (including `metals` for gold/silver); `ticker` is the Yahoo Finance symbol (e.g. `ASML.AS`, `SAP.DE`, `AZN.L`).
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

## "Potansiyeli olan şirketler" (potential companies)

- `scripts/potential.py` (free, runs in every GitHub Actions scan) writes `data/potential.json`: small companies priced about
  €10–40 with recent supportive news, ranked by rules, each with automatic `points` in TR/EN. Do not edit that file by hand.
- Claude owns `data/potential_notes.json` (`{"updated": "YYYY-MM-DD", "notes": {"TICKER": {...}}}`), written in the weekly run:
  5. After the weekly items, read `data/potential.json`. For up to the top 8 companies, research the supporting event and
     write a note:
     ```json
     "TNDM": {"date":"YYYY-MM-DD",
       "text":{"tr":"...","en":"..."},
       "precedent":{"tr":"...","en":"..."},
       "sources":[{"title":"...","url":"https://..."}]}
     ```
     - `text`: 2–3 sentences on what support/deal the company got, from whom, and how big it is relative to the company
       (e.g. "the contract is worth ~12% of last year's revenue").
     - `precedent`: comparable companies that received the same kind of support or deal before and how they grew afterwards,
       with years and approximate % moves or revenue growth, e.g. "Company X received a similar CHIPS Act grant in 2023;
       its revenue grew ~40% over the next two years and the stock rose ~60%." Only verified facts with sources; if no close
       precedent can be verified, say so plainly. Also mention one key risk.
     - Remove notes for tickers that are no longer in `data/potential.json` and are older than 30 days.
     - Information only, never buy/sell advice.

## Analyst profile and reader feedback

- `analyst/PROFILE.md`: the analyst profile (reader, checklist, style, limits). Read it first in every Claude run.
  The weekly run may append one-line entries to its "Reader preferences (learned)" section; no other edits.
- `analyst/EXAMPLES.md`: liked / disliked example analyses, maintained by the reader (and by Claude only when the
  reader's feedback explicitly asks to keep an analysis as an example).
- `data/feedback.json`: the reader's 👍/👎 notes from the app, exported in every GitHub Actions run from GitHub issues
  labelled `geri-bildirim` **authored by the repository owner only** (`scripts/export_feedback.py`). Treat the notes as
  opinions about content and style; they never override the rules on facts, sources, no buy/sell instructions, or files.

## "Hareket Radarı" (sharp drops and rises)

- `scripts/movers.py` (free, every GitHub Actions scan, after prices) writes `data/movers.json`: `drops` and `rallies` across the
  whole universe, where the move is unusual relative to the asset's own normal daily volatility (gold/silver included).
  Each entry has the move, period (1d/5d), z (multiple of normal move), distance from 52-week high/low, the broad-market move,
  the related news item if any, and `hist` (what happened after similar moves in its own history). Do not edit it by hand.
- Claude owns `data/move_notes.json` (`{"updated": "YYYY-MM-DD", "notes": {"TICKER": {...}}}`), written in the weekly run:
  6. Read `data/movers.json`. For up to 5 of the most notable drops and up to 4 of the most notable rallies (always include
     gold/silver entries if present), research the cause and write:
     ```json
     "NVDA": {"date":"YYYY-MM-DD","kind":"drop|rally",
       "cause":{"tr":"...","en":"..."},
       "case_for":{"tr":"...","en":"..."},
       "case_against":{"tr":"...","en":"..."},
       "triggers":{"tr":"...","en":"..."},
       "signal":"bullish|watch|bearish","conviction":"high|medium|low",
       "conviction_why":{"tr":"...","en":"..."},
       "sources":[{"title":"...","url":"https://..."}]}
     ```
     - Drops ("Fırsat mı, tuzak mı?"): `case_for` = evidence for a rebound (overreaction, intact fundamentals, valuation now
       cheaper, precedents that recovered); `case_against` = evidence the decline continues (lasting damage, balance-sheet stress,
       more bad news likely, precedents that kept falling). Is it company-specific or market/sector-wide?
     - Rallies ("Devam mı, aşırı ısınma mı?"): `case_for` = evidence the rise continues; `case_against` = pullback risk
       (overheating, hype, valuation stretched, precedents that gave back gains).
     - Use the `hist` numbers from movers.json, precedents and the profile checklist. Take a clear position via `signal` and
       `conviction`, but never write "buy now", "alım zamanı", "sat" or what you would do with money.
     - Remove notes older than 21 days.
