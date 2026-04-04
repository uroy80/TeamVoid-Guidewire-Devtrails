const CACHE_NAME = 'gigshield-v1';
const STATIC_CACHE = 'gigshield-static-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logos/gigshield.png',
  '/logos/gigshield-192.png',
  '/logos/apple-touch-icon.png',
];

const OFFLINE_PAGE = '/offline.html';

// Install: cache app shell and offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([...APP_SHELL, OFFLINE_PAGE]).catch(() => {
        // If offline page doesn't exist yet, cache what we can
        return cache.addAll(APP_SHELL);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: routing strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  // API calls: network-first
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (images, fonts, css, js): cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

function isStaticAsset(pathname) {
  return /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js)(\?.*)?$/.test(pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function networkFirstWithOffline(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return offline fallback page
    const offline = await caches.match(OFFLINE_PAGE);
    return offline || new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GigShield - Offline</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a;text-align:center;padding:2rem}.container{max-width:400px}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#475569}</style></head><body><div class="container"><h1>You are offline</h1><p>Please check your internet connection and try again.</p><button onclick="location.reload()" style="margin-top:1rem;padding:0.75rem 1.5rem;background:#3b82f6;color:#fff;border:none;border-radius:12px;font-weight:600;cursor:pointer">Retry</button></div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
