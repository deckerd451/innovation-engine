/******************************************************
 * CharlestonHacks – Events UI Renderer (Stable)
 * ----------------------------------------------------
 * • No assumptions about event data
 * • Fully guarded (never crashes)
 * • Safe countdown
 * • Graceful empty state handling
 * • Works with your current Worker output exactly
 ******************************************************/

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");
const titleEl = document.getElementById("next-event-title");
const countdownEl = document.getElementById("countdown");

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

let activeCountdownTimer = null;

/* ----------------------------------------------
   OVERLAY CONTROLS
---------------------------------------------- */
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));

if (overlay) {
  overlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (!modal.contains(e.target)) overlay.classList.remove("active");
  });
}

/* ----------------------------------------------
   COUNTDOWN ENGINE (SAFE)
---------------------------------------------- */
function startCountdown(targetDateStr) {
  if (!countdownEl) return;

  const target = new Date(targetDateStr);
  if (isNaN(target)) {
    countdownEl.innerHTML = "Invalid date";
    return;
  }

  if (activeCountdownTimer) clearInterval(activeCountdownTimer);

  function render() {
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      countdownEl.innerHTML = `<span style="color:#00e0ff;">LIVE NOW 🔥</span>`;
      clearInterval(activeCountdownTimer);
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (x) => x.toString().padStart(2, "0");

    countdownEl.innerHTML = `
      <span style="color:#00e0ff;font-weight:700;">HH2025:</span>
      <span>${d}d</span>
      <span>${pad(h)}h</span>
      <span>${pad(m)}m</span>
      <span>${pad(s)}s</span>
    `;
  }

  render();
  activeCountdownTimer = setInterval(render, 1000);
}

function updateCountdown(event) {
  if (!titleEl) return;

  // No events — safe, no crash
  if (!event) {
    titleEl.innerHTML = `
      <span style="color:#aaa;">No upcoming events</span>
    `;
    if (countdownEl) countdownEl.innerHTML = "";
    return;
  }

  const dt = new Date(event.startDate).toLocaleString();

  titleEl.innerHTML = `
    Next: <span style="color:#00e0ff;">${event.title}</span>
    <small style="opacity:0.7; display:block;">${dt} @ ${event.location}</small>
  `;

  startCountdown(event.startDate);
}

/* ----------------------------------------------
   FETCH EVENTS FROM WORKER (SAFE)
---------------------------------------------- */
async function fetchEvents() {
  try {
    console.log("📡 Fetching events from Worker…");

    const res = await fetch(FEED_URL, { cache: "no-store" });
    const data = await res.json();

    const events = Array.isArray(data.events) ? data.events : [];

    renderEvents(events, data.lastUpdated);
    updateCountdown(events[0] || null);

  } catch (err) {
    console.error("❌ UI fetch error:", err);

    list.innerHTML = `
      <div style="color:#ff6f6f;">⚠ Error loading events</div>
    `;
  }
}

/* ----------------------------------------------
   RENDER EVENTS LIST
---------------------------------------------- */
function renderEvents(events, lastUpdated) {
  list.innerHTML = "";

  const header = document.createElement("div");
  header.style.color = "#00e0ff";
  header.style.marginBottom = ".5rem";
  header.innerHTML = "🧠 CharlestonHacks Events Feed";
  list.appendChild(header);

  const container = document.createElement("div");
  container.style.maxHeight = "60vh";
  container.style.overflowY = "auto";

  if (!events.length) {
    container.innerHTML = `
      <div style="color:#ccc; padding:1rem; text-align:center;">
        No upcoming events
      </div>
    `;
  } else {
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
        <div style="margin-top:.4rem; font-size:.75rem; color:#bbb;">
          Source: ${e.source}
        </div>
        <a href="${e.link}" target="_blank"
           style="display:inline-block;margin-top:.5rem;color:#000;
                  background:#00e0ff;padding:.3rem .6rem;border-radius:6px;">
           View
        </a>
      `;
      container.appendChild(div);
    });
  }

  list.appendChild(container);

  list.innerHTML += `
    <div style="text-align:center;color:#888;font-size:.8rem;">
      <hr style="border-top:1px solid rgba(255,255,255,.1);margin:1rem 0;">
      🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}
    </div>
  `;
}

/* ----------------------------------------------
   INIT
---------------------------------------------- */
fetchEvents();
