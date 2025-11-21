// ==========================================================================
// CharlestonHacks Innovation Engine — GLOBALS (2025 FINAL)
// Unified global state, DOM registry, notifications, event bus
// Fully compatible with:
//   - Login System (Magic Links + Backfill)
//   - Profile Controller (Option B final schema)
//   - Synapse View 3.0
//   - SearchEngine 3.0
//   - Team Builder / Leaderboard
// ==========================================================================

// ------------------------------------------------------------
// 1) GLOBAL APP STATE (persistent across all modules)
// ------------------------------------------------------------
export const appState = globalThis.appState ?? (globalThis.appState = {
  session: null,            // Supabase auth session
  user: null,               // Supabase user object
  community: [],            // Cached community table rows
  connections: [],          // Cached connections
  endorsements: [],         // Cached endorsements
  loading: false,           // UI loading indicator
  version: "2025.11.21-PROD"
});
globalThis.appState = appState;


// ------------------------------------------------------------
// 2) GLOBAL DOM REGISTRY (avoids repeated DOM lookups)
// ------------------------------------------------------------
export const DOMElements = globalThis.DOMElements ?? (globalThis.DOMElements = {
  loginSection: null,
  profileSection: null,
  skillInput: null,
  nameInput: null,
  notificationContainer: null,
  cardContainer: null,
  teamSkillsInput: null,
  bestTeamContainer: null,
});
globalThis.DOMElements = DOMElements;


// ------------------------------------------------------------
// 3) GLOBAL EVENT BUS (lightweight message system)
// ------------------------------------------------------------
export const events = globalThis.events ?? (globalThis.events = {
  listeners: {},

  on(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  },

  emit(event, payload) {
    (this.listeners[event] ?? []).forEach(fn => fn(payload));
  }
});
globalThis.events = events;


// ------------------------------------------------------------
// 4) NOTIFICATIONS — Toast-style UI alerts (global)
// ------------------------------------------------------------
export function showNotification(message, type = "info") {
  let box = document.getElementById("global-notification-box");

  if (!box) {
    box = document.createElement("div");
    box.id = "global-notification-box";
    box.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      max-width: 280px;
      font-family: system-ui, sans-serif;
    `;
    document.body.appendChild(box);
  }

  const note = document.createElement("div");
  note.className = "notification-toast";
  note.textContent = message;

  note.style.cssText = `
    padding: 12px 16px;
    margin-bottom: 10px;
    border-radius: 6px;
    font-size: 14px;
    color: white;
    box-shadow: 0 0 10px rgba(0,0,0,0.25);
    opacity: 0;
    transition: opacity .3s ease;
    backdrop-filter: blur(4px);
  `;

  if (type === "success") note.style.background = "rgba(0,180,90,0.85)";
  else if (type === "error") note.style.background = "rgba(200,40,40,0.85)";
  else note.style.background = "rgba(40,140,240,0.85)";

  box.appendChild(note);

  // fade in
  requestAnimationFrame(() => (note.style.opacity = 1));

  // fade out + remove
  setTimeout(() => {
    note.style.opacity = 0;
    setTimeout(() => note.remove(), 300);
  }, 2800);
}
globalThis.showNotification = showNotification;


// ------------------------------------------------------------
// 5) DOM Element Registration Helper (used by main.js)
// ------------------------------------------------------------
export function registerDomElement(key, el) {
  DOMElements[key] = el;
  globalThis.DOMElements[key] = el;
  return el;
}
globalThis.registerDomElement = registerDomElement;


// ==========================================================================
// END OF globals.js (FINAL PRODUCTION BUILD)
// ==========================================================================
