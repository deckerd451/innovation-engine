/* sw.js — Innovation Engine (safe caching)
   - Avoids caching chrome-extension:// and other non-http(s) schemes
   - Only caches same-origin GET requests
   - Never caches Supabase traffic
*/

const VERSION = "v2";
const CACHE_NAME = `innovation-engine-shell-${VERSION}`;

// Keep install cache minimal and stable.
// (Add more only if you are 100% sure the paths exist in this repo.)
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
];

// Supabase should never be cached by the SW
function isSupabase(url) {
  return url.hostname.endsWith("supabase.co");
}

function isCacheableRequest(req, url) {
  if (!req || !url) return false;
  if (req.method !== "GET") return false;

  // Only http(s) requests can be cached safely here
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Only cache same-origin to avoid opaque/cross-origin weirdness
  if (url.origin !== self.location.origin) return false;

  // Never cache Supabase
  if (isSupabase(url)) return false;

  return true;
}

async function safeCachePut(cache, req, res) {
  try {
    // Only cache successful, basic (same-origin) responses
    if (!res || !res.ok) return;
    if (res.type !== "basic") return;
    await cache.put(req, res);
  } catch (e) {
    // Swallow caching errors — never break the app over caching
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache shell files, but don't fail install if one is missing
      await Promise.all(
        APP_SHELL.map(async (path) => {
          try {
            await cache.add(path);
          } catch {
            // Ignore missing files during install
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // malformed URL; let browser handle
  }

  // Never intercept Supabase requests
  if (isSupabase(url)) return;

  // Only handle cacheable requests; otherwise, pass through
  if (!isCacheableRequest(req, url)) return;

  // Navigation requests: network-first (keeps deployments fresh)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          await safeCachePut(cache, req, fresh.clone());
          return fresh;
        } catch {
          // Fallback to cached page or cached index.html
          return (await caches.match(req)) || (await caches.match("./index.html"));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const cache = await caches.open(CACHE_NAME);
      const fresh = await fetch(req);
      await safeCachePut(cache, req, fresh.clone());
      return fresh;
    })()
  );
});
