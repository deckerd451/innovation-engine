// CharlestonHacks - Dynamic Events + Countdown + Overlay
// ------------------------------------------------------
// Fetches live events via Cloudflare Worker proxy,
// populates the calendar modal, updates countdown display,
// and shows data source + last updated timestamp.

import { startCountdown } from "./countdown.js";

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// 🔔 Overlay toggle logic
if (openBtn) {
  openBtn.addEventListener("click", () => {
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  });
}
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  });
}
if (overlay) {
  overlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (!modal.contains(e.target)) {
      overlay.classList.remove("active");
      document.body.style.overflow = "";
    }
  });
}

// ------------------------------------------------------
// 🎟 Fetch event data from Cloudflare Worker
// ------------------------------------------------------
async function fetchEvents() {
  try {
    console.log("🌐 Fetching events from:", FEED_URL);
    const res = await fetch(FEED_URL);
    const data = await res.json();
    console.log("📦 Worker data:", data);

    if (!data?.events || !Array.isArray(data.events) || !data.events.length) {
      console.warn("⚠️ No valid events found, using fallback");
      showFallbackEvents();
      return;
    }

    const events = data.events
      .map(e => {
        const date = new Date(e.startDate);
        if (isNaN(date)) {
          console.warn("❌ Invalid date:", e.startDate);
          return null;
        }
        return {
          title: e.title?.trim() || "Untitled Event",
          date,
          location: e.location || "Charleston, SC",
          url: e.link || "#"
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    console.log("✅ Parsed live events:", events);

    const now = new Date();
    // Show all events for now (until Worker outputs real future dates)
const upcoming = events;


    if (!upcoming.length) {
      console.warn("⚠️ Feed loaded but no future events found — fallback mode");
      showFallbackEvents();
      return;
    }

    renderEvents(upcoming, "Live", data.source || "Charleston Digital Corridor");

    // ✅ Clear placeholder and start countdown
    const countdownEl = document.getElementById("countdown");
    if (countdownEl) countdownEl.innerHTML = "";

    updateCountdown(upcoming[0]);
    console.log(`⏰ Countdown set to: ${upcoming[0].title} (${upcoming[0].date.toLocaleString()})`);

  } catch (err) {
    console.error("❌ Error fetching events:", err);
    showFallbackEvents();
  }
}

// ------------------------------------------------------
// 🗓 Render events + footer info
// ------------------------------------------------------
function renderEvents(events, source = "Live", feedSource = "Charleston Digital Corridor") {
  list.innerHTML = `
    <div style="color:${source === "Live" ? "#00e0ff" : "#ffae00"};
                font-size:0.9rem; margin-bottom:0.8rem;">
      ${source === "Live" ? "🟢 Live Charleston Feed" : "🔁 Fallback Mode"}
    </div>
  `;

  events.forEach(e => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.innerHTML = `
      <h3>${e.title}</h3>
      <div class="event-date">${e.date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}</div>
      <div class="event-location">${e.location}</div>
      <a class="event-link" href="${e.url}" target="_blank" rel="noopener">Details</a>
    `;
    list.appendChild(div);
  });

  // Add footer with data source + timestamp
  const footer = document.createElement("div");
  footer.style.marginTop = "1rem";
  footer.style.fontSize = "0.8rem";
  footer.style.color = "#888";
  footer.style.textAlign = "center";
  footer.innerHTML = `
    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 1rem 0;">
    <div>📡 Data source: <span style="color:#c9a35e">${feedSource}</span></div>
    <div>🕒 Last updated: ${new Date().toLocaleString()}</div>
  `;
  list.appendChild(footer);

  console.log(`📅 Rendered ${events.length} scraped events in modal`);
}

// ------------------------------------------------------
// 🕰 Fallback if Worker unreachable
// ------------------------------------------------------
function showFallbackEvents() {
  const fallback = [
    {
      title: "Charleston Tech Happy Hour",
      date: new Date("2025-11-15T17:00:00-05:00"),
      location: "Revelry Brewing",
      url: "https://www.linkedin.com/company/charlestonhacks"
    },
    {
      title: "Blue Sky Demo Day",
      date: new Date("2026-02-14T09:00:00-05:00"),
      location: "Charleston Digital Corridor",
      url: "https://charlestonhacks.com/events"
    }
  ];
  renderEvents(fallback, "Fallback", "Local Static Fallback");
  updateCountdown(fallback[0]);
}

// ------------------------------------------------------
// ⏳ Update countdown + next event title (responsive & wrapped)
// ------------------------------------------------------
function updateCountdown(event) {
  const countdownEl = document.getElementById("countdown");
  if (!countdownEl) return;

  let titleEl = document.getElementById("next-event-title");
  if (!titleEl) {
    titleEl = document.createElement("div");
    titleEl.id = "next-event-title";
    titleEl.style.cssText = `
      color:#c9a35e;
      text-shadow:0 0 10px rgba(201,163,94,0.8);
      margin:0.3rem auto 0.4rem;
      font-weight:700;
      font-size:clamp(0.8rem, 2vw, 1rem);
      text-align:center;
      max-width:90%;
      line-height:1.4;
      word-wrap:break-word;
      overflow-wrap:break-word;
    `;
    countdownEl.parentNode.insertBefore(titleEl, countdownEl);
  }

  // Format the event date
  const eventDate = event.date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const location = event.location ? ` @ ${event.location}` : "";

  // Styled + wrapped HTML output
  titleEl.innerHTML = `
    Next: <span style="color:#00e0ff;">${event.title}</span><br>
    <small style="font-size:0.85em;opacity:0.85;">
      ${eventDate}${location}
    </small>
  `;

  // Start the live countdown timer
  startCountdown("countdown", event.date);
}


// ------------------------------------------------------
// 🚀 Initialize
// ------------------------------------------------------
fetchEvents();
