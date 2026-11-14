const $ = s => document.querySelector(s);
const LANGS = ['tr', 'de', 'en'];
const LI = { tr: 0, de: 1, en: 2 };
let lang = (() => {
  try { const l = localStorage.getItem('lang'); if (LANGS.includes(l)) return l; } catch (e) {}
  const n = (navigator.language || 'tr').slice(0, 2);
  return LANGS.includes(n) ? n : 'tr';
})();
let items = [], prices = {}, sectors = [], updated = '', sec = '', shown = 60;
const PAGE = 60;
const T = () => I18N[lang];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeUrl = u => /^https?:\/\//.test(u) ? u : '#';
// Claude kayıtlarında metin {tr,de,en} olabilir; düz metin ise olduğu gibi gösterilir.
const L = v => v && typeof v === 'object' ? (v[lang] || v.tr || v.en || v.de || '') : (v || '');
const secName = k => SECTOR_NAMES[k] ? SECTOR_NAMES[k][LI[lang]] : (k || '');
const catName = k => CATS[k] ? CATS[k].name[LI[lang]] : (k || '');
const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toLocaleString(lang, { maximumFractionDigits: 1 }) + '%';

async function load() {
  const [i, p, s] = await Promise.all([
    fetch('data/insights.json').then(r => r.json()),
    fetch('data/prices.json').then(r => r.json()).catch(() => ({ tickers: {} })),
    fetch('data/sectors.json').then(r => r.json()).catch(() => ({ sectors: [] })),
  ]);
  items = (i.items || []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || Math.abs(b.move || 0) - Math.abs(a.move || 0));
  prices = p.tickers || {}; sectors = s.sectors || []; updated = i.updated || '';
  applyLang();
}

function applyLang() {
  const t = T();
  document.documentElement.lang = lang;
  document.title = t.title;
  $('#title').textContent = t.title;
  $('#lang').value = lang;
  $('#q').placeholder = t.search;
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const keep = id => $(id).value;
  const set = (id, html) => { const v = keep(id); $(id).innerHTML = html; $(id).value = v; };
  set('#fs', opt('', t.allSignals) + ['bullish', 'watch', 'bearish'].map(k => opt(k, t.sig[k])).join(''));
  set('#fm', opt('', t.allMarkets) + opt('US', t.US) + opt('EU', t.EU));
  set('#ft', opt('', t.allTypes) + opt('stock', t.stock) + opt('fund', t.fund));
  const cats = [...new Set(items.map(x => x.category).filter(Boolean))].sort((a, b) => catName(a).localeCompare(catName(b), lang));
  set('#fc', opt('', t.allCats) + cats.map(c => opt(c, catName(c))).join(''));
  set('#fo', opt('', t.allSources) + opt('ai', t.aiOnly) + opt('auto', t.autoOnly));
  $('#foot').textContent = t.foot;
  renderSectors(); render();
}

function renderSectors() {
  const t = T();
  $('#sec').innerHTML = sectors.length ? `<div class="sh">${esc(t.sectorsHead)}</div><div class="chips">` + sectors.map(s => {
    const n = items.filter(x => x.sector === s.key).length;
    return `<button class="chip${s.key === sec ? ' on' : ''}${s.active ? '' : ' off'}" data-k="${esc(s.key)}">
      <span>${s.rank}. ${esc(secName(s.key))}</span><b class="${(s.score || 0) >= 0 ? 'up' : 'dn'}">${pct(s.score)}</b><i>${n} ${esc(t.news)}</i></button>`;
  }).join('') + '</div>' : '';
}

function chart(h) {
  if (!h || h.length < 2) return `<div class="nm">${esc(T().noPrice)}</div>`;
  const v = h.map(x => x[1]), mn = Math.min(...v), mx = Math.max(...v), W = 600, H = 150, P = 4;
  const pts = v.map((y, i) => `${(P + i * (W - 2 * P) / (v.length - 1)).toFixed(1)},${(H - P - (y - mn) / ((mx - mn) || 1) * (H - 2 * P)).toFixed(1)}`).join(' ');
  const col = v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--dn)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function stats(h, cur) {
  if (!h || h.length < 2) return '';
  const s = T().st, v = h.map(x => x[1]), last = v.at(-1);
  const at = n => v[Math.max(0, v.length - 1 - n)], ch = n => pct(Math.round((last / at(n) - 1) * 1000) / 10);
  const f = x => x.toLocaleString(lang, { maximumFractionDigits: 2 });
  return `<div class="stats"><span>${s.last} <b>${f(last)} ${esc(cur || '')}</b></span><span>${s.d1} <b>${ch(1)}</b></span><span>${s.w1} <b>${ch(5)}</b></span>
    <span>${s.m1} <b>${ch(21)}</b></span><span>${s.hi} <b>${f(Math.max(...v))}</b></span><span>${s.lo} <b>${f(Math.min(...v))}</b></span></div>`;
}

