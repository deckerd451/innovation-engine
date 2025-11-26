// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (2025 FINAL BUILD)
// Orchestrates:
//   ✔ DOM registry (globals.js)
//   ✔ Tab system
//   ✔ Login system (login.js FINAL)
//   ✔ Profile form (profile.js)
//   ✔ Search engine (searchEngine.js)
//   ✔ Synapse view (synapse.js)
// ======================================================================

// 1) Wait for Supabase safely (prevents early execution)
async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 20));
  }
  return window.supabase;
}

// 2) Main bootstrap
async function initMain() {
  const supabase = await waitForSupabase();

  console.log("📌 Main Controller Loaded");

  // Register DOM
  const { registerDomElement } = await import("./globals.js");

  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));

  // Team Builder
  registerDomElement("teamBuilderInput", document.getElementById("team-skills-input"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("teamSize", document.getElementById("teamSize"));
  registerDomElement("buildTeamBtn", document.getElementById("buildTeamBtn"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  // Tabs (for profile, search, team, leaderboard, synapse)
  registerDomElement("profileSection", document.getElementById("profile-section"));
  registerDomElement("loginSection", document.getElementById("login-section"));

  // No early return — EVER
  // Everything below must always run

  // Load Synapse
  import("./synapse.js");

  // Load search system
  import("./searchEngine.js");

  // Load profile controller
  import("./profile.js");
}

// Start main controller
initMain();
