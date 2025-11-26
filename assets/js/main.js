// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (2025 FINAL FIX)
// Prevents multiple boot cycles (GitHub Pages occasionally reloads modules)
// ======================================================================

// ------------------------------------------------------
// 🔥 Duplicate-Boot Guard (CRITICAL FIX)
// ------------------------------------------------------
if (window.__MAIN_BOOT__) {
  console.warn("⚠️ Main already initialized — skipping duplicate boot.");
  // Prevent the rest of the file from executing
  throw new Error("MAIN_ALREADY_INITIALIZED");
}
window.__MAIN_BOOT__ = true;
// ------------------------------------------------------


import { initLoginSystem, setupLoginDOM } from "./login.js";
import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";
import { DOMElements, registerDomElement } from "./globals.js";

/* ------------------------------------------------------
   Register DOM references
------------------------------------------------------ */
function registerDOM() {
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));

  registerDomElement("teamBuilderSkillsInput", document.getElementById("team-skills-input"));
  registerDomElement("teamSizeInput", document.getElementById("teamSize"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("autocompleteNames", document.getElementById("autocomplete-names"));
}

/* ------------------------------------------------------
   Tabs Controller
------------------------------------------------------ */
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

      buttons.forEach((b) => b.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active-tab-pane"));
      btn.classList.add("active");

      const pane = document.getElementById(tab);
      if (pane) pane.classList.add("active-tab-pane");

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

/* ------------------------------------------------------
   Search Hooks
------------------------------------------------------ */
function initSearchEngineHooks() {
  import("./searchEngine.js").then((searchEngine) => {
    document.getElementById("find-team-btn")?.addEventListener("click", () => {
      searchEngine.findMatchingUsers();
    });

    document.getElementById("search-name-btn")?.addEventListener("click", () => {
      searchEngine.findByName();
    });

    document.getElementById("buildTeamBtn")?.addEventListener("click", () => {
      searchEngine.buildBestTeam();
    });
  });
}

/* ------------------------------------------------------
   ESC exits Synapse View
------------------------------------------------------ */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const container = document.getElementById("synapse-container");
  if (!container.classList.contains("active")) return;

  container.classList.remove("active");

  document.querySelector(".header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.getElementById("neural-bg").style.display = "";

  // Return to Profile tab
  document.querySelector('[data-tab="profile"]')?.click();
});

/* ------------------------------------------------------
   FULL SYSTEM BOOT
------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initializing Innovation Engine…");

  registerDOM();
  setupLoginDOM(); // Login input/button become active immediately

  // AUTH FIRST (only runs once due to login.js guards)
  await initLoginSystem();

  // MAIN BOOT — only when login.js emits auth-ready
  window.addEventListener("auth-ready", async () => {
    console.log("🔐 Auth is ready — booting remaining systems…");

    initTabs();
    initSearchEngineHooks();
    await initProfileForm();

    console.log("✅ Innovation Engine fully initialized");
  });
});
