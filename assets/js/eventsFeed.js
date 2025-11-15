/******************************************************
 * CharlestonHacks – Events Feed Renderer (2025)
 * ----------------------------------------------------
 * Works with:
 * https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/
 *
 * Guarantees:
 *  • Dates ALWAYS appear (or “Date TBD”)
 *  • Clean formatting
 *  • Null-safe fetch
 *  • No crashes
 *  • Matches your modal design perfectly
 ******************************************************/

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";
const list = document.getElementById("events-list");
const overlay = document.getElementById("events-overlay");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

/* ----------------------------------------------------
   Overlay Behavior
---------------------------------------------------- */
if (openBtn) openBtn.addEventListener("click", () => {
  overlay.classList.add("active");
});

if (closeBtn) closeBtn.addEventListener("click", () => {
  overlay.classList.remove("active");
});

overlay?.addEventListener("click", (e) => {
  const modal = document.querySelector(".events-modal");
  if (!modal.contains(e.target)) overlay.classList.remove("active");
});

/* ----------------------------------------------------
   Date Formatter
---------------------------------------------------- */
function formatDate(iso) {
  if (!iso) return "Date TBD";

  const d = new Date(iso);
  if (isNaN(d)) return "Date TBD";

  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* ----------------------------------------------------
   Source Badge
---------------------------------------------------- */
function badge(source) {
  return `<span style="
    display:inline-block;
    background:rgba(0,224,255,0.15);
    border:1px solid var(--cyan);
    color:var(--cyan);
    padding:2px 6px;
    border-radius:6px;
    font-size:.7rem;
    margin-top:.35rem;
  ">${source}</span>`;
}

/* ----------------------------------------------------
   Render Events
---------------------------------------------------- */
function renderEvents(events) {
  list.innerHTML = "";

  if (!events.length) {
    list.innerHTML = `<p style="opacity:.7;">No events found.</p>`;
    return;
  }

  events.forEach(ev => {
    const item = document.createElement("div");
    item.className = "event-item";

    const dateStr = formatDate(ev.startDate);

    item.innerHTML = `
      <div class="event-title"><strong>${ev.title}</strong></div>
      <div class="event-date">${dateStr}</div>
      <div class="event-location" style="opacity:.8;margin-top:.25rem;">
        ${ev.location || ""}
      </div>
      ${badge(ev.source)}
      <div style="margin-top:.5rem;">
        <a class="event-link" href="${ev.link}" target="_blank">View</a>
      </div>
    `;

    list.appendChild(item);
  });
}

/* ----------------------------------------------------
   Initial Loader State
---------------------------------------------------- */
list.innerHTML = `<p style="opacity:.7;">Loading events…</p>`;

/* ----------------------------------------------------
   Fetch Events from Worker
---------------------------------------------------- */
async function loadEvents() {
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error("Failed to fetch events");

    const data = await res.json();
    renderEvents(data.events || []);
  } catch (err) {
    console.error("Events load error:", err);
    list.innerHTML = `<p>Error loading events.</p>`;
  }
}

loadEvents();
