// =============================================================
// CharlestonHacks Innovation Engine — Main Controller (2025)
// Fully Synced with SearchEngine 3.0 + Synapse 3.0 + New DOM
// =============================================================

import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";
import { showNotification } from "./utils.js";
import { DOMElements, registerDomElement } from "./globals.js";

// =============================================================
// 1) REGISTER DOM ELEMENTS (VERY IMPORTANT)
// =============================================================
function registerDOM() {
  // Skill search
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));

  // Name search
  registerDomElement("nameInput", document.getElementById("nameInput"));

  // Team builder
  registerDomElement("teamBuilderSkillsInput", document.getElementById("team-skills-input"));
  registerDomElement("teamSizeInput", document.getElementById("teamSize"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  // Autocomplete boxes (optional future use)
  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("autocompleteNames", document.getElementById("autocomplete-names"));
}

// =============================================================
// 2) TAB SYSTEM
// =============================================================
function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");

  const header = document.querySelector(".header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");

  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");

      // Reset all
      buttons.forEach(b => b.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active-tab-pane"));

      // Activate selected
      btn.classList.add("active");
      const pane = document.getElementById(tab);
      if (pane) pane.classList.add("active-tab-pane");

      // === SYNAPSE TAB ===
      if (tab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        if (bgCanvas) bgCanvas.style.display = "none";

        const container = document.getElementById("synapse-container");
        container.classList.add("active");

        await initSynapseView();
      } else {
        // Leave synapse fullscreen
        header.style.display = "";
        footer.style.display = "";
        if (bgCanvas) bgCanvas.style.display = "";

        const container = document.getElementById("synapse-container");
        container.classList.remove("active");
      }
    });
  });
}

// =============================================================
// 3) WIRE SEARCHENGINE 3.0 (skill search + name + team builder)
// =============================================================
function initSearchEngineHooks() {
  import("./searchEngine.js").then(searchEngine => {
    // Skill search (Individual Search tab)
    const btn = document.getElementById("find-team-btn");
    if (btn) {
      btn.addEventListener("click", () => searchEngine.findMatchingUsers());
    }

    // Name search
    const nameBtn = document.getElementById("search-name-btn");
    if (nameBtn) {
      nameBtn.addEventListener("click", () => searchEngine.findByName());
    }

    // Team Builder
    const buildBtn = document.getElementById("buildTeamBtn");
    if (buildBtn) {
      buildBtn.addEventListener("click", () => searchEngine.buildBestTeam());
    }
  });
}

// =============================================================
// 4) EXIT SYNAPSE (ESC)
// =============================================================
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const container = document.getElementById("synapse-container");
    if (container.classList.contains("active")) {
      container.classList.remove("active");

      const header = document.querySelector(".header");
      const footer = document.querySelector("footer");
      const bgCanvas = document.getElementById("neural-bg");

      header.style.display = "";
      footer.style.display = "";
      if (bgCanvas) bgCanvas.style.display = "";

      // Return to Profile tab
      const profileTab = document.querySelector('[data-tab="profile"]');
      profileTab?.click();

      console.log("🧠 Exited Synapse View");
    }
  }
});

// =============================================================
// 5) PAGE INITIALIZATION
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
  registerDOM();
  initTabs();
  initProfileForm();
  initSearchEngineHooks();

  console.log("✅ MAIN.js initialized — DOM, Tabs, SearchEngine, Synapse wired");
});
