// assets/js/main.js
// CharlestonHacks Innovation Engine — Main UI Controller
// Handles tab switching, section visibility, and layout transitions

import { initProfileForm } from "./profile.js";
import { initSynapseView } from "./synapse.js";

/* =========================================================
   1️⃣ Initialize all tab navigation and layout controls
========================================================= */
export function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");

  // Fallback check
  if (!buttons.length || !panes.length) return;

  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const selectedTab = btn.getAttribute("data-tab");

      // 🔹 Deactivate all tabs
      buttons.forEach(b => b.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active-tab-pane"));

      // 🔹 Activate selected tab
      btn.classList.add("active");
      const activePane = document.getElementById(selectedTab);
      if (activePane) activePane.classList.add("active-tab-pane");

      // 🔹 Special behavior for Synapse fullscreen mode
      if (selectedTab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        if (bgCanvas) bgCanvas.style.display = "none";

        // Initialize Synapse view only once per session
        await initSynapseView();
      } else {
        header.style.display = "";
        footer.style.display = "";
        if (bgCanvas) bgCanvas.style.display = "";
      }
    });
  });
}

/* =========================================================
   2️⃣ On page load
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize tab system
  initTabs();

  // Initialize Profile form handlers
  initProfileForm();

  console.log("✅ Main UI initialized — tabs ready");
});
