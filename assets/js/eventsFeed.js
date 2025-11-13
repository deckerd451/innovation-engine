// ======================================================
// CharlestonHacks Events Feed Loader (Worker v5)
// ======================================================
// Pulls real Charleston events via Cloudflare Worker
// and feeds them into the countdown timer + overlay
// ======================================================

import { startCountdown } from "./countdown.js";

async function fetchEvents() {
  const proxy = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

  try {
    const res = await fetch(proxy);
    const data = await res.json();
    const events = data.events || [];

    // Sort and pick upcoming events
    const now = new Date();
    const upcoming = events
      .filter(e => new Date(e.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const final = upcoming.length
      ? upcoming
      : [
          {
            title: "Charleston Tech Happy Hour",
            startDate: "2025-11-15T17:00:00-05:00",
            location: "Revelry Brewing",
            link: "https://www.linkedin.com/company/charlestonhacks",
          },
          {
            title: "Blue Sky Demo Day",
            startDate: "2026-02-14T09:00:00-05:00",
            location: "Charleston Digital Corridor",
            link: "https://charlestonhacks.com/events",
          },
        ];

    // ✅ Feed first event to countdown
    const eventData = final.map(e => ({
      name: e.title,
      date: e.startDate,
      location: e.location,
      url: e.link,
    }));

    startCountdown("countdown", eventData);

    // 🎟️ Handle overlay popup
    const overlay = document.getElementById("events-overlay");
    const list = document.getElementById("events-list");
    const countdown = document.getElementById("countdown");
    const close = document.getElementById("close-overlay");

    if (countdown && overlay && list) {
      countdown.addEventListener("click", () => {
        overlay.classList.add("active");
        list.innerHTML = eventData
          .map(
            e => `
            <div class="event-item">
              <strong>${e.name}</strong>
              <div class="event-date">${new Date(e.date).toLocaleString()}</div>
              <div class="event-location">${e.location}</div>
              <a href="${e.url}" target="_blank" class="event-link">View Event</a>
            </div>`
          )
          .join("");
      });
    }

    if (close) close.onclick = () => overlay.classList.remove("active");
  } catch (err) {
    console.error("⚠️ Error loading events:", err);
  }
}

document.addEventListener("DOMContentLoaded", fetchEvents);
