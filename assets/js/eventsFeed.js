/******************************************************
 * CharlestonHacks – Events Feed + Countdown
 * NO FRONT-END FALLBACK — Worker controls everything
 ******************************************************/

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");
const titleEl = document.getElementById("next-event-title");
const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

let activeCountdownTimer = null;

// Overlay
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
if (overlay) overlay.addEventListener("click", (e) => {
  if (!document.querySelector(".events-modal").contains(e.target))
    overlay.classList.remove("active");
});

// Countdown
function startCountdown(elementId, dateStr) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const date = new Date(dateStr);
  if (isNaN(date)) return;

  if (activeCountdownTimer) clearInterval(activeCountdownTimer);

  function tick() {
    const diff = date - Date.now();
    if (diff <= 0) {
      el.innerHTML = `<span style="color:#00e0ff;">LIVE NOW 🔥</span>`;
      clearInterval(activeCountdownTimer);
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (x) => x.toString().padStart(2, "0");

    el.innerHTML = `
      <span style="color:#00e0ff;font-weight:700;">HH2025:</span>
      <span>${d}d</span>
      <span>${pad(h)}h</span>
      <span>${pad(m)}m</span>
      <span>${pad(s)}s</span>
    `;
  }

  tick();
  activeCountdownTimer = setInterval(tick, 1000);
}

function updateCountdown(event) {
  if (!titleEl) return;

  titleEl.innerHTML = `
    Next: <span style="color:#00e0ff;">${event.title}</span>
    <small style="opacity:0.7;">
      ${new Date(event.startDate).toLocaleString()} @ ${event.location}
    </small>
  `;

  startCountdown("countdown", event.startDate);
}

// Fetch + render
async function fetchEvents() {
  console.log("Fetching events…");

  const res = await fetch(FEED_URL, { cache: "no-store" });
  const data = await res.json();

  renderEvents(data.events, data.source, data.lastUpdated);
  updateCountdown(data.events[0]);
}

function renderEvents(events, sourceName, lastUpdated) {
  list.innerHTML = `<div style="color:#00e0ff;margin-bottom:.5rem;">🧠 ${sourceName}</div>`;

  const container = document.createElement("div");
  container.style.maxHeight = "60vh";
  container.style.overflowY = "auto";

  events.forEach((e) => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    div.style.marginBottom = ".75rem";
    div.style.paddingBottom = ".75rem";

    div.innerHTML = `
      <h3 style="color:#fff;">${e.title}</h3>
      <div style="color:#bbb;">${new Date(e.startDate).toLocaleString()}</div>
      <div style="color:#999;">${e.location}</div>
      <a href="${e.link}" target="_blank" 
         style="display:inline-block;margin-top:.5rem;color:#000;background:#00e0ff;padding:.3rem .6rem;border-radius:6px;">
         View
      </a>
    `;

    container.appendChild(div);
  });

  list.appendChild(container);

  list.innerHTML += `
    <div style="text-align:center;color:#888;font-size:.8rem;">
      <hr style="border-top:1px solid rgba(255,255,255,.1);margin:1rem 0;">
      🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}
    </div>
  `;
}

fetchEvents();
