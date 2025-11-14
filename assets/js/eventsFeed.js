// assets/js/eventsFeed.js
// CharlestonHacks — Clean, Safe, Final Events Renderer

const FEED_URL =
  "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

const list = document.getElementById("events-list");
const overlay = document.getElementById("events-overlay");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

// Open / close modal
if (openBtn)
  openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn)
  closeBtn.addEventListener("click", () => overlay.classList.remove("active"));

// ---------- Helpers ----------
function formatDate(dateStr) {
  if (!dateStr) return "Date TBD";

  const d = new Date(dateStr);
  if (isNaN(d)) return "Date TBD";

  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderEvent(ev) {
  return `
    <div class="event-item">
      <h3>${ev.title}</h3>
      <div class="event-date">${formatDate(ev.startDate)}</div>
      <div> ${ev.location || "Charleston, SC"} </div>
      <div style="font-size:0.85rem;opacity:.7;margin-top:4px;">
        Source: ${ev.source}
      </div>
      ${
        ev.link
          ? `<a class="event-link" href="${ev.link}" target="_blank">View</a>`
          : ""
      }
    </div>
  `;
}

// ---------- Main fetch ----------
async function fetchEvents() {
  list.innerHTML = `<p style="opacity:0.7;">Loading…</p>`;

  try {
    console.log("📡 Fetching events from Worker…");

    const r = await fetch(FEED_URL);
    const data = await r.json();

    const events = data.events || [];

    if (!events.length) {
      list.innerHTML = `<p>No upcoming events</p>`;
      return;
    }

    // Render all events
    list.innerHTML = events.map(renderEvent).join("");

    // Footer time
    const last = data.lastUpdated
      ? new Date(data.lastUpdated).toLocaleString()
      : "";

    list.innerHTML += `
      <div style="margin-top:1rem; font-size:0.8rem; opacity:.6; text-align:center;">
        <i class="fas fa-clock"></i> Last updated: ${last}
      </div>
    `;
  } catch (err) {
    console.error("UI fetch error:", err);
    list.innerHTML = `<p style="color:#f66;">Failed to load events.</p>`;
  }
}

fetchEvents();
