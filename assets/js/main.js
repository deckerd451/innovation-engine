// ======================================================================
// CharlestonHacks Innovation Engine — MAIN CONTROLLER (COMPLETE 2025)
// ======================================================================

/**
 * Wait for Supabase to be injected into window by supabaseClient.js
 */
async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 20));
  }
  return window.supabase;
}

/**
 * Main initialization function - loads all modules in correct order
 */
async function initMain() {
  // One-time init guard - prevents double-binding and ghost listeners
  if (window.__IE_ASSETS_MAIN_INIT_DONE__) {
    console.log("⚠️ Assets main already initialized, skipping...");
    return;
  }
  window.__IE_ASSETS_MAIN_INIT_DONE__ = true;

  console.log("⏳ Waiting for Supabase...");
  const supabase = await waitForSupabase();
  console.log("✅ Supabase ready");
  console.log("📦 Supabase object:", supabase);

  console.log("🔌 Main Controller Loaded");

  // ------------------------------------------------------------------
  // 1) GLOBALS FIRST — must be loaded before login, search, profile
  // ------------------------------------------------------------------
  const { registerDomElement } = await import("./globals.js");
  console.log("✅ Globals loaded");

  // ------------------------------------------------------------------
  // 2) LOGIN MODULE
  // ------------------------------------------------------------------
  console.log("🔥 Importing login module...");
  const loginModule = await import("./login.js");

  const { setupLoginDOM, initLoginSystem } = loginModule;

  if (!setupLoginDOM || !initLoginSystem) {
    throw new Error("❌ login.js is missing exported functions");
  }

  setupLoginDOM();
  await initLoginSystem();
  console.log("✅ Login system initialized");

  // ------------------------------------------------------------------
  // 3) REGISTER ALL DOM ELEMENTS
  // ------------------------------------------------------------------
  console.log("📋 Registering DOM elements...");

  // Search elements
  registerDomElement("teamSkillsInput", document.getElementById("teamSkillsInput"));
  registerDomElement("autocompleteTeamSkills", document.getElementById("autocomplete-team-skills"));
  registerDomElement("cardContainer", document.getElementById("cardContainer"));
  registerDomElement("noResults", document.getElementById("noResults"));
  registerDomElement("matchNotification", document.getElementById("matchNotification"));
  registerDomElement("nameInput", document.getElementById("nameInput"));
  registerDomElement("autocompleteNames", document.getElementById("autocomplete-names"));

  // Team builder elements
  registerDomElement("teamBuilderInput", document.getElementById("team-builder-input"));
  registerDomElement("autocompleteTeamBuilder", document.getElementById("autocompleteTeamBuilder"));
  registerDomElement("teamSize", document.getElementById("teamSize"));
  registerDomElement("buildTeamBtn", document.getElementById("buildTeamBtn"));
  registerDomElement("bestTeamContainer", document.getElementById("bestTeamContainer"));

  // Auth sections
  registerDomElement("profileSection", document.getElementById("profile-section"));
  registerDomElement("loginSection", document.getElementById("login-section"));

  // Profile form elements
  registerDomElement("skillsForm", document.getElementById("skills-form"));
  registerDomElement("firstName", document.getElementById("first-name"));
  registerDomElement("lastName", document.getElementById("last-name"));
  registerDomElement("email", document.getElementById("email"));
  registerDomElement("skillsInput", document.getElementById("skills-input"));
  registerDomElement("bioInput", document.getElementById("bio-input"));
  registerDomElement("availabilityInput", document.getElementById("availability-input"));
  registerDomElement("photoInput", document.getElementById("photo-input"));
  registerDomElement("preview", document.getElementById("preview"));
  registerDomElement("newsletterOptIn", document.getElementById("newsletter-opt-in"));
  registerDomElement("profileBar", document.querySelector(".profile-bar-inner"));
  registerDomElement("profileProgressMsg", document.getElementById("profile-progress-msg"));

  console.log("✅ DOM elements registered");

  // ------------------------------------------------------------------
  // 4) INITIALIZE SEARCH ENGINE
  // ------------------------------------------------------------------
  try {
    console.log("🔍 Initializing search engine...");
    const searchModule = await import("./searchEngine.js");
    if (searchModule.initSearchEngine) {
      await searchModule.initSearchEngine();
      console.log("✅ Search engine initialized");
    } else {
      console.warn("⚠️ searchEngine.js missing initSearchEngine export");
    }
  } catch (err) {
    console.error("❌ Search engine initialization failed:", err);
  }

  // ------------------------------------------------------------------
  // 5) INITIALIZE TEAM BUILDER
  // ------------------------------------------------------------------
  try {
    console.log("👥 Initializing team builder...");
    const teamBuilderModule = await import("./teamBuilder.js");
    if (teamBuilderModule.initTeamBuilder) {
      await teamBuilderModule.initTeamBuilder();
      console.log("✅ Team builder initialized");
    } else {
      console.warn("⚠️ teamBuilder.js missing initTeamBuilder export");
    }
  } catch (err) {
    console.error("❌ Team builder initialization failed:", err);
  }

  // ------------------------------------------------------------------
  // 6) INITIALIZE LEADERBOARD
  // ------------------------------------------------------------------
  try {
    console.log("🏆 Initializing leaderboard...");
    const leaderboardModule = await import("./leaderboard.js");
    if (leaderboardModule.initLeaderboard) {
      await leaderboardModule.initLeaderboard();
      console.log("✅ Leaderboard initialized");
    } else {
      console.warn("⚠️ leaderboard.js missing initLeaderboard export");
    }
  } catch (err) {
    console.error("❌ Leaderboard initialization failed:", err);
  }

  // ------------------------------------------------------------------
  // 7) INITIALIZE PROFILE SYSTEM (CRITICAL - Must call initProfileForm)
  // ------------------------------------------------------------------
  try {
    console.log("👤 Initializing profile system...");
    const profileModule = await import("./profile.js");
    if (profileModule.initProfileForm) {
      await profileModule.initProfileForm();
      console.log("✅ Profile system initialized");
    } else {
      console.error("❌ profile.js missing initProfileForm export");
    }
  } catch (err) {
    console.error("❌ Profile initialization failed:", err);
  }

  // ------------------------------------------------------------------
  // 8) LOAD SYNAPSE (visualization system)
  // ------------------------------------------------------------------
  try {
    console.log("🕸️ Loading synapse module...");
    await import("./synapse.js");
    console.log("✅ Synapse module loaded");
  } catch (err) {
    console.error("❌ Synapse load failed:", err);
  }

  // ------------------------------------------------------------------
  // 9) SETUP LIVE PHOTO PREVIEW (for profile form)
  // ------------------------------------------------------------------
  const photoInput = document.getElementById("photo-input");
  const previewImg = document.getElementById("preview");
  
  if (photoInput && previewImg) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        previewImg.src = e.target.result;
        previewImg.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    });
    console.log("✅ Photo preview handler attached");
  }

  // ------------------------------------------------------------------
  // 10) ALL SYSTEMS READY
  // ------------------------------------------------------------------
  console.log("🎉 All systems ready!");
  console.log("📊 Initialized modules:");
  console.log("  ✓ Globals");
  console.log("  ✓ Login");
  console.log("  ✓ Search Engine");
  console.log("  ✓ Team Builder");
  console.log("  ✓ Leaderboard");
  console.log("  ✓ Profile");
  console.log("  ✓ Synapse");
}

// ------------------------------------------------------------------
// EXECUTE MAIN INITIALIZATION
// ------------------------------------------------------------------
initMain().catch(err => {
  console.error("❌ Main initialization failed:", err);
  console.error("Stack trace:", err.stack);
  
  // Show user-friendly error message
  const container = document.querySelector('.container');
  if (container) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid #f00;
      color: #f00;
      padding: 2rem;
      border-radius: 8px;
      max-width: 500px;
      text-align: center;
      z-index: 10000;
    `;
    errorDiv.innerHTML = `
      <h2 style="margin-top: 0;">⚠️ System Error</h2>
      <p>Failed to initialize the Innovation Engine.</p>
      <p style="font-size: 0.9rem; opacity: 0.8;">Check console for details.</p>
      <button onclick="location.reload()" style="
        background: #f00;
        color: #fff;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 1rem;
      ">Reload Page</button>
    `;
    document.body.appendChild(errorDiv);
  }
});
