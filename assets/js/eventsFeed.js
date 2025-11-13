// CharlestonHacks - Dynamic Events + Countdown + Overlay (Multi-Feed)
// ------------------------------------------------------------------
// Fetches events from Cloudflare Worker (Charleston Multi-Feed)
// Displays them in a scrollable modal with source badges
// Updates live countdown for the nearest event

import { startCountdown } from "./countdown.js";

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// 🔔 Overlay controls
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

// 🟢 Fetch event feed
async function fetchEvents() {
  try {
    console.log("🌐 Fetching events from:", FEED_URL);
    const res = await fetch(FEED_URL);
    const data = await res.json();

    if (!data?.events?.length) {
      console.warn("⚠️ No valid events found");
      showFallbackEvents();
      return;
    }

    const now = new Date();
    const upcoming = data.events.filter(e => new Date(e.startDate) > now);
    if (!upcoming.length) {
      showFallbackEvents();
      return;
    }

    renderEvents(upcoming, data.source, data.lastUpdated);
    updateCountdown(upcoming[0]);

  } catch (err) {
    console.error("❌ Error fetching feed:", err);
    showFallbackEvents();
  }
}

// 🗓 Render events in modal
function renderEvents(events, sourceName = "Charleston Multi-Feed", lastUpdated = null) {
  list.innerHTML = "";

  // Add header
  const header = document.createElement("div");
  header.innerHTML = `
    <div style="color:#00e0ff; font-size:0.9rem; margin-bottom:0.8rem;">
      🧠 ${sourceName}
    </div>
  `;
  list.appendChild(header);

  // Build scrollable event list
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
           padding:0.4rem 0.8rem;
           border-radius:6px;
           font-weight:700;
           transition:background .2s;
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
      date: new Date("2025-11-15T17:00:00-05:00"),
      location: "Revelry Brewing",
      url: "https://www.linkedin.com/company/charlestonhacks",
    },
  ];
  list.innerHTML = `<div style="color:#ffae00;">🔁 Fallback Mode</div>`;
  fallback.forEach((e) => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.innerHTML = `
      <h3>${e.title}</h3>
      <div>${e.location}</div>
      <a href="${e.url}" target="_blank">View</a>
    `;
    list.appendChild(div);
  });
}

// ⏳ Update countdown
function updateCountdown(event) {
  const countdownEl = document.getElementById("countdown");
  if (!countdownEl) return;

  const titleEl = document.getElementById("next-event-title");
  if (titleEl) {
    titleEl.innerHTML = `
      Next: <span style="color:#00e0ff;">${event.title}</span><br>
      <small style="font-size:0.85em;opacity:0.8;">
        ${new Date(event.startDate).toLocaleString()} @ ${event.location}
      </small>
    `;
  }

  startCountdown("countdown", event.startDate);
}

// 🚀 Init
fetchEvents();
