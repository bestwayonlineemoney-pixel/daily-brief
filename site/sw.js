/* The Daily Brief - lets the page open fast and work offline with the last news it saw. */
const V = 'brief-__V__';
const SHELL = ['./', 'index.html', 'app.css?v=__V__', 'app.js?v=__V__', 'vendor/d3.min.js', 'vendor/topojson-client.min.js', 'vendor/world-110m.json', 'vendor/countries.json', 'vendor/fonts.css', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // news and code: network first, fall back to the last copy; fonts and map: cache first
  const cacheFirst = /\/vendor\/(fonts\/|world-110m|countries\.json)/.test(u.pathname);
  if (cacheFirst) { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(e.request, cp)); return res; }))); return; }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(e.request.url.split('?')[0], cp)); } return res; })
    .catch(() => caches.match(e.request.url.split('?')[0]).then((r) => r || caches.match(e.request))));
});
