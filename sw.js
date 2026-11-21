// Önce ağ, çevrimdışıysa önbellek. Böylece hem uygulama hem veri güncellemeleri hemen görünür.
// Ağdan alırken tarayıcının kendi önbelleğini de yeniden doğrular ("no-cache"): GitHub Pages dosyaları
// 10 dakika saklanabilir diye işaretliyor; bu sayede eski kopya gösterilmez.
const C = 'radar-v17';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'i18n.js', 'chart.js', 'theme.js', 'manifest.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const same = url.origin === self.location.origin;
  const req = same ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(fetch(req).then(r => {
    if (same && r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
