/**
 * CharlestonHacks — Events Feed + Modal Wiring
 * - Fetches events from the Cloudflare Worker
 * - Renders into #events-list
 * - Handles modal open/close for #events-overlay
 */

console.log("📜 eventsFeed.js loaded");

const FEED_URL = "https://charlestonhacks-events-worker.deckerdb26354.workers.dev";

// Render helpers
function safeText(s) {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function formatDateShort(startDate) {
  if (!startDate) return "Upcoming";
  try {
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) return "Upcoming";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
  } catch {
    return "Upcoming";
  }
}

export async function loadEvents({
  listId = "events-list",
  limit = 10,
  emptyText = "No upcoming events found. Check back later!",
  errorText = "Unable to reach the event feed. Please try again later.",
} = {}) {
  const list = document.getElementById(listId);
  if (!list) {
    console.error("❌ Could not find #events-list");
    return;
  }

  list.innerHTML = `<p style="opacity:.7;">Searching for local happenings...</p>`;

  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const events = data?.events || data;

    if (!Array.isArray(events) || events.length === 0) {
      list.innerHTML = `<p>${safeText(emptyText)}</p>`;
      return;
    }

    list.innerHTML = "";
    const eventsToShow = events.slice(0, limit);

    for (const event of eventsToShow) {
      const title = safeText(event?.title || "Event");
      const link = safeText(event?.link || "#");
      const description = safeText(event?.description || "");
      const location = safeText(event?.location || "");
      const dateStr = safeText(formatDateShort(event?.startDate));

      const eventEl = document.createElement("div");
      eventEl.style.marginBottom = "1.5rem";
      eventEl.style.paddingBottom = "1rem";
      eventEl.style.borderBottom = "1px solid #333";

      eventEl.innerHTML = `
        <div style="font-size:0.75rem;color:#00e0ff;margin-bottom:4px;text-transform:uppercase;">${dateStr}</div>
        <h3 style="margin:0 0 8px 0;font-size:1.1rem;">
          <a href="${link}" target="_blank" rel="noopener noreferrer"
             style="color:#fff;text-decoration:none;border-bottom:1px solid #444;transition:border-color 0.3s;"
             onmouseover="this.style.borderColor='#00e0ff'"
             onmouseout="this.style.borderColor='#444'">${title}</a>
        </h3>
        ${location ? `<p style="font-size:0.85rem;color:#aaa;margin:4px 0;">📍 ${location}</p>` : ""}
        ${
          description
            ? `<p style="font-size:0.9rem;color:#888;margin-top:5px;line-height:1.4;">${description.substring(0, 150)}${
                description.length > 150 ? "..." : ""
              }</p>`
            : ""
        }
      `;

      list.appendChild(eventEl);
    }
  } catch (err) {
    console.error("❌ Error loading events:", err);
    list.innerHTML = `<p>${safeText(errorText)}</p>`;
  }
}

/**
 * Modal wiring for the calendar
 * - Click #open-calendar to open overlay and load events
 * - Click #close-overlay or outside modal to close
 */
export function initEventsModal({
  openBtnId = "open-calendar",
  overlayId = "events-overlay",
  closeBtnId = "close-overlay",
} = {}) {
  const openBtn = document.getElementById(openBtnId);
  const overlay = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeBtnId);

  if (!overlay) {
    console.warn("⚠️ Events overlay not found; skipping initEventsModal()");
    return;
  }

  function open() {
    overlay.classList.add("active");
    loadEvents().catch(() => {});
  }

  function close() {
    overlay.classList.remove("active");
  }

  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });

  closeBtn?.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return { open, close };
}
