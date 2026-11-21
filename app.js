const $ = s => document.querySelector(s);
// Tasarım: kayıtlı temayı uygula; Tasarım Stüdyosu'nun önizlemesindeysek oradan gelen ayarları canlı uygula
const IN_STUDIO = /[?&]studio=1/.test(location.search);   // Tasarım Stüdyosu önizlemesi: tema sadece stüdyodan gelir
if (!IN_STUDIO) Theme.load();
addEventListener('message', e => {
  if (e.origin === location.origin && e.data && e.data.type === 'radar-theme') Theme.apply(e.data.theme);
});
const LANGS = ['tr', 'en'];
const LI = { tr: 0, de: 1, en: 2 };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
let lang = (() => {
  const l = store.get('lang');
  return LANGS.includes(l) ? l : ((navigator.language || '').startsWith('en') ? 'en' : 'tr');
})();

// Uygulama durumu
let items = [], prices = {}, sectors = [], updated = '', potential = [], potNotes = {};
const F = { q: '', signal: '', market: '', source: '', type: '', category: '', sector: '' };
const PAGE = 40;
let shown = PAGE, view = [];

const T = () => I18N[lang];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//.test(u) ? u : '#';
const L = v => v && typeof v === 'object' ? (v[lang] || v.tr || v.en || v.de || '') : (v || '');
const secName = k => SECTOR_NAMES[k] ? SECTOR_NAMES[k][LI[lang]] : (k || '');
const catName = k => CATS[k] ? CATS[k].name[LI[lang]] : (k || '');
const num = (v, d = 1) => v.toLocaleString(lang, { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v)) + '%';
const SECTOR_HUE = { tech: 215, health: 160, energy: 30, finance: 260, industrials: 200, discretionary: 330, staples: 90, communication: 285, materials: 45, utilities: 185, realestate: 10, metals: 50 };
const SIG_ICON = { bullish: '▲', watch: '●', bearish: '▼' };

