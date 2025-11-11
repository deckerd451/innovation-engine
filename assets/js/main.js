// assets/js/main.js
// CharlestonHacks Innovation Engine — Main UI Controller
// Handles tab switching, section visibility, fullscreen mode, and Synapse exit controls.

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

  if (!buttons.length || !panes.length) return;

  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const selectedTab = btn.getAttribute("data-tab");

      // 🔹 Reset all tabs/panes
      buttons.forEach(b => b.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active-tab-pane"));

      // 🔹 Activate selected tab
      btn.classList.add("active");
      const activePane = document.getElementById(selectedTab);
      if (activePane) activePane.classList.add("active-tab-pane");

      // 🔹 Handle Synapse fullscreen view
      if (selectedTab === "synapse") {
        header.style.display = "none";
        footer.style.display = "none";
        if (bgCanvas) bgCanvas.style.display = "none";

        // Initialize Synapse once when entering
        await initSynapseView();

        // Show exit button
        const exitBtn = document.getElementById("exit-synapse-btn");
        if (exitBtn) exitBtn.style.display = "block";
      } else {
        header.style.display = "";
        footer.style.display = "";
        if (bgCanvas) bgCanvas.style.display = "";

        // Hide exit button if visible
        const exitBtn = document.getElementById("exit-synapse-btn");
        if (exitBtn) exitBtn.style.display = "none";
      }
    });
  });
}

/* =========================================================
   2️⃣ Exit Synapse View (via Button or ESC)
========================================================= */

// 🔙 Exit button click
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "exit-synapse-btn") {
    exitSynapseView();
  }
});

// 🔑 Exit with ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const synapsePane = document.getElementById("synapse");
    if (synapsePane && synapsePane.classList.contains("active-tab-pane")) {
      exitSynapseView();
    }
  }
});

// 🔁 Shared exit function
function exitSynapseView() {
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const bgCanvas = document.getElementById("neural-bg");
  const synapsePane = document.getElementById("synapse");

  if (header) header.style.display = "";
  if (footer) footer.style.display = "";
  if (bgCanvas) bgCanvas.style.display = "";
  if (synapsePane) synapsePane.classList.remove("active-tab-pane");

  const exitBtn = document.getElementById("exit-synapse-btn");
  if (exitBtn) exitBtn.style.display = "none";

  // Return to Profile tab
  const profileTab = document.querySelector('[data-tab="profile"]');
  if (profileTab) profileTab.click();

  console.log("🧠 Exited Synapse View");
}

/* =========================================================
   3️⃣ Initialize everything on page load
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initProfileForm();

  // Ensure exit button is hidden at start
  const exitBtn = document.getElementById("exit-synapse-btn");
  if (exitBtn) exitBtn.style.display = "none";

  console.log("✅ Main UI initialized (Tabs, Synapse controls active)");
});
