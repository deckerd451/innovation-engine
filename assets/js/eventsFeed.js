// CharlestonHacks - Dynamic Events + Countdown + Overlay
// ------------------------------------------------------
// Fetches live events via Cloudflare Worker proxy,
// populates the calendar modal, and updates countdown display.

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
    console.log("📡 Worker response status:", res.status);
    const data = await res.json();
    console.log("📦 Raw data:", data);

    if (!data?.events || !Array.isArray(data.events)) {
      console.warn("⚠️ Invalid event feed, using fallback");
      showFallbackEvents();
      return;
    }

    // Normalize and sort events
    const events = data.events
      .map(e => {
        const date = new Date(e.startDate);
        if (isNaN(date.getTime())) {
          console.warn("⏰ Invalid date:", e.startDate);
          return null;
        }
        return {
          title: e.title,
          date,
          location: e.location || "Charleston, SC",
          url: e.link || "#"
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    console.log("✅ Parsed events:", events);

    const now = new Date();
    const upcoming = events.filter(e => e.date > now);

    if (!upcoming.length) {
      console.warn("⚠️ No upcoming events — showing fallback");
      showFallbackEvents();
      return;
    }

    // 👉 Show all upcoming events in the modal
    renderEvents(upcoming, "Live");

    // 👉 Update countdown with nearest event
    updateCountdown(upcoming[0]);
    console.log("✅ Countdown updated with Worker event:", upcoming[0].title);

  } catch (err) {
    console.error("❌ Error fetching events:", err);
    showFallbackEvents();
  }
}

// ------------------------------------------------------
// 🗓 Render all upcoming events
// ------------------------------------------------------
function renderEvents(events, source = "Live") {
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

  console.log(`📅 Rendered ${events.length} upcoming events in modal`);
}

// ------------------------------------------------------
// 🕰 Fallback content if Worker unreachable
// ------------------------------------------------------
function showFallbackEvents() {
  const fallback = [
    {
      title: "HarborHack 2026",
      date: new Date("2025-10-03T08:00:00-04:00"),
      location: "Charleston Tech Center",
      url: "https://charlestonhacks.com/hackathon"
    },
    {
      title: "Charleston Tech Week",
      date: new Date("2025-04-14T00:00:00-04:00"),
      location: "Downtown Charleston",
      url: "#"
    }
  ];
  console.warn("🔁 Using fallback events");
  renderEvents(fallback, "Fallback");
  updateCountdown(fallback[0]);
}

// ------------------------------------------------------
// ⏳ Update countdown + next event title
// ------------------------------------------------------
function updateCountdown(event) {
  const countdownEl = document.getElementById("countdown");
  if (!countdownEl) return;

  let titleEl = document.getElementById("next-event-title");
  if (!titleEl) {
    titleEl = document.createElement("div");
    titleEl.id = "next-event-title";
    titleEl.style.color = "#c9a35e";
    titleEl.style.textShadow = "0 0 10px rgba(201,163,94,0.8)";
    titleEl.style.marginBottom = "0.5rem";
    countdownEl.parentNode.insertBefore(titleEl, countdownEl);
  }

  console.log(`🎯 Next event: ${event.title} at ${event.date.toLocaleString()}`);
  titleEl.textContent = `Next: ${event.title}`;
  startCountdown("countdown", event.date);
}

// ------------------------------------------------------
// 🚀 Initialize
// ------------------------------------------------------
fetchEvents();
