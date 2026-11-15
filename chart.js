// Etkileşimli fiyat grafiği (bağımlılık yok).
// - Parmağı/fareyi grafikte gezdir: o günün fiyatı, tarihi ve dönem başına göre değişim görünür.
// - Alttaki küçük şeritte pencereyi sürükleyerek zamanda ileri/geri git, kenarlarından tutup daralt/genişlet.
// - İki parmakla sıkıştır (veya fare tekerleği) yakınlaştır; ◀ ▶ ile yarım pencere kaydır.
// - Dönem butonları, 20/50 günlük ortalamalar, en yüksek/düşük işaretleri ve haber günü çizgisi.
const Chart = (() => {
  const L = {
    tr: { ranges: { w1: '1H', m1: '1A', m3: '3A', m6: '6A', y1: '1Y', all: 'Tümü' }, news: 'Haber', ma20: '20 gün ort.', ma50: '50 gün ort.',
      period: 'Dönem', high: 'En yüksek', low: 'En düşük', hint: 'Grafikte parmağını gezdir · alttaki şeridi kaydırarak ileri/geri git' },
    en: { ranges: { w1: '1W', m1: '1M', m3: '3M', m6: '6M', y1: '1Y', all: 'All' }, news: 'News', ma20: '20-day avg', ma50: '50-day avg',
      period: 'Period', high: 'High', low: 'Low', hint: 'Drag on the chart to inspect · slide the strip below to move back and forth' },
  };
  const SPAN = { w1: 5, m1: 22, m3: 64, m6: 128, y1: 252, all: Infinity };
  const H = 230, PT = 14, PB = 24, PR = 52, NAVH = 46;

  const sma = (c, n) => { const o = new Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const niceStep = (range, n) => { const r = range / n, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NS = 'http://www.w3.org/2000/svg';

  function mount(el, series, opt) {
    const lang = opt.lang === 'en' ? 'en' : 'tr', t = L[lang];
    const D = series.d, C = series.c, N = C.length, MA = { 20: sma(C, 20), 50: sma(C, 50) };
    const st = { a: Math.max(0, N - 64), b: N - 1, range: 'm3', ma: { 20: false, 50: false } };
    const newsIdx = opt.newsDate ? D.findIndex(d => d >= opt.newsDate) : -1;
    const fmtN = v => v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtP = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const fmtD = (d, long) => new Date(d + 'T00:00:00').toLocaleDateString(lang, long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
    const fmtY = d => new Date(d + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
    const fmtAx = (d, span) => new Date(d + 'T00:00:00').toLocaleDateString(lang, span > 200 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });

    el.innerHTML = `
      <div class="cx-head"><div class="cx-val"><b class="cx-price"></b><span class="cx-chg"></span></div><span class="cx-date"></span></div>
      <div class="cx-main"><svg class="cx-svg"></svg></div>
      <div class="cx-nav"><svg class="cx-navsvg"></svg><div class="cx-win"><i class="cx-h l"></i><i class="cx-h r"></i></div></div>
      <div class="cx-ctrl"><button class="cx-step" data-s="-1" aria-label="back">‹</button>
        <div class="seg sm cx-ranges">${Object.entries(t.ranges).filter(([k]) => k === 'all' || SPAN[k] < N).map(([k, l]) => `<button data-r="${k}">${l}</button>`).join('')}</div>
        <button class="cx-step" data-s="1" aria-label="forward">›</button></div>
      <div class="cx-opts"><button class="cx-ma" data-ma="20"><i></i>${t.ma20}</button><button class="cx-ma" data-ma="50"><i></i>${t.ma50}</button>
        ${newsIdx >= 0 ? `<span class="cx-leg"><i></i>${t.news}</span>` : ''}</div>
      <div class="cx-stats"></div>
      <p class="cx-hint">${t.hint}</p>`;
    const $ = s => el.querySelector(s);
    const svg = $('.cx-svg'), nav = $('.cx-navsvg'), win = $('.cx-win');
    let W = 0, xs = null, ys = null, cross = null;

    function head(i) {
      const scrub = i != null, k = scrub ? i : st.b, base = C[st.a], v = C[k], ch = (v / base - 1) * 100;
      $('.cx-price').textContent = fmtN(v);
      const c = $('.cx-chg'); c.textContent = `${v - base >= 0 ? '+' : '−'}${fmtN(Math.abs(v - base))} (${fmtP(ch)})`; c.className = 'cx-chg ' + (ch >= 0 ? 'up' : 'dn');
      $('.cx-date').textContent = scrub ? fmtD(D[k], true) : (st.b - st.a > 200 || D[st.a].slice(0, 4) !== D[st.b].slice(0, 4) ? `${fmtY(D[st.a])} – ${fmtY(D[st.b])}` : `${fmtD(D[st.a])} – ${fmtD(D[st.b])}`);
    }

    function el2(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }

    function draw() {
      W = svg.clientWidth || el.clientWidth || 340;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
      const a = st.a, b = st.b, span = b - a, PW = W - PR;
      let lo = Infinity, hi = -Infinity, iLo = a, iHi = a;
      for (let i = a; i <= b; i++) {
        if (C[i] < lo) { lo = C[i]; iLo = i; } if (C[i] > hi) { hi = C[i]; iHi = i; }
      }
      let mn = lo, mx = hi;
      for (const n of [20, 50]) if (st.ma[n]) for (let i = a; i <= b; i++) if (MA[n][i] != null) { mn = Math.min(mn, MA[n][i]); mx = Math.max(mx, MA[n][i]); }
      const pad = (mx - mn || mx * 0.02 || 1) * 0.08; mn -= pad; mx += pad;
      xs = i => (i - a) / (span || 1) * PW; ys = v => PT + (mx - v) / (mx - mn) * (H - PT - PB);
      const up = C[b] >= C[a], col = up ? 'var(--up)' : 'var(--dn)';
      // ızgara ve fiyat ekseni
      const step = niceStep(mx - mn, 4), g = el2('g', { class: 'cx-grid' }, svg);
      for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) {
        el2('line', { x1: 0, x2: PW, y1: ys(v), y2: ys(v) }, g);
        el2('text', { x: W - 4, y: ys(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toLocaleString(lang, { maximumFractionDigits: step < 1 ? 2 : 0 });
      }
      // tarih ekseni
      const ticks = Math.min(4, span);
      for (let k = 0; k <= ticks; k++) {
        const i = Math.round(a + span * k / ticks), x = xs(i);
        el2('text', { x: clamp(x, 18, PW - 18), y: H - 6, 'text-anchor': 'middle', class: 'cx-ax' }, g).textContent = fmtAx(D[i], span);
      }
      // dönem başı çizgisi
      el2('line', { x1: 0, x2: PW, y1: ys(C[a]), y2: ys(C[a]), class: 'cx-base' }, svg);
      // haber günü
      if (newsIdx >= a && newsIdx <= b) {
        const x = xs(newsIdx);
        el2('line', { x1: x, x2: x, y1: PT, y2: H - PB, class: 'cx-news' }, svg);
        el2('text', { x: clamp(x, 20, PW - 20), y: PT - 3, 'text-anchor': 'middle', class: 'cx-newst' }, svg).textContent = t.news;
      }
      // alan + çizgi
      let pts = ''; for (let i = a; i <= b; i++) pts += `${xs(i).toFixed(1)},${ys(C[i]).toFixed(1)} `;
      const gid = 'cxg' + Math.random().toString(36).slice(2, 7);
      const defs = el2('defs', {}, svg), lg = el2('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      el2('stop', { offset: 0, 'stop-color': up ? '#3ddc97' : '#ff6b6b', 'stop-opacity': .28 }, lg); el2('stop', { offset: 1, 'stop-color': up ? '#3ddc97' : '#ff6b6b', 'stop-opacity': 0 }, lg);
      el2('polygon', { points: `${xs(a)},${H - PB} ${pts}${xs(b)},${H - PB}`, fill: `url(#${gid})` }, svg);
      el2('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      for (const n of [20, 50]) if (st.ma[n]) {
        let p = ''; for (let i = a; i <= b; i++) if (MA[n][i] != null) p += `${xs(i).toFixed(1)},${ys(MA[n][i]).toFixed(1)} `;
        if (p) el2('polyline', { points: p, class: 'cx-ma' + n, fill: 'none' }, svg);
      }
      // en yüksek / en düşük
      for (const [i, v, dy, lab] of [[iHi, hi, -8, t.high], [iLo, lo, 16, t.low]]) {
        if (span < 3) break;
        el2('circle', { cx: xs(i), cy: ys(v), r: 3, class: 'cx-dot' }, svg);
        el2('text', { x: clamp(xs(i), 30, PW - 30), y: clamp(ys(v) + dy, PT + 8, H - PB - 2), 'text-anchor': 'middle', class: 'cx-hl' }, svg).textContent = fmtN(v);
      }
      // artı imleç
      cross = el2('g', { class: 'cx-cross', visibility: 'hidden' }, svg);
      el2('line', { y1: PT, y2: H - PB }, cross); el2('line', { x1: 0, x2: PW, class: 'h' }, cross); el2('circle', { r: 4.5 }, cross);
      head(null); drawNav(); stats();
      el.querySelectorAll('.cx-ranges button').forEach(bt => bt.classList.toggle('on', bt.dataset.r === st.range));
      el.querySelectorAll('.cx-ma').forEach(bt => bt.classList.toggle('on', st.ma[bt.dataset.ma]));
      $('.cx-step[data-s="-1"]').disabled = st.a === 0; $('.cx-step[data-s="1"]').disabled = st.b === N - 1;
    }

    function drawNav() {
      const w = nav.clientWidth || W; nav.setAttribute('viewBox', `0 0 ${w} ${NAVH}`);
      let mn = Math.min(...C), mx = Math.max(...C), p = '';
      for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 200))) p += `${(i / (N - 1) * w).toFixed(1)},${(4 + (mx - C[i]) / (mx - mn || 1) * (NAVH - 8)).toFixed(1)} `;
      p += `${w},${(4 + (mx - C[N - 1]) / (mx - mn || 1) * (NAVH - 8)).toFixed(1)}`;
      nav.innerHTML = `<polyline points="${p}" fill="none" stroke="var(--mut)" stroke-width="1.2"/>`;
      win.style.left = (st.a / (N - 1) * 100) + '%'; win.style.width = ((st.b - st.a) / (N - 1) * 100) + '%';
    }

    function stats() {
      let hi = -Infinity, lo = Infinity; for (let i = st.a; i <= st.b; i++) { hi = Math.max(hi, C[i]); lo = Math.min(lo, C[i]); }
      const ch = (C[st.b] / C[st.a] - 1) * 100;
      $('.cx-stats').innerHTML = `<span>${t.period} <b class="${ch >= 0 ? 'up' : 'dn'}">${fmtP(ch)}</b></span><span>${t.high} <b>${fmtN(hi)}</b></span><span>${t.low} <b>${fmtN(lo)}</b></span>`;
    }

    function setWin(a, b, keepRange) {
      const span = b - a;
      if (a < 0) { a = 0; b = span; } if (b > N - 1) { b = N - 1; a = Math.max(0, b - span); }
      st.a = Math.round(clamp(a, 0, N - 2)); st.b = Math.round(clamp(b, st.a + 1, N - 1));
      if (!keepRange) st.range = '';
      draw();
    }
    function setRange(r) { st.range = r; const n = Math.min(SPAN[r], N - 1); setWin(N - 1 - n, N - 1, true); }

    // --- artı imleç (tek parmak / fare) ---
    function idxAt(clientX) { const r = svg.getBoundingClientRect(), x = (clientX - r.left) / r.width * W; return clamp(Math.round(st.a + x / (W - PR) * (st.b - st.a)), st.a, st.b); }
    function showCross(i) {
      const x = xs(i), y = ys(C[i]); cross.setAttribute('visibility', 'visible');
      const [lv, lh, c] = cross.children;
      lv.setAttribute('x1', x); lv.setAttribute('x2', x); lh.setAttribute('y1', y); lh.setAttribute('y2', y); c.setAttribute('cx', x); c.setAttribute('cy', y);
      head(i);
    }
    function hideCross() { if (cross) cross.setAttribute('visibility', 'hidden'); head(null); }

    const ptrs = new Map(); let pinch = null;
    svg.addEventListener('pointerdown', e => {
      try { svg.setPointerCapture(e.pointerId); } catch (err) {} ptrs.set(e.pointerId, e.clientX);
      if (ptrs.size === 2) { const [x1, x2] = [...ptrs.values()]; pinch = { d: Math.abs(x1 - x2) || 1, a: st.a, b: st.b, mid: idxAt((x1 + x2) / 2) }; hideCross(); }
      else showCross(idxAt(e.clientX));
    });
    svg.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') showCross(idxAt(e.clientX)); return; }
      ptrs.set(e.pointerId, e.clientX);
      if (pinch && ptrs.size === 2) {
        const [x1, x2] = [...ptrs.values()], f = pinch.d / (Math.abs(x1 - x2) || 1), span = clamp((pinch.b - pinch.a) * f, 5, N - 1);
        const r = (pinch.mid - pinch.a) / (pinch.b - pinch.a || 1); setWin(pinch.mid - span * r, pinch.mid + span * (1 - r));
      } else if (!pinch) showCross(idxAt(e.clientX));
    });
    const end = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) hideCross(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) hideCross(); });
    svg.addEventListener('wheel', e => {
      e.preventDefault(); const i = idxAt(e.clientX), f = e.deltaY > 0 ? 1.15 : 1 / 1.15, span = clamp((st.b - st.a) * f, 5, N - 1), r = (i - st.a) / (st.b - st.a || 1);
      setWin(i - span * r, i + span * (1 - r));
    }, { passive: false });

    // --- alt şerit: sürükle = ileri/geri, kenarlar = daralt/genişlet, dokun = oraya git ---
    let drag = null;
    const navIdx = cx => { const r = nav.getBoundingClientRect(); return (cx - r.left) / r.width * (N - 1); };
    $('.cx-nav').addEventListener('pointerdown', e => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      const h = e.target.closest('.cx-h'), i = navIdx(e.clientX);
      if (h) drag = { mode: h.classList.contains('l') ? 'l' : 'r' };
      else if (e.target.closest('.cx-win')) drag = { mode: 'move', off: i - st.a };
      else { const span = st.b - st.a; drag = { mode: 'move', off: span / 2 }; setWin(i - span / 2, i + span / 2); }
    });
    $('.cx-nav').addEventListener('pointermove', e => {
      if (!drag) return; const i = navIdx(e.clientX), span = st.b - st.a;
      if (drag.mode === 'move') setWin(i - drag.off, i - drag.off + span);
      else if (drag.mode === 'l') setWin(clamp(i, 0, st.b - 5), st.b);
      else setWin(st.a, clamp(i, st.a + 5, N - 1));
    });
    $('.cx-nav').addEventListener('pointerup', () => drag = null);
    $('.cx-nav').addEventListener('pointercancel', () => drag = null);

    el.addEventListener('click', e => {
      const r = e.target.closest('[data-r]'); if (r) return setRange(r.dataset.r);
      const s = e.target.closest('.cx-step'); if (s) { const span = st.b - st.a, d = Math.round(span / 2) * +s.dataset.s; return setWin(st.a + d, st.b + d); }
      const m = e.target.closest('.cx-ma'); if (m) { st.ma[m.dataset.ma] = !st.ma[m.dataset.ma]; draw(); }
    });
    const ro = new ResizeObserver(() => { if (Math.abs((svg.clientWidth || 0) - W) > 2) draw(); });
    ro.observe(el);
    setRange(N > 64 ? 'm3' : 'all');
    return { destroy() { ro.disconnect(); } };
  }

  // 2 yıllık fiyat dosyasını yükle (data/p/SEMBOL.csv), önbellekte tut
  const cache = new Map();
  async function load(ticker) {
    if (cache.has(ticker)) return cache.get(ticker);
    const p = fetch(`data/p/${encodeURIComponent(ticker)}.csv`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(txt => {
      const d = [], c = [];
      for (const line of txt.split('\n').slice(1)) { const [a, b] = line.split(','); if (a && b) { d.push(a); c.push(+b); } }
      return { d, c };
    });
    cache.set(ticker, p); p.catch(() => cache.delete(ticker));
    return p;
  }
  return { mount, load };
})();
