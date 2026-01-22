// ======================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FIXED 2025)
// Uses:
//   - GitHub / Google OAuth with redirect
//   - Clean query-string callback (no hashes, no magic links)
//   - Smart auto-login with profile loading
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM refs
let loginSection, profileSection, userBadge, logoutBtn;
let githubBtn, googleBtn;

// ======================================================================
// 1. SETUP LOGIN DOM
// ======================================================================
export function setupLoginDOM() {
  loginSection   = document.getElementById("login-section");
  profileSection = document.getElementById("profile-section");
  userBadge      = document.getElementById("user-badge");
  logoutBtn      = document.getElementById("logout-btn");

  githubBtn = document.getElementById("github-login");
  googleBtn = document.getElementById("google-login");

  if (!loginSection || !profileSection) {
    console.error("❌ login-section or profile-section not found in DOM");
    return;
  }

  // Setup OAuth buttons
  if (githubBtn) {
    githubBtn.addEventListener("click", () => oauthLogin("github"));
  }
  if (googleBtn) {
    googleBtn.addEventListener("click", () => oauthLogin("google"));
  }

  // Setup logout button
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
}

// ======================================================================
// 2. UI HELPERS (FIXED FOR CORRECT CLASS NAMES)
// ======================================================================
function showLoginUI() {
  // Show login section
  loginSection.classList.add("active-tab-pane");
  loginSection.classList.remove("hidden");
  
  // Hide profile section
  profileSection.classList.add("hidden");
  profileSection.classList.remove("active-tab-pane");
  
  // Hide user badge and logout
  if (userBadge) userBadge.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.add("hidden");

  // Clear profile form
  clearProfileForm();
}

// Helper function to clear all profile form fields
function clearProfileForm() {
  const form = document.getElementById("skills-form");
  if (form) {
    form.reset();
  }
  
// Clear preview image (FIX: never set img.src = "")
const previewImg = document.getElementById("preview");
if (previewImg) {
  previewImg.removeAttribute("src");
  previewImg.classList.add("hidden");
}

  
  // Reset progress bar
  const progressBar = document.querySelector(".profile-bar-inner");
  const progressMsg = document.getElementById("profile-progress-msg");
  if (progressBar) progressBar.style.width = "0%";
  if (progressMsg) {
    progressMsg.textContent = "Profile 0% complete";
    progressMsg.style.color = "#00e0ff";
  }
  
  // Reset title and button
  const profileTitle = document.querySelector("#profile .section-title");
  const submitButton = document.querySelector("#skills-form button[type='submit']");
  if (profileTitle) profileTitle.textContent = "Your Profile";
  if (submitButton) submitButton.textContent = "Save Profile";
}

function showProfileUI(user) {
  // Hide login section
  loginSection.classList.remove("active-tab-pane");
  loginSection.classList.add("hidden");
  
  // Show profile section
  profileSection.classList.remove("hidden");
  
  // Show the profile tab by default
  const profileTab = document.getElementById("profile");
  if (profileTab) {
    document.querySelectorAll(".tab-content-pane").forEach(p =>
      p.classList.remove("active-tab-pane")
    );
    profileTab.classList.add("active-tab-pane");
  }
  
  // Show user badge and logout button
  if (userBadge && user?.email) {
    userBadge.textContent = user.email;
    userBadge.classList.remove("hidden");
  }
  if (logoutBtn) {
    logoutBtn.classList.remove("hidden");
  }
}

// ======================================================================
// 3. START OAUTH LOGIN (REDIRECT FLOW)
// ======================================================================
async function oauthLogin(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + "/2card.html"
    }
  });

  if (error) {
    console.error("❌ OAuth error:", error);
    showNotification("Login failed. Please try again.", "error");
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
    showNotification("Login link expired or cancelled. Please try again.", "error");

    // Clean URL (remove ?error=...)
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
    return;
  }

  // Case 2: No ?code= → nothing to do
  if (!params.has("code")) {
    return;
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(
    window.location.href
  );

  if (error) {
    console.error("❌ Error during OAuth code exchange:", error);
    showNotification("Login failed. Please try again.", "error");
    return;
  }

  // Clean URL after successful login
  url.search = "";
  window.history.replaceState({}, document.title, url.toString());
}

// ======================================================================
// 5. HANDLE LOGOUT
// ======================================================================
async function handleLogout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("❌ Logout error:", error);
    showNotification("Logout failed. Please try again.", "error");
  } else {
    // Dispatch logout event for profile.js to clear its state
    window.dispatchEvent(new CustomEvent('user-logged-out'));

    showNotification("Logged out successfully", "success");
    showLoginUI();
  }
}

// ======================================================================
// 6. LOAD USER PROFILE DATA (AFTER LOGIN) - FIXED VERSION
// ======================================================================
async function loadUserProfile(user) {
  try {
    // Fetch from community table with ALL columns explicitly
    const { data: profiles, error } = await supabase
      .from('community')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('❌ Error fetching profile:', error);

      // Still fire new user event if query fails
      window.dispatchEvent(new CustomEvent('profile-new', {
        detail: { user }
      }));
      return null;
    }

    // Check if we got results
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];

      // Trigger profile form population
      window.dispatchEvent(new CustomEvent('profile-loaded', {
        detail: { profile, user }
      }));

      return profile;
    } else {
      // Trigger new user flow
      window.dispatchEvent(new CustomEvent('profile-new', {
        detail: { user }
      }));

      return null;
    }
  } catch (err) {
    console.error('❌ Exception loading profile:', err);

    // Fire new user event on exception
    window.dispatchEvent(new CustomEvent('profile-new', {
      detail: { user }
    }));

    return null;
  }
}

// ======================================================================
// 7. MAIN INIT – SMART AUTO LOGIN
// ======================================================================
export async function initLoginSystem() {
  // Step A – Handle OAuth callback if present
  await handleOAuthCallback();

  // Step B – Check current session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    showProfileUI(session.user);

    // IMPORTANT: Add a small delay to ensure profile.js listeners are ready
    setTimeout(async () => {
      await loadUserProfile(session.user);
    }, 100);
  } else {
    showLoginUI();
  }

  // Step C – Listen for auth state changes (single listener)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      showProfileUI(session.user);

      // Add delay for event listeners
      setTimeout(async () => {
        await loadUserProfile(session.user);
      }, 100);
    }

    if (event === "SIGNED_OUT") {
      showLoginUI();
    }
  });
}
