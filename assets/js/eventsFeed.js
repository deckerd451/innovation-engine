/******************************************************
 * CharlestonHacks – Events Feed + Countdown
 * ----------------------------------------------------
 * Multi-source feed
 * Optimized countdown
 * No filtering issues
 * No duplicate intervals
 ******************************************************/

// DOM elements
const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");
const titleEl = document.getElementById("next-event-title");
const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// ------------------------------------------------------------------
// Overlay Controls
// ------------------------------------------------------------------
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
if (overlay) {
  overlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (!modal.contains(e.target)) overlay.classList.remove("active");
  });
}

// ------------------------------------------------------------------
// Source → Color Map
// ------------------------------------------------------------------
const sourceColors = {
  "Charleston Digital Corridor": "#00e0ff",
  "Startup Grind": "#ff6f00",
  "Eventbrite": "#ff5a5f",
  "Meetup": "#f64060",
  "Fallback": "#c9a35e",
};

// ------------------------------------------------------------------
// OPTIMIZED COUNTDOWN ENGINE (ONE TIMER ONLY)
// ------------------------------------------------------------------
let activeCountdownTimer = null;

function startCountdown(elementId, eventDateStr) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const eventDate = new Date(eventDateStr);
  if (isNaN(eventDate.getTime())) {
    el.innerHTML = `<span style="color:#aaa;">Date TBD</span>`;
    return;
  }

  // Kill previous timer if any
  if (activeCountdownTimer) {
    clearInterval(activeCountdownTimer);
    activeCountdownTimer = null;
  }

  function render(diff) {
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const pad = (n) => n.toString().padStart(2, "0");

    el.innerHTML = `
      <span style="color:#00e0ff;font-weight:700;">HH2025:</span>
      <span>${days}d</span>
      <span>${pad(hours)}h</span>
      <span>${pad(mins)}m</span>
      <span>${pad(secs)}s</span>
    `;
  }

  function tick() {
    const now = Date.now();
    const diff = eventDate - now;

    if (diff <= 0) {
      el.innerHTML = `<span style="color:#00e0ff;font-weight:700;">LIVE NOW 🔥</span>`;
      clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
      return;
    }

    render(diff);
  }

  tick();
  activeCountdownTimer = setInterval(tick, 1000);
}

function updateCountdown(event) {
  if (!event) return;

  const dateObj = new Date(event.startDate);
  const dateString = isNaN(dateObj)
    ? "Date TBD"
    : dateObj.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  if (titleEl) {
    titleEl.innerHTML = `
      Next: <span style="color:#00e0ff;">${event.title}</span>
      <small style="font-size:0.85em;opacity:0.8;display:block;">
        ${dateString} @ ${event.location || "Charleston, SC"}
      </small>
    `;
  }

  startCountdown("countdown", event.startDate);
}

// ------------------------------------------------------------------
// FETCH EVENTS
// ------------------------------------------------------------------
async function fetchEvents() {
  try {
    console.log("🌐 Fetching events:", FEED_URL);

    const res = await fetch(FEED_URL, { cache: "no-store" });
    const data = await res.json();

    if (!data?.events?.length) {
      console.warn("⚠️ No events found – fallback mode");
      showFallbackEvents();
      return;
    }

    const events = data.events;
    console.log(`📡 Loaded ${events.length} events`);

    renderEvents(events, data.source, data.lastUpdated);
    updateCountdown(events[0]);

  } catch (err) {
    console.error("❌ Fetch error:", err);
    showFallbackEvents();
  }
}

// ------------------------------------------------------------------
// RENDER EVENTS LIST
// ------------------------------------------------------------------
function renderEvents(events, sourceName = "Charleston Multi-Feed", lastUpdated = null) {
  list.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.innerHTML = `
    <div style="color:#00e0ff; font-size:0.9rem; margin-bottom:0.8rem;">
      🧠 ${sourceName}
    </div>
  `;
  list.appendChild(header);

  // Scrollable container
  const container = document.createElement("div");
  container.style.maxHeight = "60vh";
  container.style.overflowY = "auto";
  container.style.paddingRight = "0.5rem";

  events.forEach((e) => {
    let color = "#888";
    for (const key in sourceColors) {
      if (e.source && e.source.includes(key)) {
        color = sourceColors[key];
        break;
      }
    }

    const div = document.createElement("div");
    div.className = "event-item";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    div.style.paddingBottom = "0.75rem";
    div.style.marginBottom = "0.75rem";

    div.innerHTML = `
      <h3 style="margin:0; font-size:1rem; color:#fff;">${e.title}</h3>

      <div style="color:#bbb; font-size:0.9rem;">
        ${new Date(e.startDate).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>

      <div style="color:#999; font-size:0.85rem;">
        ${e.location || "Charleston, SC"}
      </div>

      <div style="margin-top:0.4rem;">
        <span style="
          background:${color};
          color:#000;
          font-size:0.75rem;
          padding:0.2rem 0.5rem;
          border-radius:6px;
          font-weight:700;
        ">${e.source || "Unknown"}</span>
      </div>

      <a href="${e.link}" target="_blank"
         style="
           display:inline-block;
           margin-top:0.5rem;
           background:#00e0ff;
           color:#000;
           padding:0.35rem 0.7rem;
           border-radius:6px;
           font-weight:700;
           font-size:0.85rem;
         ">
         View Event
      </a>
    `;

    container.appendChild(div);
  });

  list.appendChild(container);

  // Footer
  const footer = document.createElement("div");
  footer.style.textAlign = "center";
  footer.style.color = "#888";
  footer.style.fontSize = "0.8rem";
  footer.style.marginTop = "1rem";
  footer.innerHTML = `
    <hr style="border-top:1px solid rgba(255,255,255,0.1); margin:1rem 0;">
    <div>🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}</div>
  `;
  list.appendChild(footer);
}

// ------------------------------------------------------------------
// FALLBACK EVENTS
// ------------------------------------------------------------------
function showFallbackEvents() {
  const fallback = [
    {
      title: "CharlestonHacks Happy Hour",
      startDate: "2025-12-30T17:00:00-05:00",
      location: "Revelry Brewing",
      link: "https://www.linkedin.com/company/charlestonhacks",
      source: "Fallback",
    },
  ];

  list.innerHTML = `<div style="color:#ffae00;">🔁 Fallback Mode</div>`;

  fallback.forEach((e) => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.innerHTML = `
      <h3>${e.title}</h3>
      <div>${e.location}</div>
      <a href="${e.link}" target="_blank">View</a>
    `;
    list.appendChild(div);
  });

  updateCountdown(fallback[0]);
}

// ------------------------------------------------------------------
// INIT
// ------------------------------------------------------------------
fetchEvents();
