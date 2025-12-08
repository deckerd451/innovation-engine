/**
 * CharlestonHacks Robust Events Worker
 *
 * This Cloudflare Worker aggregates events from multiple sources, normalises
 * the payloads into a common format and responds with a JSON object that
 * includes a `lastUpdated` timestamp.  It caches the output for a short
 * period (10 minutes by default) to prevent excessive upstream requests and
 * adds permissive CORS headers so that browsers can fetch it directly.
 *
 * To deploy this Worker you can use Wrangler (https://developers.cloudflare.com/workers/cli/).  
 * See README.md in this directory for setup instructions.
 */

const CACHE_TTL_SECONDS = 600; // 10 minutes

// List the sources you want to aggregate. Each entry defines a URL and a
// resolver function that extracts the array of events from the response.
const SOURCES = [
  {
    name: "CharlestonHacks Feed",
    url: "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/",
    resolve: (data) => {
      // The worker returns { events: [...], lastUpdated: ... }
      return Array.isArray(data.events) ? data.events : [];
    },
  },
  // Add additional sources here.  Each source should return events as an
  // array of objects with at least a `title` property.  See the
  // normaliseEvent() function below for optional fields.
];

/**
 * Normalise a raw event into a uniform shape.  If a property is missing
 * from the input it will be omitted from the output.  Feel free to
 * extend this function with your own normalisation logic (e.g. parsing
 * dates, resolving relative image URLs, etc.).
 *
 * @param {Object} ev Raw event object from a source
 * @param {String} sourceName Human readable source name
 */
function normaliseEvent(ev, sourceName) {
  const out = {
    title: ev.title?.toString().trim(),
    source: sourceName,
  };
  if (ev.startDate) {
    // Ensure date is ISO string. If parsing fails, drop the property.
    const d = new Date(ev.startDate);
    if (!isNaN(d)) out.startDate = d.toISOString();
  }
  if (ev.location) out.location = ev.location.toString().trim();
  if (ev.link) out.link = ev.link.toString().trim();
  if (ev.description) out.description = ev.description.toString().trim();
  if (ev.image) out.image = ev.image.toString().trim();
  return out;
}

/**
 * Attempt to fetch a URL, retrying with exponential backoff on failure.
 * Some providers intermittently return errors; this helper reduces the
 * likelihood of a single failure causing the entire aggregation to fail.
 *
 * @param {string} url The URL to fetch
 * @param {number} retries Number of retry attempts
 */
async function safeFetch(url, retries = 2) {
  try {
    const res = await fetch(url, {
      headers: {
        // Set a user agent so that providers don't block generic bots.
        'User-Agent': 'CharlestonHacksBot/1.0',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    if (retries > 0) {
      // wait before retrying (simple exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 500 * (3 - retries)));
      return safeFetch(url, retries - 1);
    }
    throw err;
  }
}

/**
 * Aggregate events from all configured sources.  If one source fails it
 * will be silently skipped but logged to the console.  The return
 * value is an array of normalised event objects.
 */
async function gatherEvents() {
  const events = [];
  for (const src of SOURCES) {
    try {
      const res = await safeFetch(src.url);
      const data = await res.json();
      const rawEvents = src.resolve(data);
      if (Array.isArray(rawEvents)) {
        for (const ev of rawEvents) {
          events.push(normaliseEvent(ev, src.name));
        }
      }
    } catch (err) {
      console.error(`Failed to fetch from ${src.name}:`, err);
      // Continue with other sources
    }
  }
  return events;
}

/**
 * Build the JSON response object with events and metadata.
 */
async function buildPayload() {
  const events = await gatherEvents();
  return {
    events,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Construct CORS headers for JSON responses.  All responses from this
 * worker use these headers to permit direct browser access.
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

/**
 * The fetch handler implements HTTP caching and CORS.  It responds to
 * OPTIONS preflight requests and GET requests.  Other methods return
 * HTTP 405.
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: corsHeaders(),
    });
  }
  // Use the request URL as part of the cache key so that different
  // querystrings produce distinct cached responses.
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  // Attempt to serve from cache first
  let response = await cache.match(cacheKey);
  if (response) {
    // Add header to indicate the response came from cache
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(response.body, { status: response.status, headers });
  }
  // Not in cache: generate fresh payload
  try {
    const payload = await buildPayload();
    response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: corsHeaders(),
    });
    // Tag response for debugging
    response.headers.set('X-Cache', 'MISS');
    // Cache the response
    const ttl = CACHE_TTL_SECONDS;
    await cache.put(cacheKey, response.clone());
    // Also attach a Cache-Control header for clients (e.g. CDN) if needed
    response.headers.set('Cache-Control', `public, max-age=${ttl}`);
    return response;
  } catch (err) {
    console.error('Error generating payload:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

export default { fetch: handleRequest };