// ============================================================================
// CharlestonHacks — Unified Events Feed Loader (2025 Final)
// Displays:
//   • "Coming Up" section for dated events
//   • "Community Groups" section for Meetup-style non-dated groups
//   • Images, descriptions, source badges
//   • "Add to Google Calendar" button
// ============================================================================

const FEED_URL = "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";

/* ----------------------------------------------------------------------------
   1. Google Calendar Link Generator
---------------------------------------------------------------------------- */
function generateGoogleCalURL(ev) {
  if (!ev.startDate) return null;

  const start = new Date(ev.startDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // default +1 hour

  const fmt = d =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "Event",
    dates: `${fmt(start)}/${fmt(end)}`,
    details: ev.description
      ? `${ev.description}\n\nSource: ${ev.source}\n${ev.link}`
      : `Source: ${ev.source}\n${ev.link}`,
    location: ev.location || "Charleston, SC"
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ----------------------------------------------------------------------------
   2. Load Events from Worker
---------------------------------------------------------------------------- */
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

    /* -------------------------------
       1. Upcoming events (dated)
    -------------------------------- */
    if (upcoming.length) {
      html += `
        <h3 style="color:var(--cyan);margin-top:.5rem;text-align:left;">
          Coming Up
        </h3>
      `;
      html += upcoming.map(ev => renderEvent(ev, false)).join("");
    }

    /* -------------------------------
       2. Community Groups (no dates)
    -------------------------------- */
    if (groups.length) {
      html += `
        <h3 style="color:var(--cyan);margin-top:1rem;text-align:left;">
          Community Groups
        </h3>
      `;
      html += groups.map(ev => renderEvent(ev, true)).join("");
    }

    list.innerHTML = html;

  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color:red;">Error loading events.</p>`;
  }
}

/* ----------------------------------------------------------------------------
   3. Render Event Card
---------------------------------------------------------------------------- */
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

      <h3 style="margin-bottom:.25rem;text-align:left;">${ev.title}</h3>

      <div class="event-date" style="text-align:left;">
        ${formatDate(ev.startDate)}
      </div>

      <div style="opacity:.9;margin:.25rem 0;text-align:left;">
        ${ev.location || "Charleston, SC"}
      </div>

      ${ev.description ? `
        <div style="opacity:.7;font-size:.85rem;margin-top:.25rem;text-align:left;">
          ${ev.description.length > 140 ? ev.description.substring(0, 140) + "…" : ev.description}
        </div>
      ` : ""}

      <div style="margin-top:.35rem;text-align:left;">
        <span style="
          padding:.15rem .5rem;
          border-radius:4px;
          background:rgba(0,224,255,0.2);
          color:var(--cyan);
          font-size:.75rem;
        ">${ev.source}</span>
      </div>

      <div style="margin-top:.5rem;text-align:left;">

        <!-- View Button -->
        <a class="event-link"
           href="${ev.link}"
           target="_blank"
           style="display:inline-block;margin-bottom:.35rem;">
          View
        </a>

        <!-- Add to Calendar Button -->
        ${ev.startDate ? `
          <a class="event-link"
             href="${generateGoogleCalURL(ev)}"
             target="_blank"
             style="
               display:inline-block;
               background: var(--gold);
               margin-left:.5rem;
               color:#000;
             ">
            + Add to Calendar
          </a>
        ` : ""}
      </div>

    </div>
  `;
}

/* ----------------------------------------------------------------------------
   4. Auto-load on module import
---------------------------------------------------------------------------- */
loadEvents();
