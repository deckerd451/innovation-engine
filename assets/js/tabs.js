// ======================================================================
// CharlestonHacks Innovation Engine — TAB CONTROLLER (2025 FINAL)
// Handles:
//   ✔ Switching between Create Profile / Search / Team Builder / Leaderboard / Synapse
//   ✔ Always works after OAuth login
//   ✔ No dependencies on login.js or profile.js
// ======================================================================

export function initTabs() {
  console.log("🔧 Initializing tab system…");

  // Map of section names to DOM elements
  const sections = {
    profile: document.getElementById("profile-section"),
    search: document.getElementById("search-section"),
    team: document.getElementById("team-section"),
    leaderboard: document.getElementById("leaderboard-section"),
    synapse: document.getElementById("synapse-section"),
    login: document.getElementById("login-section")
  };

  // Hide all sections
  function hideAll() {
    Object.values(sections).forEach(el => {
      if (el) el.classList.add("hidden");
    });
  }

  // Attach click handlers to all buttons with `data-tab="profile"` etc.
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      console.log("📌 Tab clicked:", target);

      hideAll();

      // Show the requested section
      if (sections[target]) {
        sections[target].classList.remove("hidden");
        console.log("📄 Showing section:", target);
      } else {
        console.warn(`⚠️ No matching section for tab: ${target}`);
      }
    });
  });

  console.log("✨ Tabs ready");
}
