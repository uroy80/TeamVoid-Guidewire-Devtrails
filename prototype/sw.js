const CACHE_NAME = 'gigshield-v3';
const urlsToCache = ['/', 'index.html', 'app.js', 'data.js', 'styles.css', 'manifest.json', 'api/mockApi.js', 'api/insuranceEngine.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});