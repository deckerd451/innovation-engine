/* sw.js — Innovation Engine (safe, same-origin-only) */

const VERSION = "v2";
const CACHE_NAME = `innovation-engine-shell-${VERSION}`;

// Keep this list tight and stable
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./images/bubbleh.png",
  "./images/bubbleh512.png",
];

// ---- helpers ----
function isHttp(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isSupabase(url) {
  return url.hostname.endsWith("supabase.co");
}

function shouldHandleRequest(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);

  // Never touch non-http(s) like chrome-extension://
  if (!isHttp(url)) return false;

  // Only cache/handle requests to *this* site
  if (!isSameOrigin(url)) return false;

  // Never cache Supabase
  if (isSupabase(url)) return false;

  return true;
}

function isNavigationRequest(request) {
  // Covers normal navigations and many SPA loads
  return request.mode === "navigate" || request.destination === "document";
}

async function safeCachePut(cache, request, response) {
  // Don’t cache opaque, errors, or partials
  if (!response) return;
  if (response.type === "opaque") return;
  if (!response.ok) return;

  try {
    await cache.put(request, response.clone());
  } catch {
    // Swallow cache errors (quota, unsupported schemes, etc.)
  }
}

// ---- lifecycle ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// ---- fetch strategy ----
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Ignore anything we shouldn’t handle (including chrome-extension://)
  if (!shouldHandleRequest(req)) return;

  const url = new URL(req.url);

  // Network-first for HTML / navigations (deploy updates cleanly)
  if (isNavigationRequest(req) || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          const fresh = await fetch(req);
          await safeCachePut(cache, req, fresh);
          return fresh;
        } catch {
          // Fallback to cached page, then shell index
          return (await caches.match(req)) || (await caches.match("./index.html"));
        }
      })()
    );
    return;
  }

  // Cache-first for static assets (js/css/img/etc)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const cache = await caches.open(CACHE_NAME);
      const fresh = await fetch(req);
      await safeCachePut(cache, req, fresh);
      return fresh;
    })()
  );
});
