// =============================================================
// CharlestonHacks Innovation Engine — Main App Controller (2025)
// Handles:
//   • Tab Navigation
//   • Search Engine Wiring
//   • Team Builder Wiring
//   • Synapse View Integration
//   • DOM Element Registration
// =============================================================

import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";
import { findMatchingUsers, findByName, buildBestTeam } from "./searchEngine.js";
import { DOMElements, registerDomElement } from "./globals.js";

// =============================================================
// 1) REGISTER DOM ELEMENTS FOR SEARCH ENGINE
// =============================================================
document.addEventListener("DOMContentLoaded", () => {

  // Skill Search
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));

  // Name Search
  registerDomElement("nameInput", document.getElementById("nameInput"));

  // Team Builder
  registerDomElement("teamBuilderSkillsInput", document.getElementById("team-skills-input"));
  registerDomElement("teamSizeInput", document.getElementById("teamSize"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  console.log("🔧 DOM elements registered");
});

// =============================================================
// 2) TAB SYSTEM
// =============================================================
export function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");

  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");

  if (!buttons.length || !panes.length) {
    console.warn("⚠ No tab buttons or panes found.");
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");

      // Reset state
      buttons.forEach(b => b.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active-tab-pane"));

      // Activate selected
      btn.classList.add("active");
      document.getElementById(tab)?.classList.add("active-tab-pane");

      // Special case: Synapse
      if (tab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        bgCanvas.style.display = "none";

        await initSynapseView();
        return;
      }

      // Normal tabs restore UI
      header.style.display = "";
      footer.style.display = "";
      bgCanvas.style.display = "";
    });
  });
}

// =============================================================
// 3) BUTTON EVENT WIRING FOR SEARCH ENGINE
// =============================================================
document.addEventListener("DOMContentLoaded", () => {

  // Skill Search
  const skillBtn = document.getElementById("find-team-btn");
  if (skillBtn) {
    skillBtn.addEventListener("click", () => {
      console.log("🔍 Running skill search...");
      findMatchingUsers();
    });
  }

  // Name Search
  const nameBtn = document.getElementById("search-name-btn");
  if (nameBtn) {
    nameBtn.addEventListener("click", () => {
      console.log("🔍 Running name search...");
      findByName();
    });
  }

  // Team Builder
  const buildBtn = document.getElementById("buildTeamBtn");
  if (buildBtn) {
    buildBtn.addEventListener("click", () => {
      console.log("👥 Building team...");
      buildBestTeam();
    });
  }

  console.log("🔌 SearchEngine wiring complete.");
});

// =============================================================
// 4) SYNAPSE EXIT HANDLER
// =============================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const synapsePane = document.getElementById("synapse");
    if (synapsePane && synapsePane.classList.contains("active-tab-pane")) {
      exitSynapseView();
    }
  }
});

function exitSynapseView() {
  document.querySelector("header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.getElementById("neural-bg").style.display = "";

  document.getElementById("synapse")?.classList.remove("active-tab-pane");

  // Return to profile tab
  document.querySelector('[data-tab="profile"]')?.click();

  console.log("⬅️ Exited Synapse View");
}

// =============================================================
// 5) MAIN STARTUP
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initProfileForm();

  console.log("🚀 Innovation Engine initialized");
});
