// ================================================================
// CharlestonHacks Innovation Engine — AUTH CONTROLLER (ROOT)
// File: /auth.js
// ================================================================
// Uses window.supabase (loaded by assets/js/supabaseClient.js)
//
// Emits canonical events:
//  - profile-loaded  { detail: { user, profile } }
//  - profile-new     { detail: { user } }
//  - user-logged-out { detail: {} }
//  - app-ready       { detail: { user } }  (UI is shown + synapse likely present)
//
// Key: avoid race with onboarding listeners by dispatching events after a micro-delay.
// ================================================================

function showNotification(message, type = "info") {
  console.log(`[${type.toUpperCase()}] ${message}`);
}

let loginSection, mainContent, mainHeader;
let githubBtn, googleBtn;

// Guard: ensure we only attach once
const AUTH_GUARD = "__IE_AUTH_INIT__";
if (window[AUTH_GUARD]) {
  console.log("⚠️ auth.js already initialized — skipping duplicate init.");
} else {
  window[AUTH_GUARD] = true;
}

function setupLoginDOM() {
  loginSection = document.getElementById("login-section");
  mainContent  = document.getElementById("main-content");
  mainHeader   = document.getElementById("main-header");

  githubBtn = document.getElementById("github-login");
  googleBtn = document.getElementById("google-login");

  if (!loginSection || !mainContent) {
    console.error("❌ login-section or main-content not found in DOM");
    return;
  }

  githubBtn?.addEventListener("click", () => oauthLogin("github"));
  googleBtn?.addEventListener("click", () => oauthLogin("google"));

  console.log("🎨 Login DOM setup complete (OAuth mode)");
}

function showLoginUI() {
  loginSection?.classList.remove("hidden");
  loginSection?.classList.add("active-tab-pane");

  mainHeader?.classList.add("hidden");
  mainContent?.classList.add("hidden");

  document.body.style.overflow = "hidden";
  console.log("🔒 Showing login UI");
}

function showAppUI(user) {
  loginSection?.classList.add("hidden");
  loginSection?.classList.remove("active-tab-pane");

  mainHeader?.classList.remove("hidden");
  mainContent?.classList.remove("hidden");

  document.body.style.overflow = "auto";

  // Fire "app-ready" after UI is visible; onboarding can use this safely.
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("app-ready", { detail: { user } }));
  }, 150);

  console.log("✅ Showing app UI for:", user?.email);
}

async function oauthLogin(provider) {
  console.log(`🔐 Starting OAuth login with ${provider}...`);

  if (!window.supabase) {
    console.error("❌ Supabase not available! Cannot login.");
    showNotification("System error. Please refresh and try again.", "error");
    return;
  }

  const { error } = await window.supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    console.error("❌ OAuth error:", error);
    showNotification("Login failed. Please try again.", "error");
  }
}

function cleanOAuthUrl() {
  const url = new URL(window.location.href);

  // If there's OAuth params in URL hash, clean after Supabase processes
  if (url.hash && (url.hash.includes("access_token") || url.hash.includes("error"))) {
    setTimeout(() => {
      console.log("🧹 Cleaning OAuth URL...");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }, 800);
  }
}

// Canonical emitters (single payload format)
function emitProfileLoaded(user, profile) {
  window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile } }));
}

function emitProfileNew(user) {
  window.dispatchEvent(new CustomEvent("profile-new", { detail: { user } }));
}

window.handleLogout = async function handleLogout() {
  console.log("👋 Logging out...");

  if (!window.supabase) {
    console.error("❌ Supabase not available!");
    return;
  }

  const { error } = await window.supabase.auth.signOut();

  if (error) {
    console.error("❌ Logout error:", error);
    showNotification("Logout failed. Please try again.", "error");
    return;
  }

  console.log("✅ Logged out successfully");
  window.dispatchEvent(new CustomEvent("user-logged-out"));
  showNotification("Logged out successfully", "success");
  showLoginUI();
};

async function loadUserProfile(user) {
  console.log("👤 Loading profile for:", user?.email);
  if (!window.supabase) return null;

  try {
    const { data: profiles, error } = await window.supabase
      .from("community")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("❌ Error fetching profile:", error);
      emitProfileNew(user);
      return null;
    }

    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      console.log("📋 Existing profile found:", profile);

      // Emit AFTER a tiny delay so listeners (onboarding/profile) are guaranteed attached.
      setTimeout(() => emitProfileLoaded(user, profile), 50);

      return profile;
    }

    console.log("🆕 New user - no profile row");
    setTimeout(() => emitProfileNew(user), 50);
    return null;
  } catch (err) {
    console.error("❌ Exception loading profile:", err);
    setTimeout(() => emitProfileNew(user), 50);
    return null;
  }
}

async function initLoginSystem() {
  console.log("🚀 Initializing login system (OAuth)…");

  if (!window.supabase) {
    console.error("❌ CRITICAL: window.supabase is not available!");
    console.error("Make sure assets/js/supabaseClient.js loads BEFORE auth.js");
    showLoginUI();
    return;
  }

  try {
    cleanOAuthUrl();

    const { data: { session } } = await window.supabase.auth.getSession();

    if (session?.user) {
      console.log("🟢 Already logged in as:", session.user.email);
      showAppUI(session.user);

      // Load profile after UI is visible
      setTimeout(() => loadUserProfile(session.user), 120);
    } else {
      console.log("🟡 No active session");
      showLoginUI();
    }

    // Single listener
    window.supabase.auth.onAuthStateChange(async (event, session2) => {
      console.log("⚡ Auth event:", event);

      if (event === "SIGNED_IN" && session2?.user) {
        console.log("🟢 User authenticated:", session2.user.email);
        showAppUI(session2.user);
        setTimeout(() => loadUserProfile(session2.user), 120);
      }

      if (event === "SIGNED_OUT") {
        console.log("🟡 User signed out");
        showLoginUI();
      }
    });

    console.log("✅ Login system initialized (OAuth)");
  } catch (error) {
    console.error("❌ ERROR in initLoginSystem:", error);
    showLoginUI();
  }
}

// Export to window for main.js
window.setupLoginDOM = setupLoginDOM;
window.initLoginSystem = initLoginSystem;

console.log("✅ auth.js loaded and functions exported to window");
