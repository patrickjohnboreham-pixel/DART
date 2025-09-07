// service-worker.js
const CACHE_NAME = "dart-v2"; // bump when you deploy new versions

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Icons (case-sensitive)
  "./Icons/icon-192.png",
  "./Icons/icon-512.png",

  // Help images (case-sensitive; make sure these exist exactly like this)
  "./Help/helpphoto1.jpg",
  "./Help/helpphoto2.jpg",
  "./Help/helpphoto3.jpg",
  "./Help/helpphoto4.jpg",

  // Screenshot (MATCH the real folder name & file)
  // If your folder is "screenshots" (lowercase), use this:
  "./Screenshots/wide-1280x720.jpg",

];

// Install: pre-cache core files (skip any that are missing)
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PRECACHE) {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn("[SW] Skipping missing asset:", url);
      }
    }
    await self.skipWaiting();
  })());
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

// Fetch:
// - Navigations/HTML -> network-first (so updates appear)
// - Other GET requests -> cache-first (fast + offline)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        // offline fallback: cached page or cached index.html
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Assets: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (new URL(req.url).origin === self.location.origin) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