function dayLabel(d) {
  const t = T();
  if (!d) return '';
  const diff = Math.round((new Date(new Date().toDateString()) - new Date(d + 'T00:00:00')) / 864e5);
  if (diff <= 0) return t.todayCap;
  if (diff === 1) return t.yesterday;
  if (diff < 7) return t.ago(diff);
  return new Date(d + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' });
}

// ---------- Veri ----------
async function load() {
  $('#list').innerHTML = Array.from({ length: 4 }, () => '<div class="card skel"><div></div><div></div><div></div></div>').join('');
  let pot, notes;
  const [i, p, s] = await Promise.all([
    fetch('data/insights.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('data/prices.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ tickers: {} })),
    fetch('data/sectors.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ sectors: [] })),
    fetch('data/potential.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ companies: [] })),
    fetch('data/potential_notes.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ notes: {} })),
  ]).then(r => { [, , , pot, notes] = r; return r; });
  items = (i.items || []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (!!b.ai - !!a.ai) || Math.abs(b.move || 0) - Math.abs(a.move || 0));
  prices = p.tickers || {}; sectors = s.sectors || []; updated = i.updated || '';
  potential = pot.companies || []; potNotes = notes.notes || {};
  applyLang();
}

// ---------- Küçük parçalar ----------
function avatar(x) {
  const h = SECTOR_HUE[x.sector] ?? 215;
  const txt = x.ticker.replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase();
  return `<span class="av" style="--h:${h}">${esc(txt)}</span>`;
}
function spark(tk, n = 30) {
  const h = (prices[tk] || {}).history;
  if (!h || h.length < 3) return '';
  const v = h.slice(-n).map(x => x[1]), mn = Math.min(...v), mx = Math.max(...v), W = 72, H = 26;
  const pts = v.map((y, i) => `${(i * W / (v.length - 1)).toFixed(1)},${(H - 2 - (y - mn) / ((mx - mn) || 1) * (H - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark ${v.at(-1) >= v[0] ? 'up' : 'dn'}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
// İkna derecesi: 3 çubuklu gösterge
const convTag = (c, withLabel = true) => !['high', 'medium', 'low'].includes(c) ? '' :
  `<span class="conv c-${c}" title="${esc(T().conv)}"><i></i><i></i><i></i>${withLabel ? `${esc(T().conv)}: ` : ''}<b>${esc(T().convL[c])}</b></span>`;
const sigTag = s => `<span class="sig s-${esc(s)}"><i>${SIG_ICON[s] || ''}</i>${esc(T().sig[s] || s)}</span>`;
const moveTag = m => m == null ? '' : `<span class="mv ${m >= 0 ? 'up' : 'dn'}">${pct(m)}</span>`;

function seg(id, opts, val, key) {
  $(id).innerHTML = opts.map(([v, l]) => `<button data-k="${key}" data-v="${esc(v)}" class="${v === val ? 'on' : ''}">${esc(l)}</button>`).join('');
}

// ---------- Ekran ----------
function applyLang() {
  const t = T();
  document.documentElement.lang = lang; document.title = t.title;
  $('#title').textContent = t.title;
  [...$('#lang').children].forEach(b => b.classList.toggle('on', b.dataset.v === lang));
  $('#q').placeholder = t.search; $('#ftxt').textContent = t.filters;
  $('#secTitle').textContent = t.sectorsTitle; $('#secSub').textContent = t.sectorsSub;
  $('#featTitle').textContent = t.featured; $('#featSub').textContent = t.featuredSub;
  $('#foot').textContent = t.foot; fsUi(); a2hsUi(); instUi(); $('#totop').setAttribute('aria-label', t.top);
  renderAll();
}

function renderAll() { renderControls(); renderPotential(); renderMood(); renderSectors(); renderFeatured(); render(); }

// ---------- Potansiyeli olan şirketler ----------
function miniSpark(v) {
  if (!v || v.length < 3) return '';
  const mn = Math.min(...v), mx = Math.max(...v), W = 72, H = 26;
  const pts = v.map((y, i) => `${(i * W / (v.length - 1)).toFixed(1)},${(H - 2 - (y - mn) / ((mx - mn) || 1) * (H - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark ${v.at(-1) >= v[0] ? 'up' : 'dn'}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
const eur = v => v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const sizeTag = r => r.index === 'S&P 600' ? T().small : r.index === 'S&P 400' ? T().mid : '';
function renderPotential() {
  const t = T();
  $('#potTitle').textContent = t.potTitle; $('#potSub').textContent = t.potSub;
  const list = potential.filter(r => !F.market || r.market === F.market);
  $('#potBlock').hidden = !list.length;
  if (!list.length) return;
  $('#pot').innerHTML = list.map(r => {
    const note = potNotes[r.ticker], first = (r.points[lang] || r.points.tr || [])[0] || '';
    return `<article class="pcard" data-pot="${esc(r.ticker)}" tabindex="0">
      <div class="fc-top">${avatar(r)}<div class="who"><b>${esc(r.ticker)}</b><span>${esc(r.name)}</span></div>${miniSpark(r.spark)}</div>
      <div class="p-price"><b>${eur(r.eur)}</b>${r.m1 != null ? `<span class="mv ${r.m1 >= 0 ? 'up' : 'dn'}">${pct(r.m1)} <i>${esc(t.m1)}</i></span>` : ''}</div>
      <p>${esc(first.replace(/^[^:]+:\s*/, ''))}</p>
      <div class="meta">${(r.cats || []).slice(0, 2).map(c => `<span class="pill">${esc(catName(c))}</span>`).join('')}
        ${sizeTag(r) ? `<span class="pill ghost">${esc(sizeTag(r))}</span>` : ''}
        ${note ? `<span class="pill ai"><svg class="ic"><use href="#i-spark"/></svg>${esc(T().radarShort)}</span>` : ''}</div>
    </article>`;
  }).join('');
}
let potOpen = null;
function openPotential(tk) {
  const r = potential.find(x => x.ticker === tk); if (!r) return;
  potOpen = tk;
  const t = T(), note = potNotes[tk], pts = r.points[lang] || r.points.tr || [];
  const related = items.filter(x => x.ticker === tk).slice(0, 6);
  detailItem = { ticker: tk, date: r.lead_date };
  $('#sheetBody').innerHTML = `
    <div class="grab"></div>
    <div class="d-head">${avatar(r)}<div class="who"><b>${esc(tk)}</b><span>${esc(r.name)} · ${esc(t[r.market] || r.market || '')}${r.index ? ' · ' + esc(r.index) : ''}</span></div>
      <button class="icon-btn" id="closeSheet" aria-label="${esc(t.close)}"><svg class="ic"><use href="#i-x"/></svg></button></div>
    <div class="meta" style="margin-top:12px"><span class="pill rocket"><svg class="ic"><use href="#i-rocket"/></svg>${esc(t.potTitle)}</span>
      ${sizeTag(r) ? `<span class="pill ghost">${esc(sizeTag(r))}</span>` : ''}<span class="pill ghost">${esc(secName(r.sector))}</span></div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><span>€</span><b>${eur(r.eur)}</b></div>
      <div class="stat"><span>${esc(t.m1)}</span><b class="${(r.m1 ?? 0) >= 0 ? 'up' : 'dn'}">${pct(r.m1)}</b></div>
      <div class="stat"><span>${esc(t.m3)}</span><b class="${(r.m3 ?? 0) >= 0 ? 'up' : 'dn'}">${pct(r.m3)}</b></div></div>
    <div class="panel potwhy"><h4>${esc(t.potWhy)}</h4><ul>${pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    ${note ? `<div class="panel prec"><h4>${esc(t.potNote)}</h4>${L(note.text) ? `<p>${esc(L(note.text))}</p>` : ''}${L(note.precedent) ? `<p style="margin-top:8px">${esc(L(note.precedent))}</p>` : ''}
      ${(note.sources || []).length ? `<div class="srcs" style="margin-top:10px">${note.sources.map(s => `<a class="src" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener"><span>${esc(s.title)}</span><svg class="ic"><use href="#i-ext"/></svg></a>`).join('')}</div>` : ''}</div>` : ''}
    <div class="panel chart" id="cx"><div class="cx-loading"></div></div>
    <div id="cxStats"></div>
    <div id="calc"></div>
    ${related.length ? `<h4 class="src-h">${esc(t.potNews)}</h4><div class="rel">${related.map(card).join('')}</div>` : ''}
    <p class="h-note" style="margin-top:14px">${esc(t.potRisk)}</p>`;
  const d = $('#sheet'); if (!d.open) d.showModal(); $('#sheetBody').scrollTop = 0;
  mountChart(detailItem);
}

function renderControls() {
  const t = T();
  seg('#fm', [['', t.all], ['US', t.US], ['EU', t.EU]], F.market, 'market');
  seg('#fo', [['ai', t.radarShort], ['auto', t.auto]], F.source, 'source');  // aktif olana tekrar dokununca kapanır
  const n = ['type', 'category', 'sector', 'signal'].filter(k => F[k]).length;
  $('#fcount').hidden = !n; $('#fcount').textContent = n;
}

function base(except) {
  return items.filter(x => (except === 'signal' || !F.signal || x.signal === F.signal)
    && (!F.market || x.market === F.market) && (!F.type || x.type === F.type) && (!F.category || x.category === F.category)
    && (!F.sector || x.sector === F.sector) && (!F.source || (F.source === 'ai' ? !x.auto : x.auto))
    && (!F.q || (x.ticker + ' ' + x.name + ' ' + secName(x.sector) + ' ' + L(x.headline)).toLowerCase().includes(F.q)));
}

function renderMood() {
  const t = T(), b = base('signal'), c = s => b.filter(x => x.signal === s).length;
  $('#mood').innerHTML = ['bullish', 'watch', 'bearish'].map(s => `
    <button class="tile t-${s}${F.signal === s ? ' on' : ''}" data-k="signal" data-v="${s}">
      <b>${SIG_ICON[s]} ${c(s)}</b><span>${esc(t.sig[s])}</span></button>`).join('');
}

function renderSectors() {
  const t = T();
  if (!sectors.length) { $('#secBlock').hidden = true; return; }
  const max = Math.max(...sectors.map(s => Math.abs(s.score || 0)), 1);
  $('#sec').innerHTML = `<button class="chip${!F.sector ? ' on' : ''}" data-k="sector" data-v=""><span>${esc(t.allSectors)}</span><b>${items.length}</b><i>${esc(t.news)}</i></button>` +
    sectors.map(s => {
      const n = items.filter(x => x.sector === s.key).length, w = Math.round(Math.abs(s.score || 0) / max * 100);
      return `<button class="chip${s.key === F.sector ? ' on' : ''}${s.active ? '' : ' off'}" data-k="sector" data-v="${esc(s.key)}" style="--h:${SECTOR_HUE[s.key] ?? 215}">
        <span><em>${s.rank}</em>${esc(secName(s.key))}</span><b class="${(s.score || 0) >= 0 ? 'up' : 'dn'}">${pct(s.score)}</b>
        <u class="bar"><u class="${(s.score || 0) >= 0 ? 'up' : 'dn'}" style="width:${w}%"></u></u><i>${n} ${esc(t.news)}</i></button>`;
    }).join('');
}

function renderFeatured() {
  const t = T();
  const ai = items.filter(x => x.ai && (!F.market || x.market === F.market) && (!F.sector || x.sector === F.sector)).slice(0, 12);
  const show = ai.length && !F.q && F.source !== 'auto';
  $('#featBlock').hidden = !show;
  if (!show) return;
  const last = ai.map(x => x.date).sort().at(-1);
  $('#featBadge').textContent = `${t.weekly}${last ? ' · ' + new Date(last + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'long' }) : ''}`;
  $('#feat').innerHTML = ai.map(x => `
    <article class="fcard" data-id="${esc(itemKey(x))}" tabindex="0">
      <div class="fc-top">${avatar(x)}<div class="who"><b>${esc(x.ticker)}</b><span>${esc(x.name)}</span></div>${sigTag(x.signal)}</div>
      <h3>${esc(L(x.headline))}</h3>
      <p>${esc(L(x.tldr) || L(x.why))}</p>
      ${convTag(x.conviction)}
      <div class="meta"><span class="pill">${esc(secName(x.sector))}</span>${x.since ? `<span class="pill ${x.since.pct >= 0 ? 'upbg' : 'dnbg'}">${esc(HIST[lang].since)} ${pct(x.since.pct)}</span>` : ''}<span>${esc(dayLabel(x.date))}</span></div>
    </article>`).join('');
}

const itemKey = x => x.id || (x.ticker + '|' + x.date + '|' + L(x.headline)).slice(0, 120);

function card(x) {
  const t = T();
  return `<article class="card${x.ai ? ' is-ai' : ''}" data-id="${esc(itemKey(x))}" tabindex="0">
    <div class="c-top">${avatar(x)}
      <div class="who"><b>${esc(x.ticker)}</b><span>${esc(x.name)} · ${esc(t[x.market] || x.market)}</span></div>
      <div class="c-right">${spark(x.ticker)}${moveTag(x.move)}</div>
    </div>
    <h3>${esc(L(x.headline))}</h3>
    <div class="meta">${sigTag(x.signal)}<span class="pill">${esc(catName(x.category))}</span>${x.sector ? `<span class="pill ghost">${esc(secName(x.sector))}</span>` : ''}
      ${x.ai ? `<span class="pill ai"><svg class="ic"><use href="#i-spark"/></svg>${esc(T().radarShort)}</span>` : ''}</div>
  </article>`;
}

function render() {
  const t = T();
  view = base();
  $('#upd').textContent = `${t.updated}: ${updated ? new Date(updated + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'long' }) : '—'}`;
  if (!view.length) { $('#list').innerHTML = `<div class="empty"><b>${esc(t.empty)}</b><button class="btn" id="resetAll">${esc(t.clear)}</button></div>`; return; }
  let html = `<div class="list-h"><h2>${esc(t.feed)}</h2><span class="muted">${esc(t.results(view.length))}</span></div>`, last = null;
  for (const x of view.slice(0, shown)) {
    const d = dayLabel(x.date);
    if (d !== last) { html += `<div class="day">${esc(d)}</div>`; last = d; }
    html += card(x);
  }
  if (view.length > shown) html += `<button class="btn more" id="more">${esc(t.more)} · ${view.length - shown}</button>`;
  $('#list').innerHTML = html;
}

// ---------- "Yatırsaydın ne olurdu?" (avro bazında, iki tarihteki kurla) ----------
const CCY = { L: ['GBP', 100], SW: ['CHF', 1], ST: ['SEK', 1], CO: ['DKK', 1], OL: ['NOK', 1] };
const EUR_SUFFIX = new Set(['DE', 'PA', 'AS', 'MI', 'MC', 'HE', 'BR', 'LS', 'VI', 'IR', 'F']);
function ccyOf(tk) {
  const suf = tk.includes('.') ? tk.split('.').pop() : '';
  if (EUR_SUFFIX.has(suf)) return ['EUR', 1];
  return CCY[suf] || ['USD', 1];
}
const fxCache = {};
// EUR->döviz kuru: son 2 yıl günlük (data/p), daha eskisi aylık (data/m)
function fxSeries(ccy) {
  if (ccy === 'EUR') return Promise.resolve(null);
  const get = f => fetch(f).then(r => r.ok ? r.text() : '').catch(() => '');
  return fxCache[ccy] ||= Promise.all([get(`data/m/EUR${ccy}=X.csv`), get(`data/p/EUR${ccy}=X.csv`)]).then(([m, d]) => {
    const map = new Map();
    for (const t of [m, d]) for (const l of t.split('\n').slice(1)) { const [k, v] = l.split(','); if (k && v) map.set(k, +v); }
    return new Map([...map.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1));
  });
}
const valueOn = (m, d) => { if (!m || !m.size) return null; let best = null; for (const [k, v] of m) { if (k <= d) best = v; else break; } return best ?? m.values().next().value; };
// fiyat geçmişi: aylık (borsaya açılıştan) + günlük (son 2 yıl) birleşik, tarih sıralı
function priceMap(sets) {
  const m = new Map();
  if (sets.max) sets.max.d.forEach((d, i) => m.set(d, sets.max.c[i]));
  sets.daily.d.forEach((d, i) => m.set(d, sets.daily.c[i]));
  return new Map([...m.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1));
}
let calcAmt = +(store.get('calcAmt') || 1000), calcPer = 'y1', calcDate = '', calcCtx = null;
async function renderCalc(tk, sets) {
  const box = $('#calc'); if (!box || !sets?.daily || sets.daily.c.length < 2) return;
  calcCtx = { tk, sets };
  const t = T(), [ccy, div] = ccyOf(tk), fx = await fxSeries(ccy), pm = priceMap(sets);
  const first = pm.keys().next().value, end = sets.daily.d.at(-1);
  const days = { m1: 31, m6: 183, y1: 365, y2: 730 }[calcPer];
  let startD = calcDate || new Date(new Date(end + 'T00:00:00') - days * 864e5).toISOString().slice(0, 10);
  if (startD < first) startD = first;
  if (startD > end) startD = end;
  // başlangıç: seçilen tarihteki veya hemen sonraki ilk kapanış
  let d0 = null, c0 = null; for (const [k, v] of pm) { if (k >= startD) { d0 = k; c0 = v; break; } }
  const fmtE = v => v.toLocaleString(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
  const per = Object.entries(t.calcAgo).map(([k, l]) => `<button class="${!calcDate && k === calcPer ? 'on' : ''}" data-cp="${k}">${l}</button>`).join('');
  let body;
  if (!d0 || d0 >= end) body = `<p class="muted">${esc(t.calcShort)}</p>`;
  else {
    const p0 = c0 / div, p1 = sets.daily.c.at(-1) / div;
    const r0 = valueOn(fx, d0) || 1, r1 = valueOn(fx, end) || 1;
    const val = calcAmt * (p1 / r1) / (p0 / r0), pl = val - calcAmt, chg = (val / calcAmt - 1) * 100;
    const stockPct = (p1 / p0 - 1) * 100, fxPct = ccy === 'EUR' ? 0 : (r0 / r1 - 1) * 100;
    const r1d = v => Math.round(v * 10) / 10;
    const dTxt = new Date(d0 + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
    const yrs = (new Date(end) - new Date(d0)) / 3.156e10, ann = yrs >= 1 ? (Math.pow(val / calcAmt, 1 / yrs) - 1) * 100 : null;
    body = `<p class="c-line">${esc(t.calcLine2(fmtE(calcAmt), dTxt))}</p>
      <div class="c-res"><b class="${pl >= 0 ? 'up' : 'dn'}">${fmtE(val)}</b>
        <span class="pill ${pl >= 0 ? 'upbg' : 'dnbg'}">${pl >= 0 ? t.calcProfit : t.calcLoss}: ${pl >= 0 ? '+' : '−'}${fmtE(Math.abs(pl))} (${pct(r1d(chg))})</span></div>
      <div class="c-split">${ccy !== 'EUR' ? `<span>${esc(t.calcStock)} (${ccy}) <b class="${stockPct >= 0 ? 'up' : 'dn'}">${pct(r1d(stockPct))}</b></span><span>${esc(t.calcFx)} <b class="${fxPct >= 0 ? 'up' : 'dn'}">${pct(r1d(fxPct))}</b></span>` : ''}
        ${ann != null ? `<span>${esc(t.calcAnn)} <b class="${ann >= 0 ? 'up' : 'dn'}">${pct(r1d(ann))}</b></span>` : ''}</div>`;
  }
  box.innerHTML = `<div class="panel calc"><h4>${esc(t.calcTitle)}</h4>
    <div class="c-ctrl">
      <label class="c-field"><span>${esc(t.calcAmtL)}</span><span class="c-amt"><input id="calcAmt" type="number" inputmode="decimal" min="1" step="any" value="${calcAmt}"><i>€</i></span></label>
      <label class="c-field"><span>${esc(t.calcFrom)}</span><input id="calcDate" type="date" min="${first}" max="${end}" value="${d0 || startD}"></label>
    </div>
    <div class="seg sm c-per">${per}</div>
    ${body}<p class="h-note">${esc(t.calcNote)}</p></div>`;
}

// ---------- Detay penceresi ----------
let detailItem = null, chartObj = null;
// Detay grafiği: 2 yıllık veriyi yükle, etkileşimli grafiği kur (chart.js). Olmazsa son 30 güne düş.
async function mountChart(x) {
  const box = $('#cx'), st = $('#cxStats'); if (!box) return;
  chartObj?.destroy?.(); chartObj = null;
  let sets;
  try { sets = await Chart.load(x.ticker); } catch (e) {
    const h = (prices[x.ticker] || {}).history; if (h) sets = { daily: { d: h.map(r => r[0]), c: h.map(r => r[1]) } };
  }
  if (detailItem !== x || !document.body.contains(box)) return;
  if (!sets || !sets.daily || sets.daily.c.length < 2) { box.innerHTML = `<div class="muted pad">${esc(T().noPrice)}</div>`; return; }
  chartObj = Chart.mount(box, sets, { lang, newsDate: x.date });
  st.innerHTML = statTiles(sets.daily);
  calcPer = 'y1'; calcDate = ''; renderCalc(x.ticker, sets);   // tutar oturum boyunca hatırlanır
}
function statTiles(series) {
  if (!series || series.c.length < 2) return '';
  const s = T().st, v = series.c, last = v.at(-1), at = n => v[Math.max(0, v.length - 1 - n)];
  const yr = v.slice(-252);
  const ch = n => Math.round((last / at(n) - 1) * 1000) / 10, f = x => num(x, 2);
  const tile = (l, val, cls = '') => `<div class="stat"><span>${l}</span><b class="${cls}">${val}</b></div>`;
  const c = n => tile(s[n === 1 ? 'd1' : n === 5 ? 'w1' : 'm1'], pct(ch(n)), ch(n) >= 0 ? 'up' : 'dn');
  return `<div class="stats">${tile(s.last, f(last))}${c(1)}${c(5)}${c(21)}${tile(s.hi52, f(Math.max(...yr)))}${tile(s.lo52, f(Math.min(...yr)))}</div>`;
}
function histPanel(x) {
  const H = HIST[lang], h = x.hist, out = [];
  const tiles = [];
  if (x.since) tiles.push(`<div class="stat"><span>${esc(H.since)}</span><b class="${x.since.pct >= 0 ? 'up' : 'dn'}">${pct(x.since.pct)}</b><i>${esc(H.days(x.since.days))}</i></div>`);
  const dm = x.move ?? x.day;
  if (dm != null) tiles.push(`<div class="stat"><span>${esc(H.dayMove)}</span><b class="${dm >= 0 ? 'up' : 'dn'}">${pct(dm)}</b>${x.vol ? `<i>±${num(x.vol)}% ${esc(T().st.d1)}</i>` : ''}</div>`);
  if (tiles.length) out.push(`<div class="stats two">${tiles.join('')}</div>`);
  let txt = '';
  if (x.vol && dm != null) txt += H.normal(num(x.vol)) + H.times(Math.abs(dm) / x.vol);
  if (h && h.n >= 3) {
    const r20 = h.n20 ? h.up20 / h.n20 : 0.5;
    const tk = r20 >= 0.6 ? (h.dir < 0 ? 'rebound' : 'followup') : r20 <= 0.4 ? (h.dir < 0 ? 'fallmore' : 'giveback') : 'mixed';
    const good = tk === 'rebound' || tk === 'followup', bad = tk === 'fallmore' || tk === 'giveback';
    const meter = (label, u, n, avg) => n ? `<div class="meter"><div class="m-top"><span>${esc(label)}</span><b class="${avg >= 0 ? 'up' : 'dn'}">${esc(H.avg)} ${pct(avg)}</b></div>
      <u class="m-bar"><u style="width:${Math.round(u / n * 100)}%"></u></u><div class="m-sub">${esc(H.higher(u, n))}</div></div>` : '';
    out.push(`<p class="h-head">${esc(H.head(x.ticker, num(h.thr), h.dir, h.n, num(h.years || 2, 0)))}</p>
      ${meter(H.w1, h.up5, h.n5, h.avg5)}${meter(H.m1, h.up20, h.n20, h.avg20)}
      <div class="trend ${good ? 'good' : bad ? 'bad' : ''}">${esc(H.tend[tk])}</div>`);
  } else if (h) {
    out.push(`<p class="h-head">${esc(H.rare(x.ticker, num(h.thr), h.dir, h.n))}</p>`);
  }
  if (txt) out.push(`<p class="h-txt">${esc(txt)}</p>`);
  if (!out.length) return '';
  return `<div class="panel hist"><h4>${esc(H.title)}</h4>${out.join('')}<p class="h-note">${esc(H.note)}</p></div>`;
}

function renderDetail() {
  const x = detailItem, t = T(), c = CATS[x.category], i = LI[lang];
  const why = x.auto ? (c ? c.why[i] : '') : L(x.why), risk = x.auto ? (c ? c.risk[i] : '') : L(x.risk);
  const analysis = `
    ${why ? `<div class="panel why"><h4>${esc(t.why)}</h4><p>${esc(why)}</p></div>` : ''}
    ${risk ? `<div class="panel risk"><h4>${esc(t.risk)}</h4><p>${esc(risk)}</p></div>` : ''}
    ${L(x.bull) || L(x.bear) ? `<div class="panel inv"><h4>${esc(t.investor)}</h4><div class="bb">
      ${L(x.bull) ? `<div class="bb-up"><b>▲ ${esc(t.bull)}</b><p>${esc(L(x.bull))}</p></div>` : ''}
      ${L(x.bear) ? `<div class="bb-dn"><b>▼ ${esc(t.bear)}</b><p>${esc(L(x.bear))}</p></div>` : ''}</div>
      ${L(x.triggers) ? `<div class="bb-tr"><b>${esc(t.triggers)}</b><p>${esc(L(x.triggers))}</p></div>` : ''}</div>` : ''}
    ${L(x.outlook) ? `<div class="panel outlook"><h4>${esc(HIST[lang].outlook)}</h4><p>${esc(L(x.outlook))}</p></div>` : ''}
    ${L(x.precedent) ? `<div class="panel prec"><h4>${esc(HIST[lang].precedent)}</h4><p>${esc(L(x.precedent))}</p></div>` : ''}
`;
  $('#sheetBody').innerHTML = `
    <div class="grab"></div>
    <div class="d-head">${avatar(x)}<div class="who"><b>${esc(x.ticker)}</b><span>${esc(x.name)} · ${esc(t[x.market] || x.market)} · ${x.type === 'fund' ? t.fund : t.stock}</span></div>
      <button class="icon-btn" id="closeSheet" aria-label="${esc(t.close)}"><svg class="ic"><use href="#i-x"/></svg></button></div>
    <div class="meta">${sigTag(x.signal)}${moveTag(x.move)}<span class="pill">${esc(catName(x.category))}</span><span class="pill ghost">${esc(secName(x.sector))}</span>
      ${x.ai ? `<span class="pill ai"><svg class="ic"><use href="#i-spark"/></svg>${esc(t.ai)}</span>` : `<span class="pill ghost">${esc(t.auto)}</span>`}<span class="muted">${esc(dayLabel(x.date))}</span></div>
    <h2 class="d-title">${esc(L(x.headline))}</h2>
    ${x.ai ? `<section class="radar-box"><div class="rb-head"><span class="rb-title"><svg class="ic"><use href="#i-spark"/></svg>${esc(t.featured)}</span><span class="rb-sub">${esc(t.analysedBy)} · ${esc(dayLabel(x.date))}</span></div>
      ${L(x.tldr) ? `<p class="d-tldr">${esc(L(x.tldr))}</p>` : ''}
      ${x.conviction ? `<div class="conv-box"><div class="conv-top">${sigTag(x.signal)}${convTag(x.conviction)}</div>${L(x.conviction_why) ? `<p>${esc(L(x.conviction_why))}</p>` : ''}</div>` : ''}
      ${L(x.summary) ? `<p class="d-sum">${esc(L(x.summary))}</p>` : ''}
      ${analysis}</section>` : `${L(x.summary) ? `<p class="d-sum">${esc(L(x.summary))}</p>` : ''}`}
    <div class="panel chart" id="cx"><div class="cx-loading"></div></div>
    <div id="cxStats"></div>
    <div id="calc"></div>
    ${x.ai ? '' : analysis}
    ${histPanel(x)}
    <h4 class="src-h">${esc(t.sources)}</h4>
    <div class="srcs">${(x.sources || []).map(s => `<a class="src" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener"><span>${esc(s.title)}</span><svg class="ic"><use href="#i-ext"/></svg></a>`).join('')}</div>
    ${x.ai ? feedbackBox() : ''}`;
}

// ---------- Geri bildirim (Claude analizleri için) ----------
// Not GitHub'da "geri-bildirim" etiketli bir issue olarak kaydedilir; GitHub Actions sadece repo sahibinin
// notlarını data/feedback.json'a aktarır, Claude haftalık analizde bunları okur.
const REPO = 'SabitEfeBasdemir/finanz-radar';
let fbRating = '';
function feedbackBox() {
  const t = T(); fbRating = '';
  return `<div class="panel fb"><h4>${esc(t.fbTitle)}</h4>
    <div class="fb-btns"><button class="opt" data-fb="up">👍 ${esc(t.fbUp)}</button><button class="opt" data-fb="down">👎 ${esc(t.fbDown)}</button></div>
    <textarea id="fbNote" rows="3" placeholder="${esc(t.fbNote)}"></textarea>
    <button class="btn primary" id="fbSend" disabled>${esc(t.fbSend)}</button>
    <p class="h-note">${esc(t.fbHelp)}</p></div>`;
}
function sendFeedback() {
  const x = detailItem; if (!x || !fbRating) return;
  const note = ($('#fbNote')?.value || '').trim().slice(0, 1500);
  const head = L(x.headline).slice(0, 90);
  const title = `${fbRating === 'up' ? '👍' : '👎'} ${x.ticker} – ${head} (${x.date})`;
  const body = `**Analiz:** ${x.ticker} – ${L(x.headline)} (${x.date})\n**Değerlendirme:** ${fbRating === 'up' ? 'beğendim' : 'beğenmedim'}\n**Not:** ${note || '-'}\n\n<!-- item: ${itemKey(x)} -->`;
  const url = `https://github.com/${REPO}/issues/new?labels=geri-bildirim&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank', 'noopener');
}
function openDetail(id) {
  potOpen = null;
  detailItem = items.find(x => itemKey(x) === id); if (!detailItem) return;
  renderDetail(); mountChart(detailItem);
  const d = $('#sheet'); if (!d.open) d.showModal(); d.scrollTop = 0; $('#sheetBody').scrollTop = 0;
}

// ---------- Filtre penceresi ----------
function renderFilterSheet() {
  const t = T();
  const group = (title, key, opts) => `<div class="fgroup"><h4>${esc(title)}</h4><div class="wrap">${
    opts.map(([v, l]) => `<button class="opt${F[key] === v ? ' on' : ''}" data-k="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`;
  const cats = [...new Set(items.map(x => x.category).filter(Boolean))].sort((a, b) => catName(a).localeCompare(catName(b), lang));
  $('#fsheetBody').innerHTML = `<div class="grab"></div>
    <div class="d-head"><h2>${esc(t.filters)}</h2><button class="icon-btn" id="closeF" aria-label="${esc(t.close)}"><svg class="ic"><use href="#i-x"/></svg></button></div>
    ${group(t.sig.bullish + ' / ' + t.sig.watch + ' / ' + t.sig.bearish, 'signal', [['', t.all], ...['bullish', 'watch', 'bearish'].map(s => [s, t.sig[s]])])}
    ${group(t.sector, 'sector', [['', t.all], ...sectors.map(s => [s.key, secName(s.key)])])}
    ${group(t.category, 'category', [['', t.all], ...cats.map(c => [c, catName(c)])])}
    ${group(t.type, 'type', [['', t.all], ['stock', t.stock], ['fund', t.fund]])}
    <div class="fbar"><button class="btn ghost" id="resetF">${esc(t.clear)}</button><button class="btn primary" id="applyF">${esc(t.apply)} · ${base().length}</button></div>`;
}

// ---------- Olaylar ----------
function setF(k, v) { F[k] = F[k] === v && v !== '' ? '' : v; shown = PAGE; renderAll(); }
function reset() { Object.keys(F).forEach(k => F[k] = ''); $('#q').value = ''; $('#qx').hidden = true; shown = PAGE; renderAll(); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-k]');
  if (b && !b.closest('#fsheet')) { setF(b.dataset.k, b.dataset.v); return; }
  const pc = e.target.closest('.pcard'); if (pc) { openPotential(pc.dataset.pot); return; }
  const c = e.target.closest('.card, .fcard');
  if (c) { openDetail(c.dataset.id); return; }
  if (e.target.closest('#more')) { shown += PAGE; render(); return; }
  if (e.target.closest('#resetAll')) { reset(); return; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.card, .fcard')) openDetail(e.target.dataset.id);
  if (e.key === 'Enter' && e.target.matches('.pcard')) openPotential(e.target.dataset.pot);
});
$('#lang').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  lang = b.dataset.v; store.set('lang', lang); applyLang();
  if ($('#sheet').open) { if (potOpen) openPotential(potOpen); else { renderDetail(); mountChart(detailItem); } }
});
let qt;
$('#q').addEventListener('input', e => {
  $('#qx').hidden = !e.target.value;
  clearTimeout(qt); qt = setTimeout(() => { F.q = e.target.value.trim().toLowerCase(); shown = PAGE; renderMood(); renderFeatured(); render(); }, 150);
});
$('#qx').addEventListener('click', () => { $('#q').value = ''; $('#qx').hidden = true; F.q = ''; renderAll(); $('#q').focus(); });

// Detay penceresi
$('#sheet').addEventListener('click', e => {
  if (e.target === $('#sheet') || e.target.closest('#closeSheet')) { $('#sheet').close(); return; }
  const fb = e.target.closest('[data-fb]');
  if (fb) { fbRating = fb.dataset.fb; document.querySelectorAll('[data-fb]').forEach(b => b.classList.toggle('on', b === fb)); $('#fbSend').disabled = false; return; }
  if (e.target.closest('#fbSend')) { sendFeedback(); return; }
  const cp = e.target.closest('[data-cp]'); if (cp && calcCtx) { calcPer = cp.dataset.cp; calcDate = ''; renderCalc(calcCtx.tk, calcCtx.sets); return; }
});
// Filtre penceresi
$('#openFilters').addEventListener('click', () => { renderFilterSheet(); $('#fsheet').showModal(); });
$('#fsheet').addEventListener('click', e => {
  if (e.target === $('#fsheet') || e.target.closest('#closeF') || e.target.closest('#applyF')) { $('#fsheet').close(); return; }
  if (e.target.closest('#resetF')) { reset(); renderFilterSheet(); return; }
  const o = e.target.closest('.opt');
  if (o) { const k = o.dataset.k; F[k] = o.dataset.v; shown = PAGE; renderAll(); renderFilterSheet(); }
});
// hesaplayıcı tutarı
$('#sheet').addEventListener('change', e => {
  if (e.target.id === 'calcAmt' && calcCtx) { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0) { calcAmt = Math.min(v, 1e9); store.set('calcAmt', calcAmt); renderCalc(calcCtx.tk, calcCtx.sets); } }
  if (e.target.id === 'calcDate' && calcCtx && e.target.value) { calcDate = e.target.value; renderCalc(calcCtx.tk, calcCtx.sets); }
});
// iPhone'da pencere açıkken arka plan kaymasın
['#sheet', '#fsheet'].forEach(id => {
  $(id).addEventListener('close', () => document.body.classList.remove('locked'));
  new MutationObserver(() => document.body.classList.toggle('locked', $(id).open)).observe($(id), { attributes: true, attributeFilter: ['open'] });
});
// Başa dön
addEventListener('scroll', () => { $('#totop').hidden = scrollY < 900; $('#sticky').classList.toggle('stuck', scrollY > 120); }, { passive: true });
$('#totop').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

// ---------- Tam ekran ----------
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFs = !standalone && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
function fsUi() {
  const b = $('#fsBtn'); if (!b) return;
  b.hidden = !canFs; const on = !!fsEl();
  b.querySelector('use').setAttribute('href', on ? '#i-exit' : '#i-full');
  b.setAttribute('aria-label', on ? T().exitFull : T().full); b.title = b.getAttribute('aria-label');
}
$('#fsBtn').addEventListener('click', () => {
  const d = document.documentElement;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (d.requestFullscreen || d.webkitRequestFullscreen).call(d).catch?.(() => {});
});
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, fsUi));
// iPhone Safari'de (tam ekran API'si yok) bir kez "Ana Ekrana Ekle" ipucu göster
const iosSafari = /iPhone|iPod/.test(navigator.userAgent) && !standalone;
function a2hsUi() {
  $('#a2hsTxt').textContent = T().a2hs;
  $('#a2hs').hidden = !(iosSafari && store.get('a2hs') !== 'x');
}
$('#a2hsX').addEventListener('click', () => { store.set('a2hs', 'x'); $('#a2hs').hidden = true; });
document.documentElement.classList.toggle('is-app', standalone);

