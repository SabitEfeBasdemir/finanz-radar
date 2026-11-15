const $ = s => document.querySelector(s);
const LANGS = ['tr', 'de', 'en'];
const LI = { tr: 0, de: 1, en: 2 };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
let lang = (() => {
  const l = store.get('lang'); if (LANGS.includes(l)) return l;
  const n = (navigator.language || 'tr').slice(0, 2);
  return LANGS.includes(n) ? n : 'tr';
})();

// Uygulama durumu
let items = [], prices = {}, sectors = [], updated = '';
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
const SECTOR_HUE = { tech: 215, health: 160, energy: 30, finance: 260, industrials: 200, discretionary: 330, staples: 90, communication: 285, materials: 45, utilities: 185, realestate: 10 };
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
  const [i, p, s] = await Promise.all([
    fetch('data/insights.json').then(r => r.json()),
    fetch('data/prices.json').then(r => r.json()).catch(() => ({ tickers: {} })),
    fetch('data/sectors.json').then(r => r.json()).catch(() => ({ sectors: [] })),
  ]);
  items = (i.items || []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (!!b.ai - !!a.ai) || Math.abs(b.move || 0) - Math.abs(a.move || 0));
  prices = p.tickers || {}; sectors = s.sectors || []; updated = i.updated || '';
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
  $('#foot').textContent = t.foot; $('#totop').setAttribute('aria-label', t.top);
  renderAll();
}

function renderAll() { renderControls(); renderMood(); renderSectors(); renderFeatured(); render(); }

