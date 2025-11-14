// CharlestonHacks - Dynamic Events + Countdown + Overlay (Multi-Feed)
// ------------------------------------------------------------------
// Fetches events from Cloudflare Worker (Charleston Multi-Feed)
// Displays them in a scrollable modal with source badges
// Includes inline countdown timer logic (no external import needed)

// 🧭 DOM elements
const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");
const countdownEl = document.getElementById("countdown");
const titleEl = document.getElementById("next-event-title");

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// 🎛 Overlay Controls
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
if (overlay) {
  overlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (!modal.contains(e.target)) overlay.classList.remove("active");
  });
}

// 🎨 Source badge color map
const sourceColors = {
  "Charleston Digital Corridor": "#00e0ff",
  "Startup Grind": "#ff6f00",
  "Eventbrite": "#ff5a5f",
  "Meetup": "#f64060",
  "Fallback": "#c9a35e",
};

// 🕰 Inline Countdown Logic
function startCountdown(elementId, eventDateStr) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const eventDate = new Date(eventDateStr);
  if (isNaN(eventDate)) {
    el.textContent = "Invalid date";
    return;
  }

  function update() {
    const now = new Date();
    let diff = Math.max(0, eventDate - now);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const pad = (n) => n.toString().padStart(2, "0");

    if (diff <= 0) {
      el.innerHTML = `<span style="color:#00e0ff;">LIVE NOW 🔥</span>`;
      clearInterval(timer);
      return;
    }

    el.innerHTML = `
      <span style="color:#00e0ff;font-weight:700;">HH2025:</span>
      <span>${days}d</span>
      <span>${pad(hours)}h</span>
      <span>${pad(mins)}m</span>
      <span>${pad(secs)}s</span>
    `;
  }

  update();
  const timer = setInterval(update, 1000);
}

// 🟢 Fetch event feed
async function fetchEvents() {
  try {
    console.log("🌐 Fetching events from:", FEED_URL);
    const res = await fetch(FEED_URL, {
  cache: "no-store"
});

    const data = await res.json();

    if (!data?.events?.length) {
      console.warn("⚠️ No valid events found");
      showFallbackEvents();
      return;
    }

    const events = data.events;
    const now = new Date();

    // Filter future events ONLY, but never filter out all
   const future = events.filter(e => {
  const date = new Date(e.startDate);
  return !isNaN(date) && date >= Date.now() - 3600000; // allow 1hr window
});

// Never fall back to "zero future events"
const toRender = future.length > 0 ? future : events;


    renderEvents(toRender, data.source, data.lastUpdated);
    updateCountdown(toRender[0]);

  } catch (err) {
    console.error("❌ Error fetching feed:", err);
    showFallbackEvents();
  }
}

// 🗓 Render events in modal
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
    const color =
      sourceColors[
        Object.keys(sourceColors).find((key) => e.source?.includes(key))
      ] || "#888";

    const div = document.createElement("div");
    div.className = "event-item";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    div.style.paddingBottom = "0.75rem";
    div.style.marginBottom = "0.75rem";

    div.innerHTML = `
      <h3 style="margin:0; font-size:1rem; color:#fff;">${e.title}</h3>
      <div class="event-date" style="color:#bbb; font-size:0.9rem;">
        ${new Date(e.startDate).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div class="event-location" style="color:#999; font-size:0.85rem;">
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
      <a class="event-link"
         href="${e.link}"
         target="_blank"
         rel="noopener"
         style="
           display:inline-block;
           margin-top:0.5rem;
           background:#00e0ff;
           color:#000;
           text-decoration:none;
           padding:0.35rem 0.7rem;
           border-radius:6px;
           font-weight:700;
           transition:background .2s;
           font-size:0.85rem;
         ">View Event</a>
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
    <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:1rem 0;">
    <div>🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}</div>
  `;
  list.appendChild(footer);

  console.log(`📅 Rendered ${events.length} upcoming events.`);
}

// 🕰 Simple fallback
function showFallbackEvents() {
  const fallback = [
    {
      title: "Charleston Tech Happy Hour",
      startDate: "2025-11-15T17:00:00-05:00",
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

// ⏳ Update countdown + header
function updateCountdown(event) {
  if (!event) return;

  if (titleEl) {
    titleEl.innerHTML = `
      Next: <span style="color:#00e0ff;">${event.title}</span>
      <small style="font-size:0.85em;opacity:0.8;display:block;">
        ${new Date(event.startDate).toLocaleString()} @ ${event.location}
      </small>
    `;
  }

  startCountdown("countdown", event.startDate);
}

// 🚀 Init
fetchEvents();
