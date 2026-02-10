const CACHE_NAME = "innovation-engine-shell-v1";

// Keep this list tight and stable
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./images/bubbleh.png",
  "./images/bubbleh512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // (3) NEVER cache Supabase (auth, db, realtime, storage)
  if (url.hostname.endsWith("supabase.co")) {
    return;
  }

  // Only handle GET requests
  if (req.method !== "GET") return;

  const acceptsHTML = req.headers.get("accept")?.includes("text/html");

  // Network-first for HTML (so updates deploy cleanly)
  if (acceptsHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (
            (await caches.match(req)) ||
            (await caches.match("./index.html"))
          );
        }
      })()
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