function renderControls() {
  const t = T();
  seg('#fm', [['', t.all], ['US', t.US], ['EU', t.EU]], F.market, 'market');
  seg('#fo', [['', t.all], ['ai', 'Claude'], ['auto', t.auto]], F.source, 'source');
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
  $('#feat').innerHTML = ai.map(x => `
    <article class="fcard" data-id="${esc(itemKey(x))}" tabindex="0">
      <div class="fc-top">${avatar(x)}<div class="who"><b>${esc(x.ticker)}</b><span>${esc(x.name)}</span></div>${sigTag(x.signal)}</div>
      <h3>${esc(L(x.headline))}</h3>
      <p>${esc(L(x.why))}</p>
      <div class="meta"><span class="pill">${esc(secName(x.sector))}</span><span>${esc(dayLabel(x.date))}</span></div>
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
      ${x.ai ? `<span class="pill ai"><svg class="ic"><use href="#i-spark"/></svg>Claude</span>` : ''}</div>
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

// ---------- Detay penceresi ----------
let detailItem = null, rangeKey = 'm3';
function bigChart(h) {
  const t = T();
  if (!h || h.length < 2) return `<div class="muted pad">${esc(t.noPrice)}</div>`;
  const n = { m1: 22, m3: 64, m6: 999 }[rangeKey];
  const s = h.slice(-n), v = s.map(x => x[1]), mn = Math.min(...v), mx = Math.max(...v), W = 600, H = 180, P = 6;
  const X = i => P + i * (W - 2 * P) / (v.length - 1), Y = y => H - P - (y - mn) / ((mx - mn) || 1) * (H - 2 * P);
  const pts = v.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const up = v.at(-1) >= v[0], ch = (v.at(-1) / v[0] - 1) * 100;
  const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  return `<div class="ch-head"><b class="${up ? 'up' : 'dn'}">${pct(Math.round(ch * 10) / 10)}</b>
      <div class="seg sm" id="rng">${Object.entries(t.range).map(([k, l]) => `<button data-r="${k}" class="${k === rangeKey ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <svg class="big ${up ? 'up' : 'dn'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${X(0)},${H} ${pts} ${X(v.length - 1)},${H}" fill="url(#g)"/>
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>
    <div class="ch-axis"><span>${fmtD(s[0][0])}</span><span>${fmtD(s.at(-1)[0])}</span></div>`;
}
function statTiles(h, cur) {
  if (!h || h.length < 2) return '';
  const s = T().st, v = h.map(x => x[1]), last = v.at(-1), at = n => v[Math.max(0, v.length - 1 - n)];
  const ch = n => Math.round((last / at(n) - 1) * 1000) / 10, f = x => num(x, 2);
  const tile = (l, val, cls = '') => `<div class="stat"><span>${l}</span><b class="${cls}">${val}</b></div>`;
  const c = n => tile(s[n === 1 ? 'd1' : n === 5 ? 'w1' : 'm1'], pct(ch(n)), ch(n) >= 0 ? 'up' : 'dn');
  return `<div class="stats">${tile(s.last, f(last) + (cur ? ' ' + esc(cur) : ''))}${c(1)}${c(5)}${c(21)}${tile(s.hi, f(Math.max(...v)))}${tile(s.lo, f(Math.min(...v)))}</div>`;
}
function renderDetail() {
  const x = detailItem, t = T(), c = CATS[x.category], i = LI[lang];
  const why = x.auto ? (c ? c.why[i] : '') : L(x.why), risk = x.auto ? (c ? c.risk[i] : '') : L(x.risk);
  const p = prices[x.ticker] || {};
  $('#sheetBody').innerHTML = `
    <div class="grab"></div>
    <div class="d-head">${avatar(x)}<div class="who"><b>${esc(x.ticker)}</b><span>${esc(x.name)} · ${esc(t[x.market] || x.market)} · ${x.type === 'fund' ? t.fund : t.stock}</span></div>
      <button class="icon-btn" id="closeSheet" aria-label="${esc(t.close)}"><svg class="ic"><use href="#i-x"/></svg></button></div>
    <div class="meta">${sigTag(x.signal)}${moveTag(x.move)}<span class="pill">${esc(catName(x.category))}</span><span class="pill ghost">${esc(secName(x.sector))}</span>
      ${x.ai ? `<span class="pill ai"><svg class="ic"><use href="#i-spark"/></svg>${esc(t.ai)}</span>` : `<span class="pill ghost">${esc(t.auto)}</span>`}<span class="muted">${esc(dayLabel(x.date))}</span></div>
    <h2 class="d-title">${esc(L(x.headline))}</h2>
    ${L(x.summary) ? `<p class="d-sum">${esc(L(x.summary))}</p>` : ''}
    <div class="panel chart">${bigChart(p.history)}</div>
    ${statTiles(p.history, p.currency)}
    ${why ? `<div class="panel why"><h4>${esc(t.why)}</h4><p>${esc(why)}</p></div>` : ''}
    ${risk ? `<div class="panel risk"><h4>${esc(t.risk)}</h4><p>${esc(risk)}</p></div>` : ''}
    <h4 class="src-h">${esc(t.sources)}</h4>
    <div class="srcs">${(x.sources || []).map(s => `<a class="src" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener"><span>${esc(s.title)}</span><svg class="ic"><use href="#i-ext"/></svg></a>`).join('')}</div>`;
}
function openDetail(id) {
  detailItem = items.find(x => itemKey(x) === id); if (!detailItem) return;
  rangeKey = 'm3'; renderDetail();
  const d = $('#sheet'); d.showModal(); d.scrollTop = 0; $('#sheetBody').scrollTop = 0;
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
  const c = e.target.closest('.card, .fcard');
  if (c) { openDetail(c.dataset.id); return; }
  if (e.target.closest('#more')) { shown += PAGE; render(); return; }
  if (e.target.closest('#resetAll')) { reset(); return; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.card, .fcard')) openDetail(e.target.dataset.id);
});
$('#lang').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  lang = b.dataset.v; store.set('lang', lang); applyLang();
  if ($('#sheet').open) renderDetail();
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
  const r = e.target.closest('[data-r]');
  if (r) { rangeKey = r.dataset.r; $('.panel.chart').innerHTML = bigChart((prices[detailItem.ticker] || {}).history); }
});
// Filtre penceresi
$('#openFilters').addEventListener('click', () => { renderFilterSheet(); $('#fsheet').showModal(); });
$('#fsheet').addEventListener('click', e => {
  if (e.target === $('#fsheet') || e.target.closest('#closeF') || e.target.closest('#applyF')) { $('#fsheet').close(); return; }
  if (e.target.closest('#resetF')) { reset(); renderFilterSheet(); return; }
  const o = e.target.closest('.opt');
  if (o) { const k = o.dataset.k; F[k] = o.dataset.v; shown = PAGE; renderAll(); renderFilterSheet(); }
});
// iPhone'da pencere açıkken arka plan kaymasın
['#sheet', '#fsheet'].forEach(id => {
  $(id).addEventListener('close', () => document.body.classList.remove('locked'));
  new MutationObserver(() => document.body.classList.toggle('locked', $(id).open)).observe($(id), { attributes: true, attributeFilter: ['open'] });
});
// Başa dön
addEventListener('scroll', () => { $('#totop').hidden = scrollY < 900; $('#sticky').classList.toggle('stuck', scrollY > 120); }, { passive: true });
$('#totop').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
load().catch(() => { $('#list').innerHTML = `<div class="empty"><b>${esc(T().empty)}</b></div>`; });
