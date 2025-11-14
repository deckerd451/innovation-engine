// CharlestonHacks - Optimized Events + Countdown + Overlay
// -------------------------------------------------------
// Cleaner, safer, modern version of your event UI system.

// DOM
const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");
const countdownEl = document.getElementById("countdown");
const titleEl = document.getElementById("next-event-title");

// Worker feed
const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// Open / close overlay
openBtn?.addEventListener("click", () => overlay.classList.add("active"));
closeBtn?.addEventListener("click", () => overlay.classList.remove("active"));
overlay?.addEventListener("click", (e) => {
  const modal = document.querySelector(".events-modal");
  if (!modal.contains(e.target)) overlay.classList.remove("active");
});

// 🎨 Color map for source badges
const sourceColors = {
  "Charleston Digital Corridor": "#00e0ff",
  "Startup Grind": "#ff6f00",
  "Eventbrite": "#ff5a5f",
  "Charleston Women in Tech": "#ff66b3",
  "Tech After Five Charleston": "#ffd166",
  "Tech After Five": "#ffd166",
  "Charleston Data Science": "#a78bfa",
  "Charleston Hackers": "#4ade80",
  "SC Codes": "#06d6a0",
  "SC Codes RSS": "#06d6a0",
  "Code for Charleston": "#118ab2",
  "Fallback": "#c9a35e",
};

// 🟦 Safe badge color finder
function getSourceColor(source) {
  if (!source) return "#888";
  for (const key in sourceColors) {
    if (source.includes(key)) return sourceColors[key];
  }
  return "#888";
}

// 🕰 Start countdown
function startCountdown(elementId, eventDateStr) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const eventDate = new Date(eventDateStr);
  if (isNaN(eventDate)) return;

  function update() {
    const now = new Date();
    const diff = Math.max(0, eventDate - now);

    if (diff <= 0) {
      el.innerHTML = `<span class="countdown-live">LIVE NOW 🔥</span>`;
      clearInterval(timer);
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    const m = Math.floor((diff / 60000) % 60);
    const s = Math.floor((diff / 1000) % 60);

    el.innerHTML = `
      <span class="countdown-label">HH2025:</span>
      <span>${d}d</span>
      <span>${h}h</span>
      <span>${m}m</span>
      <span>${s}s</span>
    `;
  }

  update();
  const timer = setInterval(update, 1000);
}

// 🟢 Fetch Events from Worker
async function fetchEvents() {
  try {
    const res = await fetch(FEED_URL);
    const data = await res.json();
    const events = data.events || [];

    if (!events.length) return showFallbackEvents();

    const now = new Date();
    const future = events.filter(e => new Date(e.startDate) > now);
    const sorted = (future.length ? future : events).sort(
      (a, b) => new Date(a.startDate) - new Date(b.startDate)
    );

    renderEvents(sorted, data.source, data.lastUpdated);
    updateCountdown(sorted[0]);

  } catch (err) {
    console.error("Feed error:", err);
    showFallbackEvents();
  }
}

// 🗓 Render events
function renderEvents(events, sourceName = "Charleston Multi-Feed", lastUpdated = null) {
  list.innerHTML = "";

  // Header
  list.innerHTML = `
    <div class="events-header">
      🧠 ${sourceName}
    </div>
  `;

  const container = document.createElement("div");
  container.className = "events-container";

  events.forEach(e => {
    if (!e.title || !e.startDate) return; // skip malformed

    const color = getSourceColor(e.source);

    const item = document.createElement("div");
    item.className = "event-card fade-in";

    item.innerHTML = `
      <h3 class="event-title">${e.title}</h3>

      <div class="event-date">
        ${new Date(e.startDate).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })}
      </div>

      <div class="event-location">${e.location || "Charleston, SC"}</div>

      <span class="event-source" style="background-color:${color};">
        ${e.source || "Unknown"}
      </span>

      <a href="${e.link}" 
         class="event-button" 
         target="_blank" 
         rel="noopener">
         View Event
      </a>
    `;

    container.appendChild(item);
  });

  list.appendChild(container);

  // Footer
  list.innerHTML += `
    <div class="events-footer">
      🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}
    </div>
  `;
}

// 🟡 Fallback mode
function showFallbackEvents() {
  list.innerHTML = `
    <div class="fallback-banner">🔁 Fallback Mode</div>
  `;

  const fallback = [{
    title: "Charleston Tech Happy Hour",
    startDate: "2025-11-15T17:00:00-05:00",
    location: "Revelry Brewing",
    link: "https://www.linkedin.com/company/charlestonhacks",
    source: "Fallback",
  }];

  renderEvents(fallback, "Fallback", new Date().toISOString());
}

// Update countdown and header
function updateCountdown(event) {
  titleEl.innerHTML = `
    Next: <span class="next-event-name">${event.title}</span>
    <small class="next-event-sub">
      ${new Date(event.startDate).toLocaleString()} @ ${event.location}
    </small>
  `;
  startCountdown("countdown", event.startDate);
}

// Start
fetchEvents();
