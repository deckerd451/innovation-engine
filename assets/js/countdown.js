// ======================================================
// CharlestonHacks Dynamic Countdown Timer
// ======================================================
// ✅ Supports single event date or multiple events
// ✅ Finds next upcoming event automatically
// ✅ Displays event title dynamically
// ✅ Graceful fallback if no valid events
// ======================================================

export function startCountdown(elementId, eventData) {
  const countdownEl = document.getElementById(elementId);
  const titleEl = document.getElementById("next-event-title");
  if (!countdownEl) return;

  // --- Normalize event input ---
  let events = [];
  if (Array.isArray(eventData)) {
    events = eventData;
  } else if (typeof eventData === "string") {
    events = [{ name: "Next Event", date: eventData }];
  } else if (eventData && eventData.date) {
    events = [eventData];
  }

  // --- Find the next upcoming event ---
  const now = new Date();
  const nextEvent = events
    .map(e => ({ ...e, dateObj: new Date(e.date) }))
    .filter(e => e.dateObj > now)
    .sort((a, b) => a.dateObj - b.dateObj)[0];

  if (!nextEvent) {
  countdownEl.innerHTML = `<span class="coming-soon">Loading next event...</span>`;
  if (titleEl) titleEl.textContent = "";
  return;
}


  if (titleEl) titleEl.textContent = nextEvent.name || "Upcoming Event";

  function updateCountdown() {
    const now = new Date();
    const diff = nextEvent.dateObj - now;

    if (diff <= 0) {
      countdownEl.innerHTML = `<span class="coming-soon">The event is happening now!</span>`;
      if (titleEl) titleEl.textContent = nextEvent.name;
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
