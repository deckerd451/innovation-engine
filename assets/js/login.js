// ======================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (OAUTH FINAL 2025)
// Uses:
//   - GitHub / Google OAuth with redirect
//   - Clean query-string callback (no hashes, no magic links)
//   - Smart auto-login (Option A)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM refs
let loginSection, profileSection;
let githubBtn, googleBtn;

// ======================================================================
// 1. SETUP LOGIN DOM
// ======================================================================
export function setupLoginDOM() {
  loginSection   = document.getElementById("login-section");
  profileSection = document.getElementById("profile-section");

  githubBtn = document.getElementById("github-login");
  googleBtn = document.getElementById("google-login");

  if (!loginSection || !profileSection) {
    console.error("❌ login-section or profile-section not found in DOM");
    return;
  }

  if (githubBtn) {
    githubBtn.addEventListener("click", () => oauthLogin("github"));
  }
  if (googleBtn) {
    googleBtn.addEventListener("click", () => oauthLogin("google"));
  }

  console.log("🎨 Login DOM setup complete (OAuth mode)");
}

// ======================================================================
// 2. UI HELPERS
// ======================================================================
function showLoginUI() {
  loginSection.classList.remove("hidden");
  profileSection.classList.add("hidden");
}

function showProfileUI() {
  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");
}

// ======================================================================
// 3. START OAUTH LOGIN (REDIRECT FLOW)
// ======================================================================
async function oauthLogin(provider) {
  console.log(`🔑 Starting OAuth login with ${provider}...`);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: "https://www.charlestonhacks.com/2card.html"
    }
  });

  if (error) {
    console.error("❌ OAuth error:", error);
    showNotification("Login failed. Please try again.");
  }

  // NOTE: On success, browser will redirect to provider, then back to 2card.html
}

// ======================================================================
// 4. HANDLE OAUTH CALLBACK (QUERY PARAMS, NOT HASH)
// ======================================================================
async function handleOAuthCallback() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  // Case 1: Provider sent an error
  if (params.has("error")) {
    const errorDesc = params.get("error_description") || "OAuth error.";
    console.warn("⚠️ OAuth error in callback:", errorDesc);
    showNotification("Login link expired or cancelled. Please try again.");

    // Clean URL (remove ?error=...)
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
    return;
  }

  // Case 2: No ?code= → nothing to do
  if (!params.has("code")) {
    return;
  }

  console.log("🔁 Processing OAuth callback (code flow)…");

  const { data, error } = await supabase.auth.exchangeCodeForSession(
    window.location.href
  );

  if (error) {
    console.error("❌ Error during OAuth code exchange:", error);
    showNotification("Login failed. Please try again.");
    return;
  }

  console.log("🔓 OAuth SIGNED_IN via redirect:", data);

  // Clean URL after successful login
  url.search = "";
  window.history.replaceState({}, document.title, url.toString());
}

// ======================================================================
// 5. MAIN INIT – SMART AUTO LOGIN (OPTION A)
// ======================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system (OAuth)…");

  // Step A – Handle OAuth callback if present
  await handleOAuthCallback();

  // Step B – Check current session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🟢 Already logged in as:", session.user.email);
    showProfileUI();
  } else {
    console.log("🟡 No active session");
    showLoginUI();
  }

  // Step C – Listen for auth state changes (single listener)
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("⚡ Auth event:", event);

    if (event === "SIGNED_IN" && session?.user) {
      console.log("🟢 User authenticated:", session.user.email);
      showProfileUI();
    }

    if (event === "SIGNED_OUT") {
      console.log("🟡 User signed out");
      showLoginUI();
    }
  });

  console.log("✅ Login system initialized (OAuth)");
}
