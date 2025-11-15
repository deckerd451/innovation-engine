/******************************************************
 * CharlestonHacks – Enhanced Events Calendar (2025)
 * ----------------------------------------------------
 * New Features:
 *  • Smart date grouping ("Today", "This Week", etc.)
 *  • Section headers
 *  • Automatic sorting
 *  • Clean date formatting
 *  • Date TBD grouped separately
 ******************************************************/

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";
const list = document.getElementById("events-list");
const overlay = document.getElementById("events-overlay");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

/* ----------------------------------------------------
   Overlay Controls
---------------------------------------------------- */
openBtn?.addEventListener("click", () => overlay.classList.add("active"));
closeBtn?.addEventListener("click", () => overlay.classList.remove("active"));

overlay?.addEventListener("click", (e) => {
  const modal = document.querySelector(".events-modal");
  if (!modal.contains(e.target)) overlay.classList.remove("active");
});

/* ----------------------------------------------------
   Date Formatting Helpers
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

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/* ----------------------------------------------------
   Section Header Renderer
---------------------------------------------------- */
function addSection(title) {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="
      margin: 1.4rem 0 .6rem;
      color: var(--gold);
      font-size: 1.1rem;
      font-weight: 700;
      text-shadow: 0 0 10px rgba(201,163,94,0.7);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom:.3rem;
    ">
      ${title}
    </div>
  `;
  list.appendChild(el);
}

/* ----------------------------------------------------
   Event Renderer
---------------------------------------------------- */
function renderEvent(ev) {
  const item = document.createElement("div");
  item.className = "event-item";

  const dateStr = formatDate(ev.startDate);

  item.innerHTML = `
    <div class="event-title"><strong>${ev.title}</strong></div>
    <div class="event-date">${dateStr}</div>
    <div class="event-location" style="opacity:.8;margin-top:.25rem;">
      ${ev.location || ""}
    </div>
    <span style="
      display:inline-block;
      background:rgba(0,224,255,0.15);
      border:1px solid var(--cyan);
      color:var(--cyan);
      padding:2px 6px;
      border-radius:6px;
      font-size:.7rem;
      margin-top:.35rem;
    ">
      ${ev.source}
    </span>
    <div style="margin-top:.5rem;">
      <a class="event-link" href="${ev.link}" target="_blank">View</a>
    </div>
  `;

  list.appendChild(item);
}

/* ----------------------------------------------------
   Smart Date Categorization
---------------------------------------------------- */
function categorizeEvents(events) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const nextWeek = new Date(startOfWeek);
  nextWeek.setDate(startOfWeek.getDate() + 7);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const sections = {
    Today: [],
    "This Week": [],
    "Next Week": [],
    "Later This Month": [],
    Upcoming: [],
    "Date TBD": []
  };

  events.forEach(ev => {
    if (!ev.startDate) {
      sections["Date TBD"].push(ev);
      return;
    }

    const d = new Date(ev.startDate);

    if (isSameDay(today, d)) {
      sections["Today"].push(ev);
    } else if (d >= startOfWeek && d < nextWeek) {
      sections["This Week"].push(ev);
    } else if (d >= nextWeek && d < new Date(nextWeek.getTime() + 7 * 86400000)) {
      sections["Next Week"].push(ev);
    } else if (d >= today && d <= endOfMonth) {
      sections["Later This Month"].push(ev);
    } else {
      sections["Upcoming"].push(ev);
    }
  });

  return sections;
}

/* ----------------------------------------------------
   Main Renderer
---------------------------------------------------- */
function renderEvents(events) {
  list.innerHTML = "";

  const sections = categorizeEvents(events);

  Object.entries(sections).forEach(([section, items]) => {
    if (!items.length) return;

    addSection(section);

    items.forEach(ev => renderEvent(ev));
  });
}

/* ----------------------------------------------------
   Fetch + Render
---------------------------------------------------- */
async function loadEvents() {
  list.innerHTML = `<p style="opacity:.7;">Loading events…</p>`;

  try {
    const res = await fetch(FEED_URL);
    const data = await res.json();

    renderEvents(data.events || []);
  } catch (err) {
    console.error("Events load error:", err);
    list.innerHTML = `<p>Error loading events.</p>`;
  }
}

loadEvents();
