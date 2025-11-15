// eventsFeed.js — CharlestonHacks (2025 Final)

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

export async function loadEvents() {
  const list = document.getElementById("events-list");
  if (!list) return;

  list.innerHTML = `<p style="opacity:.7;">Loading events…</p>`;

  try {
    const res = await fetch(FEED_URL);
    const json = await res.json();
    const events = json.events || [];

    const upcoming = events.filter(e => e.startDate);
    const groups = events.filter(e => !e.startDate);

    let html = "";

    /* --------------------------- */
    /* 1. Upcoming dated events    */
    /* --------------------------- */
    if (upcoming.length) {
      html += `<h3 style="color:var(--cyan);margin-top:.5rem;">Coming Up</h3>`;
      html += upcoming.map(renderEvent).join("");
    }

    /* --------------------------- */
    /* 2. Meetup-style groups      */
    /* --------------------------- */
    if (groups.length) {
      html += `<h3 style="color:var(--cyan);margin-top:1rem;">Community Groups</h3>`;
      html += groups.map(ev => renderEvent(ev, true)).join("");
    }

    list.innerHTML = html;

  } catch (err) {
    list.innerHTML = `<p style="color:red;">Error loading events.</p>`;
  }
}

function formatDate(iso) {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderEvent(ev, isGroup = false) {
  return `
    <div class="event-item">

      ${ev.image ? `
        <img src="${ev.image}" class="event-thumb" style="
          width:100%;
          max-height:160px;
          object-fit:cover;
          border-radius:8px;
          margin-bottom:.5rem;
        ">
      ` : ""}

      <h3 style="margin-bottom:.25rem;">${ev.title}</h3>

      <div class="event-date">${formatDate(ev.startDate)}</div>

      <div style="opacity:.9;margin:.25rem 0;">
        ${ev.location || "Charleston, SC"}
      </div>

      ${ev.description ? `
        <div style="opacity:.7;font-size:.85rem;margin-top:.25rem;">
          ${ev.description.length > 120 ? ev.description.substring(0, 120) + "…" : ev.description}
        </div>
      ` : ""}

      <div style="margin-top:.35rem;">
        <span style="
          padding:.15rem .5rem;
          border-radius:4px;
          background:rgba(0,224,255,0.2);
          color:var(--cyan);
          font-size:.75rem;
        ">${ev.source}</span>
      </div>

      <a class="event-link" href="${ev.link}" target="_blank" style="display:inline-block;margin-top:.5rem;">
        View
      </a>
    </div>
  `;
}

/* Auto-start */
loadEvents();
