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

  // NOW setup login AFTER Supabase is ready
  console.log("📥 Importing login module...");
  const loginModule = await import("./login.js");
  console.log("✅ Login module imported:", loginModule);
  
  const { setupLoginDOM, initLoginSystem } = loginModule;
  
  console.log("🎨 Setting up login DOM...");
  setupLoginDOM();
  console.log("✅ Login DOM setup complete");
  
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
  const profileModule = await import("./profile.js");
  console.log("✅ Profile loaded");
  
  // Initialize profile form
  if (profileModule.initProfileForm) {
    await profileModule.initProfileForm();
    console.log("✅ Profile form initialized");
  }

  // Initialize tab system
  initTabSystem();
  console.log("✅ Tab system initialized");

  console.log("🎉 All systems ready!");
}

// Tab system
function initTabSystem() {
  console.log("🎯 Initializing tab system...");

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-content-pane');

  if (tabButtons.length === 0) {
    console.error("❌ No tab buttons found");
    return;
  }

  console.log(`✅ Found ${tabButtons.length} tab buttons`);

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      console.log(`🔄 Switching to tab: ${targetTab}`);

      // Remove active class from all buttons
      tabButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');

      // Hide all tab panes
      tabPanes.forEach(pane => {
        pane.classList.remove('active-tab-pane');
      });

      // Show target tab pane
      const targetPane = document.getElementById(targetTab);
      if (targetPane) {
        targetPane.classList.add('active-tab-pane');
        console.log(`✅ Activated tab: ${targetTab}`);
      } else {
        console.error(`❌ Tab pane not found: ${targetTab}`);
      }
    });
  });

  console.log("✅ Tab system initialized");
}

// Start main controller
initMain().catch(err => {
  console.error("❌ Main initialization failed:", err);
});
