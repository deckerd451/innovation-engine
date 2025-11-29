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
  // 1) LOGIN MODULE
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
  // 2) GLOBALS
  // ------------------------------------------------------------------
  const { registerDomElement } = await import("./globals.js");

  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));

  registerDomElement("teamBuilderInput", document.getElementById("team-skills-input"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocomplete-team-builder"));
  registerDomElement("teamSize", document.getElementById("teamSize"));
  registerDomElement("buildTeamBtn", document.getElementById("buildTeamBtn"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  registerDomElement("profileSection", document.getElementById("profile-section"));
  registerDomElement("loginSection", document.getElementById("login-section"));

  console.log("✅ DOM registered");

  // ------------------------------------------------------------------
  // 3) LOAD TAB SYSTEM
  // ------------------------------------------------------------------
  console.log("📑 Importing tab system...");
  const { initTabs } = await import("./tabs.js");
  initTabs();
  console.log("📑 Tabs initialized");

  // ------------------------------------------------------------------
  // 4) Load Core Systems
  // ------------------------------------------------------------------
  await import("./synapse.js");
  await import("./searchEngine.js");
  await import("./profile.js");

  console.log("🎉 All systems ready!");
}

initMain().catch(err => {
  console.error("❌ Main initialization failed:", err);
});
