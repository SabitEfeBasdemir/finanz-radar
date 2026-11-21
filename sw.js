// Önce ağ, çevrimdışıysa önbellek. Böylece hem uygulama hem veri güncellemeleri hemen görünür.
const C = 'radar-v15';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css', 'app.js', 'i18n.js', 'chart.js', 'manifest.json'])));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const k = r.clone();
    caches.open(C).then(c => c.put(e.request, k));
    return r;
  }).catch(() => caches.match(e.request)));
});
