/******************************************************
 * CharlestonHacks – Stable Events UI Renderer (2025)
 * ----------------------------------------------------
 * FIXED:
 *  - Proper date formatting
 *  - ALWAYS outputs a .event-date field
 *  - Graceful fallback for null/invalid dates
 ******************************************************/

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";
const list = document.getElementById("events-list");
const overlay = document.getElementById("events-overlay");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

/* ----------------------------------------------------
   Overlay behavior
---------------------------------------------------- */
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));

overlay?.addEventListener("click", (e) => {
  const modal = document.querySelector(".events-modal");
  if (!modal.contains(e.target)) overlay.classList.remove("active");
});

/* ----------------------------------------------------
   Format Date
---------------------------------------------------- */
function formatEventDate(dateStr) {
  if (!dateStr) return "Date TBD";

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Date TBD";

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* ----------------------------------------------------
   Load events
---------------------------------------------------- */
async function loadEvents() {
  list.innerHTML = `<p style="opacity:.7">Loading events…</p>`;

  try {
    const res = await fetch(FEED_URL);
    const events = await res.json();

    list.innerHTML = "";

    events.forEach(ev => {
      const item = document.createElement("div");
      item.className = "event-item";

      const formatted = formatEventDate(ev.startDate);

      item.innerHTML = `
        <div class="event-title"><strong>${ev.title}</strong></div>
        <div class="event-date">${formatted}</div>
        <div class="event-location" style="opacity:.8;margin-top:.25rem;">
          ${ev.location || ""}
        </div>
        <a class="event-link" href="${ev.link}" target="_blank">View</a>
      `;

      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p>Error loading events.</p>`;
    console.error("Events load error:", err);
  }
}

loadEvents();
