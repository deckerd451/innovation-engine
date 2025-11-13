// CharlestonHacks - Dynamic Events + Countdown + Overlay
// ------------------------------------------------------
// Fetches live events via Cloudflare Worker proxy,
// populates the calendar modal, and updates countdown display.

import { startCountdown } from "./countdown.js";

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

// Cloudflare Worker Proxy (CharlestonHacks Events Feed)
const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

// Handle overlay open/close
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

// Fetch event data
async function fetchEvents() {
  try {
    const res = await fetch(FEED_URL);
    const data = await res.json();

    if (!data?.events || !Array.isArray(data.events)) {
      console.warn("⚠️ Invalid event feed, using fallback");
      showFallbackEvents();
      return;
    }

    const events = data.events.map(e => ({
      title: e.title,
      date: new Date(e.startDate),
      location: e.location || "Charleston, SC",
      url: e.link || "#"
    }));

    const now = new Date();
    const upcoming = events.filter(e => e.date > now).sort((a, b) => a.date - b.date);

    if (!upcoming.length) {
      showFallbackEvents();
      return;
    }

    renderEvents(upcoming);
    updateCountdown(upcoming[0]);

  } catch (err) {
    console.error("❌ Error fetching events:", err);
    showFallbackEvents();
  }
}

// Render list in modal
function renderEvents(events) {
  list.innerHTML = "";
  events.forEach(e => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.innerHTML = `
      <h3>${e.title}</h3>
      <div class="event-date">${e.date.toLocaleDateString(undefined, {
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
}

// Fallback content
function showFallbackEvents() {
  const fallback = [
    {
      title: "HarborHack 2025",
      date: new Date("2025-10-03T00:00:00-04:00"),
      location: "Charleston Tech Center",
      url: "#"
    },
    {
      title: "Charleston Tech Week",
      date: new Date("2025-04-14T00:00:00-04:00"),
      location: "Downtown Charleston",
      url: "#"
    }
  ];
  renderEvents(fallback);
  updateCountdown(fallback[0]);
}

// Update countdown + next event title
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

  titleEl.textContent = `Next: ${event.title}`;
  startCountdown("countdown", event.date);
}

// Initialize
fetchEvents();
