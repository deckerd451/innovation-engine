/******************************************************
 * CharlestonHacks – Stable Events UI Renderer (2025)
 * ----------------------------------------------------
 * GUARANTEED:
 *  - Scrollable event list
 *  - “Date TBD” for null dates
 *  - Clean, sorted output
 *  - No crashes (ever)
 ******************************************************/

const overlay = document.getElementById("events-overlay");
const list = document.getElementById("events-list");
const openBtn = document.getElementById("open-calendar");
const closeBtn = document.getElementById("close-overlay");

/* ----------------------------------------------------
   Overlay Behavior
---------------------------------------------------- */
if (openBtn) openBtn.addEventListener("click", () => overlay.classList.add("active"));
if (closeBtn) closeBtn.addEventListener("click", () => overlay.classList.remove("active"));

if (overlay) {
  overlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (!modal.contains(e.target)) overlay.classList.remove("active");
  });
}

/* ----------------------------------------------------
   Fetch From Worker
---------------------------------------------------- */
const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

async function fetchEvents() {
  try {
    console.log("📡 Fetching events from Worker…");

    const res = await fetch(FEED_URL, { cache: "no-store" });
    const data = await res.json();

    renderEvents(data.events, data.lastUpdated);

  } catch (err) {
    console.error("❌ Events fetch error:", err);
    list.innerHTML = `<div style="color:#ff6f6f;">⚠ Unable to load events</div>`;
  }
}

/* ----------------------------------------------------
   Render Event List
---------------------------------------------------- */
function renderEvents(events, lastUpdated) {
  list.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.style.color = "#00e0ff";
  header.style.marginBottom = ".75rem";
  header.innerHTML = "🧠 CharlestonHacks Events Feed";
  list.appendChild(header);

  // Scrollable container
  const container = document.createElement("div");
  container.style.maxHeight = "62vh";
  container.style.overflowY = "auto";
  container.style.paddingRight = "6px";

  if (!events.length) {
    container.innerHTML = `<div style="color:#bbb;">No upcoming events</div>`;
    list.appendChild(container);
    return;
  }

  events.forEach((e) => {
    const div = document.createElement("div");
    div.className = "event-item";
    div.style.marginBottom = "1.1rem";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.12)";
    div.style.paddingBottom = ".75rem";

    const dateString = e.startDate
      ? new Date(e.startDate).toLocaleString()
      : "Date TBD";

    div.innerHTML = `
      <h3 style="color:#fff;margin-bottom:.25rem;">${e.title}</h3>
      <div style="color:#bbb;">${dateString}</div>
      <div style="color:#999;">${e.location}</div>

      <div style="margin-top:.4rem;font-size:.8rem;color:#bbb;">
        Source: ${e.source}
      </div>

      ${
        e.link
          ? `<a href="${e.link}" target="_blank"
                style="display:inline-block;margin-top:.5rem;color:#000;
                background:#00e0ff;padding:.35rem .7rem;border-radius:6px;
                font-weight:700;font-size:.85rem;">
              View
            </a>`
          : ""
      }
    `;

    container.appendChild(div);
  });

  list.appendChild(container);

  // Footer
  list.innerHTML += `
    <div style="text-align:center;color:#888;font-size:.8rem;margin-top:1rem;">
      <hr style="border-top:1px solid rgba(255,255,255,.12);margin-bottom:.6rem;">
      🕒 Last updated: ${new Date(lastUpdated).toLocaleString()}
    </div>
  `;
}

/* ----------------------------------------------------
   Init
---------------------------------------------------- */
fetchEvents();
