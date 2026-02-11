// ======================================================================
// CharlestonHacks – GLOBAL STATE MODULE (2025 FINAL BUILD)
// Shared across: main.js, searchEngine.js, profile.js, synapse.js
// Provides:
//   ✔ appState — global state container
//   ✔ DOMElements — stable element registry
//   ✔ registerDomElement() — safe DOM linking
//   ✔ showNotification fallback (optional)
//
// This file must load BEFORE main.js
// ======================================================================

// -----------------------------------------------------------
// 1) GLOBAL APP STATE (shared memory)
// -----------------------------------------------------------
export const appState = {
  currentUser: null,          // Supabase authenticated user
  communityCache: [],         // Cached community table rows
  searchResults: [],          // Results from searchEngine.js
  synapseInitialized: false,  // Prevent duplicate synapse init
  skillsCache: [],            // Autocomplete skills list
  loading: false              // UX hooks
};

// -----------------------------------------------------------
// 2) DOM ELEMENT REGISTRY
// -----------------------------------------------------------
// This allows main.js to safely register DOM elements
// and lets other modules reference them safely with no null errors.
export const DOMElements = {};

// Store elements by human-readable key:
export function registerDomElement(key, element) {
  if (!element) {
    console.warn(`[globals] Warning: Missing DOM element for key "${key}"`);
    return;
  }
  DOMElements[key] = element;
}

// -----------------------------------------------------------
// 3) GLOBAL NOTIFICATION FALLBACK
// -----------------------------------------------------------
// Used by login.js, profile.js, synapse.js, searchEngine.js
// If utils.showNotification is unavailable, fallback gracefully.
export function showNotification(message, type = "info") {
  let box = document.getElementById("ch-notify-box");

  if (!box) {
    box = document.createElement("div");
    box.id = "ch-notify-box";
    box.style.position = "fixed";
    box.style.bottom = "20px";
    box.style.right = "20px";
    box.style.padding = "14px 20px";
    box.style.borderRadius = "8px";
    box.style.color = "white";
    box.style.fontFamily = "system-ui, sans-serif";
    box.style.fontSize = "15px";
    box.style.zIndex = 99999;
    box.style.opacity = "0";
    box.style.transition = "opacity 0.3s ease-out";
    document.body.appendChild(box);
  }

  const colors = {
    success: "#00c853",
    error: "#ff3d00",
    info: "#29b6f6",
    warn: "#ffb300"
  };

  box.textContent = message;
  box.style.background = colors[type] || colors.info;

  requestAnimationFrame(() => {
    box.style.opacity = "1";
  });

  setTimeout(() => {
    box.style.opacity = "0";
  }, 2400);
}

console.log("⚙️ globals.js loaded successfully");
