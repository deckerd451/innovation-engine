// ==========================================================================
// CharlestonHacks Innovation Engine — GLOBALS (2025)
// Unified global state, DOM registry, event bus, and notifications
// Fully compatible with:
//   - Synapse View 3.0
//   - Unified Search Engine 3.0
//   - Profile Controller (Schema A)
//   - Team Builder + Name Search
//   - GitHub Pages + ESM
// ==========================================================================

// --------------------------------------------------------------------------
// 1) GLOBAL APP STATE (persistent across modules)
// --------------------------------------------------------------------------
export const appState = globalThis.appState ?? (globalThis.appState = {
  session: null,           // Supabase session
  user: null,              // Cached user metadata
  synapseActive: false,    // For fullscreen mode handling
  lastSearch: null,        // Debug helper
  features: {
    connectionEngine: true,
    eventMode: false,
    aiGlia: false,
  }
});

// --------------------------------------------------------------------------
// 2) DOM ELEMENT REGISTRY — SINGLE SOURCE OF TRUTH
// --------------------------------------------------------------------------
export const DOMElements = globalThis.DOMElements ?? (globalThis.DOMElements = {

  // ==== SEARCH TAB ====
  teamSkillsInput: document.getElementById("teamSkillsInput"),
  nameInput: document.getElementById("nameInput"),
  findTeamBtn: document.getElementById("find-team-btn"),
  searchNameBtn: document.getElementById("search-name-btn"),
  cardContainer: document.getElementById("cardContainer"),
  noResults: document.getElementById("noResults"),

  // ==== TEAM BUILDER TAB ====
  teamBuilderSkillsInput: document.getElementById("team-skills-input"),
  teamSizeInput: document.getElementById("teamSize"),
  buildTeamBtn: document.getElementById("buildTeamBtn"),
  bestTeamContainer: document.getElementById("bestTeamContainer"),

  // ==== PROFILE TAB ====
  profileForm: document.getElementById("skills-form"),

  firstNameInput: document.getElementById("first-name"),
  lastNameInput: document.getElementById("last-name"),
  emailInput: document.getElementById("email"),
  skillsInput: document.getElementById("skills-input"),
  bioInput: document.getElementById("bio-input"),
  availabilityInput: document.getElementById("availability-input"),
  photoInput: document.getElementById("photo-input"),
  previewImg: document.getElementById("preview"),

  // ==== AUTH ====
  loginSection: document.getElementById("login-section"),
  profileSection: document.getElementById("profile-section"),
  userBadge: document.getElementById("user-badge"),
  logoutBtn: document.getElementById("logout-btn"),

  // ==== UI ====
  neuralBg: document.getElementById("neural-bg"),
});

// --------------------------------------------------------------------------
// 3) EVENT BUS — for cross-module communication
// --------------------------------------------------------------------------
export const Events = globalThis.Events ?? (globalThis.Events = new EventTarget());

export function emit(eventName, detail = {}) {
  Events.dispatchEvent(new CustomEvent(eventName, { detail }));
}
export function on(eventName, callback) {
  Events.addEventListener(eventName, (evt) => callback(evt.detail));
}

// Example debug listener
on("debug:pong", (d) => console.log("[globals] pong:", d));


// --------------------------------------------------------------------------
// 4) NOTIFICATION SYSTEM (UI-safe + backwards compatible)
// --------------------------------------------------------------------------
export function showNotification(msg, type = "info") {
  try {
    // If you have a custom UI or toast lib, put it here:
    // window.Toast.show(msg, type);

    console.log(`[NOTIFY:${type}]`, msg);
  } catch (err) {
    console.log("[NOTIFY:failover]", msg);
  }
}
globalThis.showNotification = showNotification;


// --------------------------------------------------------------------------
// 5) DOM Element Registration Helper (legacy support)
// --------------------------------------------------------------------------
export function registerDomElement(key, el) {
  DOMElements[key] = el;
  globalThis.DOMElements[key] = el;
  return el;
}
globalThis.registerDomElement = registerDomElement;


// ==========================================================================
// END OF FILE
// ==========================================================================