function detail(x) {
  const t = T(), c = CATS[x.category], i = LI[lang];
  const why = x.auto ? (c ? c.why[i] : '') : L(x.why);
  const risk = x.auto ? (c ? c.risk[i] : '') : L(x.risk);
  const p = prices[x.ticker] || {};
  return `${L(x.summary) ? `<h4>${esc(t.summary)}</h4><p>${esc(L(x.summary))}</p>` : ''}
    ${why ? `<h4>${esc(t.why)}</h4><p>${esc(why)}</p>` : ''}${risk ? `<h4>${esc(t.risk)}</h4><p>${esc(risk)}</p>` : ''}
    <h4>${esc(t.chart)}</h4><div class="chart">${chart(p.history)}${stats(p.history, p.currency)}</div>
    <h4>${esc(t.sources)}</h4>${(x.sources || []).map(s => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}`;
}

let view = [];
function render() {
  const t = T(), q = $('#q').value.toLowerCase(), fs = $('#fs').value, fm = $('#fm').value, ft = $('#ft').value, fc = $('#fc').value, fo = $('#fo').value;
  view = items.filter(x => (!fs || x.signal === fs) && (!fm || x.market === fm) && (!ft || x.type === ft) && (!fc || x.category === fc)
    && (!sec || x.sector === sec) && (!fo || (fo === 'ai' ? !x.auto : x.auto))
    && (!q || (x.ticker + ' ' + x.name + ' ' + secName(x.sector) + ' ' + L(x.headline)).toLowerCase().includes(q)));
  $('#upd').textContent = `${t.updated}: ${updated || '—'} · ${view.length} ${t.news}`;
  $('#list').innerHTML = view.length ? view.slice(0, shown).map((x, n) => `
    <article class="card" data-n="${n}">
      <div class="top"><div><span class="tk">${esc(x.ticker)}</span> <span class="nm">${esc(x.name)} · ${esc(t[x.market] || x.market)} · ${x.type === 'fund' ? t.fund : t.stock}</span></div>
        <div class="tags">${x.move != null ? `<span class="mv ${x.move >= 0 ? 'up' : 'dn'}">${pct(x.move)}</span>` : ''}<span class="tag s-${esc(x.signal)}">${esc(t.sig[x.signal] || x.signal)}</span></div></div>
      <div class="hl">${esc(L(x.headline))}</div>
      <div class="nm">${x.sector ? esc(secName(x.sector)) + ' · ' : ''}${esc(catName(x.category))} · ${esc(x.date)} · <span class="src ${x.auto ? '' : 'ai'}">${esc(x.auto ? t.auto : t.ai)}</span></div>
      <div class="det"></div>
    </article>`).join('') + (view.length > shown ? `<button id="more" class="more">${esc(t.more)} (${view.length - shown})</button>` : '')
    : `<div class="empty">${esc(t.empty)}</div>`;
}

$('#list').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  if (e.target.id === 'more') { shown += PAGE; render(); return; }
  const c = e.target.closest('.card'); if (!c) return;
  const d = c.querySelector('.det');
  if (!d.innerHTML) d.innerHTML = detail(view[+c.dataset.n]);
  c.classList.toggle('open');
});
$('#sec').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; sec = sec === b.dataset.k ? '' : b.dataset.k; shown = PAGE; renderSectors(); render(); });
['#q', '#fs', '#fm', '#ft', '#fc', '#fo'].forEach(s => $(s).addEventListener('input', () => { shown = PAGE; render(); }));
$('#lang').addEventListener('change', e => { lang = e.target.value; try { localStorage.setItem('lang', lang); } catch (err) {} applyLang(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
load();
