// service-worker.js
const CACHE_NAME = "dart-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Icons (case-sensitive, match your folder names)
  "./Icons/icon-192.png",
  "./Icons/icon-512.png",

  // Help images
  "./Help/helpphoto1.jpg",
  "./Help/helpphoto2.jpg",
  "./Help/helpphoto3.jpg",
  "./Help/helpphoto4.jpg",

  // Screenshot (ensure folder is spelled Screenshots)
  "./Screenshots/wide-1280x720.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Add each URL, but don't fail the whole install if one is missing
    for (const url of PRECACHE) {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn("[SW] Skipping missing asset:", url, err);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// Cache-first for GET requests
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      // Only cache same-origin requests
      if (new URL(req.url).origin === self.location.origin) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // Offline fallback to any cached version if we have it
      return cached || Response.error();
    }
  })());
});
