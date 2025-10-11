// sw.js — DART auto-update service worker
// sw.js — DART auto-update service worker
const APP_VERSION = '2025-10-11_08'; // bump each deploy
const STATIC_CACHE = `dart-static-${APP_VERSION}`;

// Detect correct base path (works for GitHub Pages under /DART/ or locally)
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, '/') || '/';

const PRECACHE = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}assets/css/dart.css?v=${APP_VERSION}`,
  `${BASE}assets/js/app.js?v=${APP_VERSION}`,
  `${BASE}assets/QLVIM_text.json?v=${APP_VERSION}`,
  `${BASE}assets/QLVIM.pdf?v=${APP_VERSION}`,
  `${BASE}viewer/viewer.html?v=${APP_VERSION}`,
  `${BASE}manifest.json?v=${APP_VERSION}`
];

// --- Install ---
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// --- Activate ---
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('dart-static-') && k !== STATIC_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// --- Fetch strategy ---
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (/\.(js|css|png|jpg|jpeg|svg|webp|ico|json|pdf|html)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

async function networkFirst(req) {
  try {
    return await fetch(req, { cache: 'no-store' });
  } catch {
    return (await caches.match(req)) || caches.match('/index.html');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const fetched = fetch(req).then(res => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || fetched || fetch(req);
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
