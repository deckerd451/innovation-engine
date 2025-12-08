/*
 * eventsPage.js
 *
 * This module powers the dedicated upcoming events page.  It fetches
 * events from a remote Cloudflare Worker (see FEED_URL) and groups
 * them into human‑friendly buckets: Today, This Week, Next Week,
 * Later This Month, Upcoming and Date TBD.  When the network is
 * unavailable the script falls back to a locally bundled JSON file.
 *
 * Usage: Included on events.html.  When the DOM content has
 * finished loading the script automatically fetches events and
 * populates the page.
 */

const FEED_URL =
  "https://charlestonhacks-events-proxy.deckerdb26354.workers.dev/";
const FALLBACK_URL = "assets/data/events.json";

// Format a date string into a friendly representation.  If no date is
// provided a placeholder string is returned instead.
function formatDate(dateStr) {
  if (!dateStr) return "Date TBD";
  const date = new Date(dateStr);
  if (isNaN(date)) return "Date TBD";
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Categorize events based on how far in the future they occur relative to
// the current date.  Returns an object keyed by section names with
// arrays of events as values.
function categorizeEvents(events) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(startOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  // end of the current week (Sunday).  JavaScript weeks start on Sunday.
  endOfWeek.setDate(startOfToday.getDate() + (7 - startOfToday.getDay()));
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfWeek.getDate() + 7);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const sections = {
    Today: [],
    "This Week": [],
    "Next Week": [],
    "Later This Month": [],
    Upcoming: [],
    "Date TBD": [],
  };

  events.forEach((ev) => {
    if (!ev.startDate) {
      sections["Date TBD"].push(ev);
      return;
    }
    const d = new Date(ev.startDate);
    if (isNaN(d)) {
      sections["Date TBD"].push(ev);
      return;
    }
    if (d < endOfToday) {
      sections["Today"].push(ev);
    } else if (d <= endOfWeek) {
      sections["This Week"].push(ev);
    } else if (d <= endOfNextWeek) {
      sections["Next Week"].push(ev);
    } else if (d <= endOfMonth) {
      sections["Later This Month"].push(ev);
    } else {
      sections["Upcoming"].push(ev);
    }
  });
  return sections;
}

// Sort events by their start date, placing undated events at the end.
function sortEvents(events) {
  return events.sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate) - new Date(b.startDate);
  });
}

// Render all events grouped by their section.  Clears any existing
// content in the list container before injecting new DOM nodes.
function renderEvents(grouped) {
  const list = document.getElementById("events-list");
  if (!list) return;
  list.innerHTML = "";
  const order = [
    "Today",
    "This Week",
    "Next Week",
    "Later This Month",
    "Upcoming",
    "Date TBD",
  ];
  order.forEach((section) => {
    const items = grouped[section];
    if (!items || !items.length) return;
    // Create section container
    const sectionEl = document.createElement("section");
    sectionEl.className = "section";
    // Header
    const header = document.createElement("h2");
    header.className = "section-header";
    header.textContent = section;
    sectionEl.appendChild(header);
    // Sort items in this section
    const sorted = sortEvents(items);
    sorted.forEach((ev) => {
      const card = document.createElement("div");
      card.className = "event-card";
      // Title
      const titleEl = document.createElement("h3");
      titleEl.className = "event-title";
      titleEl.textContent = ev.title;
      card.appendChild(titleEl);
      // Date
      const dateEl = document.createElement("p");
      dateEl.className = "event-date";
      dateEl.textContent = formatDate(ev.startDate);
      card.appendChild(dateEl);
      // Location
      if (ev.location) {
        const locEl = document.createElement("p");
        locEl.className = "event-location";
        locEl.textContent = ev.location;
        card.appendChild(locEl);
      }
      // Source
      const srcEl = document.createElement("p");
      srcEl.className = "event-source";
      srcEl.textContent = ev.source || "";
      card.appendChild(srcEl);
      // Description
      if (ev.description) {
        const descEl = document.createElement("p");
        descEl.className = "event-description";
        descEl.textContent = ev.description;
        card.appendChild(descEl);
      }
      // Link
      if (ev.link) {
        const linkEl = document.createElement("a");
        linkEl.className = "event-link";
        linkEl.href = ev.link;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.textContent = "View Event";
        card.appendChild(linkEl);
      }
      sectionEl.appendChild(card);
    });
    list.appendChild(sectionEl);
  });
}

// Update the last updated timestamp displayed on the page.  Accepts an ISO
// date string.  If no argument is provided or the date is invalid the
// timestamp is cleared.
function updateLastUpdated(iso) {
  const el = document.getElementById("lastUpdated");
  if (!el) return;
  if (!iso) {
    el.textContent = "";
    return;
  }
  const date = new Date(iso);
  if (isNaN(date)) {
    el.textContent = "";
    return;
  }
  el.textContent =
    "Last updated on " +
    date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
}

// Fetch events from the remote API and fall back to a local file on
// failure.  After loading data the function categorizes and renders
// events, and updates the last updated timestamp when available.
async function loadEvents() {
  const list = document.getElementById("events-list");
  if (list) list.innerHTML = `<p style="opacity:0.7;">Loading events…</p>`;
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    const events = data.events || data;
    const grouped = categorizeEvents(events);
    renderEvents(grouped);
    if (data.lastUpdated) updateLastUpdated(data.lastUpdated);
  } catch (err) {
    console.error("Error loading remote events", err);
    // fallback to local file
    try {
      const resp = await fetch(FALLBACK_URL);
      const fallback = await resp.json();
      const events = fallback.events || fallback;
      const grouped = categorizeEvents(events);
      renderEvents(grouped);
      // Use current time for fallback timestamp
      updateLastUpdated(new Date().toISOString());
    } catch (fallbackErr) {
      console.error("Error loading fallback events", fallbackErr);
      if (list)
        list.innerHTML = `<p>Unable to load events at this time. Please try again later.</p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", loadEvents);