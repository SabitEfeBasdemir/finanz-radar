// Etkileşimli fiyat grafiği (bağımlılık yok).
// - Parmağı/fareyi grafikte gezdir: o günün fiyatı, tarihi ve dönem başına göre değişim görünür.
// - Alttaki küçük şeritte pencereyi sürükleyerek zamanda ileri/geri git, kenarlarından tutup daralt/genişlet.
// - İki parmakla sıkıştır (veya fare tekerleği) yakınlaştır; ◀ ▶ ile yarım pencere kaydır.
// - Dönem butonları, 20/50 günlük ortalamalar, en yüksek/düşük işaretleri ve haber günü çizgisi.
const Chart = (() => {
  const L = {
    tr: { ranges: { d1: 'Gün', w1: 'Hafta', m1: 'Ay', y1: 'Yıl', max: 'Maks.' }, news: 'Haber', ma20: '20 gün ort.', ma50: '50 gün ort.',
      period: 'Dönem', high: 'En yüksek', low: 'En düşük', hint: 'Grafikte parmağını gezdir · alttaki şeridi kaydırarak ileri/geri git' },
    en: { ranges: { d1: '1D', w1: '1W', m1: '1M', y1: '1Y', max: 'Max' }, news: 'News', ma20: '20-day avg', ma50: '50-day avg',
      period: 'Period', high: 'High', low: 'Low', hint: 'Drag on the chart to inspect · slide the strip below to move back and forth' },
  };
  // her dönem: hangi veri seti, kaç nokta gösterilecek
  const RANGE = { d1: ['day', Infinity], w1: ['intra', Infinity], m1: ['daily', 22], y1: ['daily', 252], max: ['max', Infinity] };
  const H = 230, PT = 14, PB = 24, PR = 52, NAVH = 46;

  const sma = (c, n) => { const o = new Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const niceStep = (range, n) => { const r = range / n, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NS = 'http://www.w3.org/2000/svg';

  // sets: { daily: {d:[YYYY-MM-DD], c}, intra: {d:[unix sn], c} | null, max: {d:[YYYY-MM-DD aylık], c} | null }
  function mount(el, sets, opt) {
    const lang = opt.lang === 'en' ? 'en' : 'tr', t = L[lang];
    const mk = (s, kind) => s && s.c && s.c.length > 1 ? { D: s.d, C: s.c, N: s.c.length, MA: { 20: sma(s.c, 20), 50: sma(s.c, 50) }, kind } : null;
    const SETS = { daily: mk(sets.daily, 'daily'), intra: mk(sets.intra, 'intra'), max: mk(sets.max, 'max') };
    if (SETS.intra) {  // "Gün": son işlem seansı (aradaki 6 saatten uzun boşluktan sonrası)
      const d = SETS.intra.D; let k = d.length - 1; while (k > 0 && d[k] - d[k - 1] < 6 * 3600) k--;
      SETS.day = mk({ d: d.slice(k), c: SETS.intra.C.slice(k) }, 'day');
      if (SETS.day && k > 0) SETS.day.prev = SETS.intra.C[k - 1];   // önceki seansın kapanışı
    }
    let D, C, N, MA, kind, prev = null, newsIdx = -1;
    // dönem başı fiyatı: "Gün" görünümünde önceki kapanış, diğerlerinde pencerenin ilk fiyatı
    const baseVal = () => kind === 'day' && st.a === 0 && prev ? prev : C[st.a];
    const st = { a: 0, b: 1, range: 'm1', ma: { 20: false, 50: false } };
    const iso = d => typeof d === 'number' ? new Date(d * 1000).toISOString().slice(0, 10) : d;
    function useSet(name) {
      ({ D, C, N, MA, kind } = SETS[name]); prev = SETS[name].prev || null;
      const nd = opt.newsDate;
      newsIdx = !nd ? -1 : kind === 'max' ? D.findIndex(d => d.slice(0, 7) >= nd.slice(0, 7)) : D.findIndex(d => iso(d) >= nd);
    }
    const toDate = d => typeof d === 'number' ? new Date(d * 1000) : new Date(d + 'T00:00:00');
    const fmtN = v => v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 });
    const fmtP = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const time = d => toDate(d).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    const fmtD = (d, long) => {
      const x = toDate(d);
      if (kind === 'max') return x.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
      const day = x.toLocaleDateString(lang, long ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
      return typeof d === 'number' ? `${day} ${time(d)}` : day;
    };
    const fmtAx = (d, span) => {
      const x = toDate(d);
      if (kind === 'day') return time(d);
      if (kind === 'intra') return x.toLocaleDateString(lang, { weekday: 'short', day: 'numeric' });
      if (kind === 'max') return String(x.getFullYear());
      return x.toLocaleDateString(lang, span > 200 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
    };
    const rangeText = () => {
      const a = toDate(D[st.a]), b = toDate(D[st.b]);
      if (kind === 'day') return `${a.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long' })} · ${time(D[st.a])} – ${time(D[st.b])}`;
      if (kind === 'max') return `${a.getFullYear()} – ${b.getFullYear()}`;
      const y = a.getFullYear() !== b.getFullYear() || st.b - st.a > 200;
      const f = x => x.toLocaleDateString(lang, y ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
      return `${f(a)} – ${f(b)}`;
    };
    const avail = Object.keys(RANGE).filter(r => SETS[RANGE[r][0]] && (r !== 'y1' || SETS.daily.N > 30));

    el.innerHTML = `
      <div class="cx-head"><div class="cx-val"><b class="cx-price"></b><span class="cx-chg"></span></div><span class="cx-date"></span></div>
      <div class="cx-main"><svg class="cx-svg"></svg></div>
      <div class="cx-nav"><svg class="cx-navsvg"></svg><div class="cx-win"><i class="cx-h l"></i><i class="cx-h r"></i></div></div>
      <div class="cx-ctrl"><button class="cx-step" data-s="-1" aria-label="back">‹</button>
        <div class="seg sm cx-ranges">${avail.map(k => `<button data-r="${k}">${t.ranges[k]}</button>`).join('')}</div>
        <button class="cx-step" data-s="1" aria-label="forward">›</button></div>
      <div class="cx-opts"><button class="cx-ma" data-ma="20"><i></i>${t.ma20}</button><button class="cx-ma" data-ma="50"><i></i>${t.ma50}</button>
        ${opt.newsDate ? `<span class="cx-leg"><i></i>${t.news}</span>` : ''}</div>
      <div class="cx-stats"></div>
      <p class="cx-hint">${t.hint}</p>`;
    const $ = s => el.querySelector(s);
    const svg = $('.cx-svg'), nav = $('.cx-navsvg'), win = $('.cx-win');
    let W = 0, xs = null, ys = null, cross = null;

    function head(i) {
      const scrub = i != null, k = scrub ? i : st.b, base = baseVal(), v = C[k], ch = (v / base - 1) * 100;
      $('.cx-price').textContent = fmtN(v);
      const c = $('.cx-chg'); c.textContent = `${v - base >= 0 ? '+' : '−'}${fmtN(Math.abs(v - base))} (${fmtP(ch)})`; c.className = 'cx-chg ' + (ch >= 0 ? 'up' : 'dn');
      $('.cx-date').textContent = scrub ? fmtD(D[k], true) : rangeText();
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
      let mn = Math.min(lo, baseVal()), mx = Math.max(hi, baseVal());
      const maOn = n => st.ma[n] && kind === 'daily';
      for (const n of [20, 50]) if (maOn(n)) for (let i = a; i <= b; i++) if (MA[n][i] != null) { mn = Math.min(mn, MA[n][i]); mx = Math.max(mx, MA[n][i]); }
      const pad = (mx - mn || mx * 0.02 || 1) * 0.08; mn -= pad; mx += pad;
      xs = i => (i - a) / (span || 1) * PW; ys = v => PT + (mx - v) / (mx - mn) * (H - PT - PB);
      const up = C[b] >= baseVal(), col = up ? 'var(--up)' : 'var(--dn)';
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
      el2('line', { x1: 0, x2: PW, y1: ys(baseVal()), y2: ys(baseVal()), class: 'cx-base' }, svg);
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
      for (const n of [20, 50]) if (maOn(n)) {
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
      el.querySelectorAll('.cx-ma').forEach(bt => { bt.classList.toggle('on', st.ma[bt.dataset.ma]); bt.hidden = kind !== 'daily'; });
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
      const ch = (C[st.b] / baseVal() - 1) * 100;
      $('.cx-stats').innerHTML = `<span>${t.period} <b class="${ch >= 0 ? 'up' : 'dn'}">${fmtP(ch)}</b></span><span>${t.high} <b>${fmtN(hi)}</b></span><span>${t.low} <b>${fmtN(lo)}</b></span>`;
    }

    function setWin(a, b, keepRange) {
      const span = b - a;
      if (a < 0) { a = 0; b = span; } if (b > N - 1) { b = N - 1; a = Math.max(0, b - span); }
      st.a = Math.round(clamp(a, 0, N - 2)); st.b = Math.round(clamp(b, st.a + 1, N - 1));
      if (!keepRange) st.range = '';
      draw();
    }
    function setRange(r) { st.range = r; useSet(RANGE[r][0]); const n = Math.min(RANGE[r][1], N - 1); setWin(N - 1 - n, N - 1, true); }

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
        const [x1, x2] = [...ptrs.values()], f = pinch.d / (Math.abs(x1 - x2) || 1), span = clamp((pinch.b - pinch.a) * f, Math.min(5, N - 1), N - 1);
        const r = (pinch.mid - pinch.a) / (pinch.b - pinch.a || 1); setWin(pinch.mid - span * r, pinch.mid + span * (1 - r));
      } else if (!pinch) showCross(idxAt(e.clientX));
    });
    const end = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) hideCross(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) hideCross(); });
    svg.addEventListener('wheel', e => {
      e.preventDefault(); const i = idxAt(e.clientX), f = e.deltaY > 0 ? 1.15 : 1 / 1.15, span = clamp((st.b - st.a) * f, Math.min(5, N - 1), N - 1), r = (i - st.a) / (st.b - st.a || 1);
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
    setRange(avail.includes('m1') ? 'm1' : avail[0]);
    return { destroy() { ro.disconnect(); } };
  }

  // Fiyat dosyalarını yükle ve önbellekte tut:
  //   data/p/SEMBOL.csv  günlük, 2 yıl        data/i/SEMBOL.csv  gün içi 15 dk, 5 gün (unix zaman)
  //   data/m/SEMBOL.csv  aylık, borsaya açılıştan bu yana
  const cache = new Map();
  const csv = (url, num) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(txt => {
    const d = [], c = [];
    for (const line of txt.split('\n').slice(1)) { const [a, b] = line.split(','); if (a && b) { d.push(num ? +a : a); c.push(+b); } }
    return { d, c };
  });
  function load(ticker) {
    if (cache.has(ticker)) return cache.get(ticker);
    const tk = encodeURIComponent(ticker);
    const p = Promise.all([csv(`data/p/${tk}.csv`), csv(`data/i/${tk}.csv`, true).catch(() => null), csv(`data/m/${tk}.csv`).catch(() => null)])
      .then(([daily, intra, max]) => {
        if (max && daily.d.length && max.d.at(-1) < daily.d.at(-1)) { max.d.push(daily.d.at(-1)); max.c.push(daily.c.at(-1)); }
        return { daily, intra, max };
      });
    cache.set(ticker, p); p.catch(() => cache.delete(ticker));
    return p;
  }
  return { mount, load };
})();
