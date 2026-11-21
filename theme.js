// Tasarım ayarları: data/theme.json'dan okunur ve sayfaya uygulanır.
// Tasarım Stüdyosu (studio.html) aynı Theme.apply'ı canlı önizleme için kullanır.
const Theme = (() => {
  const COLORS = ['bg', 'card', 'card2', 'line', 'tx', 'mut', 'accent', 'up', 'dn', 'wt'];
  // Sayfadaki bölümler: kimlik -> CSS seçicisi
  const SECTIONS = { pot: '#potBlock', search: '#sticky', mood: '#mood', sectors: '#secBlock', radar: '#featBlock', feed: '#list' };
  const FONTS = {
    system: { css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
    inter: { css: '"Inter", system-ui, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
    manrope: { css: '"Manrope", system-ui, sans-serif', url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap' },
    plex: { css: '"IBM Plex Sans", system-ui, sans-serif', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap' },
    serif: { css: '"Source Serif 4", Georgia, serif', url: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&display=swap' },
    mono: { css: '"JetBrains Mono", ui-monospace, Menlo, monospace', url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap' },
  };
  const PRESETS = {
    navy: { name: 'Koyu lacivert', colors: { bg: '#0f1419', card: '#18202a', card2: '#1e2834', line: '#263241', tx: '#e6edf3', mut: '#8b9bb0', accent: '#3b82f6', up: '#3ddc97', dn: '#ff6b6b', wt: '#f5c451' } },
    oled: { name: 'Tam siyah', colors: { bg: '#000000', card: '#0e0e10', card2: '#18181b', line: '#232326', tx: '#f4f4f5', mut: '#8a8a93', accent: '#3b82f6', up: '#22c55e', dn: '#ef4444', wt: '#eab308' } },
    light: { name: 'Açık', colors: { bg: '#f4f6f9', card: '#ffffff', card2: '#eef1f5', line: '#dde3ea', tx: '#111827', mut: '#5b6675', accent: '#2563eb', up: '#059669', dn: '#dc2626', wt: '#b45309' } },
    graphite: { name: 'Grafit + altın', colors: { bg: '#121212', card: '#1c1c1e', card2: '#262628', line: '#2f2f32', tx: '#ededed', mut: '#9a9a9f', accent: '#d4a017', up: '#4ade80', dn: '#f87171', wt: '#fbbf24' } },
    forest: { name: 'Gece yeşili', colors: { bg: '#0b1412', card: '#121f1b', card2: '#182823', line: '#20342e', tx: '#e3efe9', mut: '#86a197', accent: '#14b8a6', up: '#34d399', dn: '#fb7185', wt: '#fcd34d' } },
  };
  const DEF = {
    version: 1, preset: 'navy', colors: { ...PRESETS.navy.colors },
    font: 'system', size: 15, radius: 16, gap: 12, cardPad: 14, maxWidth: 0, feedCol: 340,
    order: ['pot', 'search', 'mood', 'sectors', 'radar', 'feed'], hidden: [],
  };
  const norm = t => {
    const o = { ...DEF, ...(t || {}) };
    o.colors = { ...DEF.colors, ...((t || {}).colors || {}) };
    const known = Object.keys(SECTIONS);
    o.order = [...(o.order || []).filter(k => known.includes(k)), ...known.filter(k => !(o.order || []).includes(k))];
    o.hidden = (o.hidden || []).filter(k => known.includes(k) && k !== 'feed');
    return o;
  };
  const isLight = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 140; };

  function apply(theme, doc = document) {
    const t = norm(theme), root = doc.documentElement, st = root.style;
    for (const k of COLORS) st.setProperty('--' + k, t.colors[k]);
    const f = FONTS[t.font] || FONTS.system;
    st.setProperty('--font', f.css);
    st.setProperty('--size', t.size + 'px');
    st.setProperty('--radius', t.radius + 'px');
    st.setProperty('--gap', t.gap + 'px');
    st.setProperty('--cardpad', t.cardPad + 'px');
    st.setProperty('--maxw', t.maxWidth ? t.maxWidth + 'px' : '100vw');
    st.setProperty('--feedcol', t.feedCol + 'px');
    const light = isLight(t.colors.bg);
    root.classList.toggle('theme-light', light);
    st.colorScheme = light ? 'light' : 'dark';
    const meta = doc.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t.colors.bg;
    if (f.url && !doc.querySelector(`link[data-font="${t.font}"]`)) {
      const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = f.url; l.dataset.font = t.font; doc.head.appendChild(l);
    }
    // bölüm sırası ve gizleme
    const anchor = doc.querySelector('#totop');
    if (anchor) for (const k of t.order) {
      const el = doc.querySelector(SECTIONS[k]); if (!el) continue;
      anchor.parentNode.insertBefore(el, anchor);
      el.toggleAttribute('data-off', t.hidden.includes(k));
    }
    return t;
  }

  // Sayfa açılışı: önce bu cihazdaki son tasarım (anında), sonra sunucudaki güncel tasarım
  async function load() {
    try { const c = localStorage.getItem('theme'); if (c) apply(JSON.parse(c)); } catch (e) {}
    try {
      const t = await fetch('data/theme.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null);
      if (t) { apply(t); try { localStorage.setItem('theme', JSON.stringify(t)); } catch (e) {} }
    } catch (e) {}
  }
  return { DEF, PRESETS, FONTS, SECTIONS, COLORS, norm, apply, load };
})();
