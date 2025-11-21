// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (2025 FINAL)
// Wires together:
//   ✔ Login System (Magic Link + Backfill)
//   ✔ Profile (Option B SAFE user_id binding)
//   ✔ SearchEngine 3.0
//   ✔ Synapse View 3.0 Fullscreen
//   ✔ Globals + DOM registry
// ======================================================================

import { initLoginSystem } from "./login.js";
import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";
import { showNotification } from "./utils.js";
import { DOMElements, registerDomElement } from "./globals.js";

// ======================================================================
// 1) REGISTER DOM ELEMENTS
// ======================================================================
function registerDOM() {
  registerDomElement("loginSection", document.getElementById("login-section"));
  registerDomElement("profileSection", document.getElementById("profile-section"));
  registerDomElement("notificationContainer", document.getElementById("achievements"));

  // Search inputs
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("nameInput", document.getElementById("nameInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));

  // Team builder
  registerDomElement("teamSkillsBuilder", document.getElementById("team-skills-input"));
  registerDomElement("teamSizeInput", document.getElementById("teamSize"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));
}

// ======================================================================
// 2) TAB NAVIGATION SYSTEM
// ======================================================================
function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");

  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");

      // Hide all
      buttons.forEach((b) => b.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active-tab-pane"));

      // Show selected
      btn.classList.add("active");
      document.getElementById(tab)?.classList.add("active-tab-pane");

      // -------------------------------------------------------------
      // SYNAPSE MODE — Fullscreen takeover
      // -------------------------------------------------------------
      if (tab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        bgCanvas.style.display = "none";

        const synContainer = document.getElementById("synapse-container");
        synContainer.classList.add("active");

        await initSynapseView();
      } else {
        // Restore UI when exiting synapse
        header.style.display = "";
        footer.style.display = "";
        bgCanvas.style.display = "";

        document.getElementById("synapse-container").classList.remove("active");
      }
    });
  });
}

// ======================================================================
// 3) SEARCH ENGINE HOOKS
// ======================================================================
function initSearchEngineHooks() {
  import("./searchEngine.js").then((engine) => {
    // Search by skills
    const skillBtn = document.getElementById("find-team-btn");
    if (skillBtn) {
      skillBtn.addEventListener("click", () => engine.findMatchingUsers());
    }

    // Search by name
    const nameBtn = document.getElementById("search-name-btn");
    if (nameBtn) {
      nameBtn.addEventListener("click", () => engine.findByName());
    }

    // Team Builder
    const buildBtn = document.getElementById("buildTeamBtn");
    if (buildBtn) {
      buildBtn.addEventListener("click", () => engine.buildBestTeam());
    }
  });
}

// ======================================================================
// 4) ESC KEY — EXIT SYNAPSE VIEW
// ======================================================================
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const syn = document.getElementById("synapse-container");
  if (!syn.classList.contains("active")) return;

  // Close synapse
  syn.classList.remove("active");

  document.querySelector("header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.getElementById("neural-bg").style.display = "";

  // Return to profile tab
  const profileTab = document.querySelector('[data-tab="profile"]');
  if (profileTab) profileTab.click();

  console.log("🧠 Exited Synapse View via ESC");
});

// ======================================================================
// 5) FULL PAGE INITIALIZATION
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initializing CharlestonHacks Innovation Engine…");

  registerDOM();
  initTabs();
  initSearchEngineHooks();

  // 1) Login first (critical for RLS + backfill)
  await initLoginSystem();

  // 2) Load profile AFTER login has restored
  await initProfileForm();

  console.log("✅ MAIN.js fully initialized (production build)");
});
