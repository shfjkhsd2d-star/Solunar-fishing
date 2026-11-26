/* Cache the app shell without requiring optional tide-data files. */
const CACHE_NAME = 'solunar-tide-v3.14-20261126-a';
const FILES = ['./', './index.html', './styles.css?v=3.14', './astro.js?v=3.14', './tides.js?v=3.14', './weather.js?v=3.14', './movement.js?v=3.14', './marine.js?v=3.14', './waves.js?v=3.14', './app.js?v=3.14', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(result => result || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
