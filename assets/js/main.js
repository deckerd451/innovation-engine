// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (FIXED 2025)
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
  console.log("⏳ Waiting for Supabase...");
  const supabase = await waitForSupabase();
  console.log("✅ Supabase ready");
  console.log("📦 Supabase object:", supabase);

  console.log("📌 Main Controller Loaded");

  // Load login module AFTER Supabase is ready
  console.log("📥 Importing login module...");
  let loginModule;
  try {
    loginModule = await import("./login.js");
  } catch (err) {
    console.error("❌ Failed to import login.js:", err);
    throw err;
  }

  // Only initLoginSystem remains
  const { initLoginSystem } = loginModule;
  if (typeof initLoginSystem !== "function") {
    throw new Error("login.js did not export initLoginSystem");
  }

  console.log("🔐 Initializing login system...");
  await initLoginSystem();
  console.log("✅ Login system initialized");

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

  console.log("✅ DOM registered");

  // Load Synapse
  await import("./synapse.js");
  console.log("✅ Synapse loaded");

  // Load search system
  await import("./searchEngine.js");
  console.log("✅ Search engine loaded");

  // Load profile controller
  await import("./profile.js");
  console.log("✅ Profile loaded");

  console.log("🎉 All systems ready!");
}

// Start main controller
initMain().catch(err => {
  console.error("❌ Main initialization failed:", err);
});