// ---------- Uygulamayı yükle (masaüstü / Android) ----------
let installEvt = null;
const macSafari = /Macintosh/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent) && navigator.maxTouchPoints < 2;
function instUi() {
  const b = $('#instBtn'); if (!b) return;
  $('#instTxt').textContent = T().install;
  b.hidden = standalone || !(installEvt || macSafari);
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; instUi(); });
addEventListener('appinstalled', () => { installEvt = null; $('#instBtn').hidden = true; });
$('#instBtn').addEventListener('click', async () => {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); if (r?.outcome === 'accepted') $('#instBtn').hidden = true; installEvt = null; return; }
  const t = T();
  $('#isheetBody').innerHTML = `<div class="grab"></div>
    <div class="d-head"><img src="icons/icon-192.png" width="40" height="40" alt="" style="border-radius:10px"><h2>${esc(t.installTitle)}</h2>
      <button class="icon-btn" id="closeI" aria-label="${esc(t.close)}"><svg class="ic"><use href="#i-x"/></svg></button></div>
    <ol class="steps">${t.installSafari.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="h-note">${esc(t.installNote)}</p>`;
  $('#isheet').showModal();
});
$('#isheet').addEventListener('click', e => { if (e.target === $('#isheet') || e.target.closest('#closeI')) $('#isheet').close(); });

// Yeni sürüm otomatik: uygulama açılınca ve tekrar öne gelince güncelleme kontrol edilir;
// yeni sürüm devreye girince sayfa bir kez kendiliğinden yenilenir.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}
// Veriler de öne gelince tazelensin (6 saatte bir değil, uygulama her açıldığında)
let lastLoad = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastLoad > 10 * 60 * 1000) { lastLoad = Date.now(); load().catch(() => {}); }
});
load().catch(() => { $('#list').innerHTML = `<div class="empty"><b>${esc(T().empty)}</b></div>`; });
