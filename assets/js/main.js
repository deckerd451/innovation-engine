// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (FINAL 2025)
// ======================================================================

async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 20));
  }
  return window.supabase;
}

async function initMain() {
  console.log("⏳ Waiting for Supabase...");
  const supabase = await waitForSupabase();
  console.log("✅ Supabase ready");
  console.log("📦 Supabase object:", supabase);

  console.log("📌 Main Controller Loaded");

  // ------------------------------------------------------------------
  // 1) GLOBALS FIRST — must be loaded before login, search, profile
  // ------------------------------------------------------------------
  const { registerDomElement } = await import("./globals.js");

  // ------------------------------------------------------------------
  // 2) LOGIN MODULE
  // ------------------------------------------------------------------
  console.log("📥 Importing login module...");
  const loginModule = await import("./login.js");

  const { setupLoginDOM, initLoginSystem } = loginModule;

  if (!setupLoginDOM || !initLoginSystem) {
    throw new Error("❌ login.js is missing exported functions");
  }

  setupLoginDOM();
  await initLoginSystem();

  // ------------------------------------------------------------------
  // 3) REGISTER ALL DOM ELEMENTS
  // ------------------------------------------------------------------
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));

  // Team builder
  registerDomElement("teamBuilderInput", document.getElementById("team-skills-input"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("teamSize", document.getElementById("teamSize"));
  registerDomElement("buildTeamBtn", document.getElementById("buildTeamBtn"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  // Auth sections
  registerDomElement("profileSection", document.getElementById("profile-section"));
  registerDomElement("loginSection", document.getElementById("login-section"));

  console.log("✅ DOM registered");
  const searchModule = await import("./searchEngine.js");
if (searchModule.initSearchEngine) {
  searchModule.initSearchEngine();
}
  const teamBuilderModule = await import("./teamBuilder.js");
if (teamBuilderModule.initTeamBuilder) {
  teamBuilderModule.initTeamBuilder();
}
  const leaderboardModule = await import("./leaderboard.js");
if (leaderboardModule.initLeaderboard) {
  leaderboardModule.initLeaderboard();
}




  // ------------------------------------------------------------------
  // 4) Load Core Systems in correct order (search → profile → synapse)
  // ------------------------------------------------------------------
  await import("./profile.js");
  await import("./synapse.js");

  console.log("🎉 All systems ready!");
}

initMain().catch(err => {
  console.error("❌ Main initialization failed:", err);
});
