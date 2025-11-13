// ======================================================
// CharlestonHacks Dynamic Countdown Timer (v2)
// ======================================================
// ✅ Handles async event updates (from Worker feed)
// ✅ Gracefully initializes with placeholder
// ✅ Updates instantly when real event data arrives
// ✅ Shows “Now Happening” when live
// ======================================================

export function startCountdown(elementId, eventData) {
  const countdownEl = document.getElementById(elementId);
  if (!countdownEl) return;

  // Create or find title element above countdown
  let titleEl = document.getElementById("next-event-title");
  if (!titleEl) {
    titleEl = document.createElement("div");
    titleEl.id = "next-event-title";
    titleEl.style.color = "#c9a35e";
    titleEl.style.textShadow = "0 0 10px rgba(201,163,94,0.8)";
    titleEl.style.marginBottom = "0.5rem";
    countdownEl.parentNode.insertBefore(titleEl, countdownEl);
  }

  // Normalize event input
  let events = [];
  if (Array.isArray(eventData)) {
    events = eventData;
  } else if (typeof eventData === "string") {
    events = [{ name: "Next Event", date: eventData }];
  } else if (eventData && eventData.date) {
    events = [eventData];
  }

  // Graceful fallback while waiting for Worker data
  if (!events.length) {
    countdownEl.innerHTML = `<span class="coming-soon">Loading next event...</span>`;
    titleEl.textContent = "";
    return;
  }

  // Find next valid event
  const now = new Date();
  const nextEvent = events
    .map(e => ({ ...e, dateObj: new Date(e.date) }))
    .filter(e => e.dateObj > now)
    .sort((a, b) => a.dateObj - b.dateObj)[0];

  if (!nextEvent || isNaN(nextEvent.dateObj)) {
    countdownEl.innerHTML = `<span class="coming-soon">Next Event Coming Soon!</span>`;
    titleEl.textContent = "";
    return;
  }

  // Set title
  titleEl.textContent = nextEvent.name || "Upcoming Event";

  // Update function
  function updateCountdown() {
    const now = new Date();
    const diff = nextEvent.dateObj - now;

    if (diff <= 0) {
      countdownEl.innerHTML = `<span class="coming-soon">Happening Now!</span>`;
      titleEl.textContent = nextEvent.name;
      clearInterval(timer);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const pad = n => n.toString().padStart(2, "0");

    countdownEl.innerHTML = `
      <span><b>HH2025:</b></span>
      <span>${days}<small>d</small></span>
      <span>${pad(hours)}<small>h</small></span>
      <span>${pad(minutes)}<small>m</small></span>
      <span>${pad(seconds)}<small>s</small></span>
    `;
  }

  updateCountdown();
  const timer = setInterval(updateCountdown, 1000);
}
