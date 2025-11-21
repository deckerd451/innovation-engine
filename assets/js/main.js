// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (2025 FINAL BUILD)
// Orchestrates:
//   ✔ DOM registry (globals.js)
//   ✔ Tab system
//   ✔ Login system
//   ✔ Profile form
//   ✔ Search engine
//   ✔ Synapse view
// ======================================================================

import { initLoginSystem } from "./login.js";
import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";
import { DOMElements, registerDomElement } from "./globals.js";

// ======================================================================
// 1) REGISTER ALL DOM ELEMENTS
// ======================================================================
function registerDOM() {
  // Individual search
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));

  // Team Builder
  registerDomElement("teamBuilderSkillsInput", document.getElementById("team-skills-input"));
  registerDomElement("teamSizeInput", document.getElementById("teamSize"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  // Autocomplete boxes
  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("autocompleteNames", document.getElementById("autocomplete-names"));
}

// ======================================================================
// 2) TAB SYSTEM
// ======================================================================
function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");

  const header = document.querySelector(".header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");
  const synapseContainer = document.getElementById("synapse-container");

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;

      // Reset UI
      buttons.forEach((b) => b.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active-tab-pane"));

      btn.classList.add("active");
      document.getElementById(tab)?.classList.add("active-tab-pane");

      // Fullscreen synapse
      if (tab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        if (bgCanvas) bgCanvas.style.display = "none";

        synapseContainer.classList.add("active");

        await initSynapseView();
      } else {
        synapseContainer.classList.remove("active");

        header.style.display = "";
        footer.style.display = "";
        if (bgCanvas) bgCanvas.style.display = "";
      }
    });
  });
}

// ======================================================================
// 3) WIRE SEARCH ENGINE BUTTONS
// ======================================================================
function initSearchEngineHooks() {
  import("./searchEngine.js").then((searchEngine) => {
    const getPeopleBtn = document.getElementById("find-team-btn");
    const findByNameBtn = document.getElementById("search-name-btn");
    const buildTeamBtn = document.getElementById("buildTeamBtn");

    if (getPeopleBtn) {
      getPeopleBtn.addEventListener("click", () => searchEngine.findMatchingUsers());
    }
    if (findByNameBtn) {
      findByNameBtn.addEventListener("click", () => searchEngine.findByName());
    }
    if (buildTeamBtn) {
      buildTeamBtn.addEventListener("click", () => searchEngine.buildBestTeam());
    }
  });
}

// ======================================================================
// 4) ESC HANDLER TO EXIT SYNAPSE VIEW
// ======================================================================
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const container = document.getElementById("synapse-container");
  if (!container.classList.contains("active")) return;

  // Close fullscreen synapse
  container.classList.remove("active");

  const header = document.querySelector(".header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");

  header.style.display = "";
  footer.style.display = "";
  if (bgCanvas) bgCanvas.style.display = "";

  // switch back to profile tab
  const profileTab = document.querySelector('[data-tab="profile"]');
  profileTab?.click();

  console.log("🧠 Exited Synapse View");
});

// ======================================================================
// 5) FULL SYSTEM INITIALIZATION
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initializing Innovation Engine…");

  registerDOM();
  initTabs();
  initSearchEngineHooks();

  // Auth first (so profile and synapse load correctly)
  await initLoginSystem();

  // Load profile after login / session restore
  await initProfileForm();

  console.log("✅ Innovation Engine fully initialized");
});
