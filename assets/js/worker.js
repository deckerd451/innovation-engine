// worker.js – CharlestonHacks Robust Events Worker (ChuckTown Startups)

/**
 * This Worker scrapes the ChuckTown Startups homepage and extracts the
 * "UPCOMING EVENTS" section into a normalized JSON feed.
 *
 * Output:
 * {
 *   "events": [
 *      {
 *        "title": "Bites vs. Bytes at Reforged Gaming Lounge Every Monday",
 *        "startDate": "2025-12-08T22:00:00.000Z", // ISO or null if unknown
 *        "location": "Reforged Gaming Lounge, North Charleston",
 *        "link": "https://chucktownstartups.com/event-6437955",
 *        "source": "ChuckTown Startups",
 *        "description": null
 *      },
 *      ...
 *   ],
 *   "lastUpdated": "2025-12-08T09:37:46.943Z"
 * }
 */

const HOMEPAGE_URL = "https://chucktownstartups.com/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=600", // 10 minutes
  ...CORS_HEADERS,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    try {
      const events = await fetchChucktownEvents();
      const body = JSON.stringify({
        events,
        lastUpdated: new Date().toISOString(),
      });

      return new Response(body, { status: 200, headers: JSON_HEADERS });
    } catch (err) {
      console.error("Worker error:", err);

      return new Response(
        JSON.stringify({
          events: [],
          lastUpdated: new Date().toISOString(),
          error: "Failed to fetch events",
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }
  },
};

/**
 * Fetch and parse events from ChuckTown Startups homepage.
 */
async function fetchChucktownEvents() {
  const res = await fetch(HOMEPAGE_URL, {
    // Cloudflare edge caching hint
    cf: { cacheTtl: 600, cacheEverything: true },
  });

  if (!res.ok) {
    throw new Error(`ChuckTown fetch failed: ${res.status}`);
  }

  const html = await res.text();
  return parseChucktownHomepage(html);
}

/**
 * Very lightweight HTML parser tailored to the current ChuckTown Startups
 * homepage structure.
 *
 * Strategy:
 *  - Find the "UPCOMING EVENTS" heading to narrow search window.
 *  - Within that slice, look for links to /event-xxxxx.
 *  - The anchor text is the event title.
 *  - Text immediately after the anchor often contains date & location
 *    like: "Mon, December 08, 2025 5:00 PM | Reforged Gaming Lounge..."
 */
function parseChucktownHomepage(html) {
  const events = [];

  const headingIndex = html.indexOf("UPCOMING EVENTS");
  if (headingIndex === -1) {
    // Fallback: return empty but don't crash
    return events;
  }

  // Slice out a chunk after the heading to avoid parsing the whole page.
  const slice = html.slice(headingIndex, headingIndex + 8000);

  // Normalize whitespace a bit to help our regex.
  const normalized = slice.replace(/\r\n/g, "\n");

  // Regex to capture event link and text after it.
  // 1: href (event URL)
  // 2: title (inside <a>...</a>)
  // 3: trailing text until next < (often includes date/location)
  const re =
    /<a\s+href="(https:\/\/chucktownstartups\.com\/event-[^"]+)">([^<]+)<\/a>([^<]*)/gi;

  let match;
  while ((match = re.exec(normalized)) !== null) {
    const href = match[1];
    const rawTitle = match[2] || "";
    const trailing = (match[3] || "").replace(/&nbsp;/gi, " ").trim();

    const title = decodeHtmlEntities(rawTitle.trim());
    let startDate = null;
    let location = null;

    if (trailing) {
      // Example trailing:
      // "Mon, December 08, 2025 5:00 PM | Reforged Gaming Lounge, 8484 Dorchester Road, North Charleston"
      const cleaned = trailing.replace(/\s+/g, " ").trim();
      const parts = cleaned.split("|");

      if (parts.length > 0) {
        const dateStr = parts[0].trim();
        const parsed = parseLooseDate(dateStr);
        if (parsed) startDate = parsed;
      }

      if (parts.length > 1) {
        const locStr = parts.slice(1).join("|").trim();
        if (locStr) location = decodeHtmlEntities(locStr);
      }
    }

    events.push({
      title,
      startDate, // ISO string or null
      location,
      link: href,
      source: "ChuckTown Startups",
      description: null,
    });
  }

  return events;
}

/**
 * Very forgiving date parser for strings like:
 * "Mon, December 08, 2025 5:00 PM"
 */
function parseLooseDate(str) {
  if (!str) return null;

  // Remove weekday abbreviation if present (e.g. "Mon, ")
  const cleaned = str.replace(/^[A-Za-z]{3,9},?\s+/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Basic HTML entity decoding for the most common entities.
 */
function decodeHtmlEntities(str) {
  if (!str) return "";

  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
