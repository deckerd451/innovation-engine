// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (2025 FINAL)
// Zero loops, stable DOM, correct Supabase flow.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM elements (resolved ONLY after DOM ready)
let loginSection, loginForm, loginEmailInput, profileSection, userBadge, logoutBtn;

// Prevent double SIGNED_IN triggers
window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || {
  handled: false
};

// Fixed redirect URL for GitHub Pages
const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   DOM SETUP (fixes dead login button)
============================================================= */
export function setupLoginDOM() {
  loginSection = document.getElementById("login-section");
  loginForm = document.getElementById("login-form");
  loginEmailInput = document.getElementById("login-email");
  profileSection = document.getElementById("profile-section");
  userBadge = document.getElementById("user-badge");
  logoutBtn = document.getElementById("logout-btn");

  if (!loginForm) {
    console.error("❌ login-form not found — DOM not ready.");
    return;
  }

  // Attach login handler now that DOM is ready
  loginForm.addEventListener("submit", onSubmitLogin);

  // Attach logout handler
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    handleSignedOut();
  });
}

/* =============================================================
   LOGIN HANDLER
============================================================= */
async function onSubmitLogin(e) {
  e.preventDefault();

  const email = loginEmailInput.value.trim();
  if (!email) {
    showNotification("Please enter your email.", "error");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("[Login] OTP Error:", error);
    showNotification("Login failed. Try again.", "error");
  } else {
    showNotification("Magic link sent! Check your email.", "success");
  }
}

/* =============================================================
   INIT LOGIN SYSTEM
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // Wait for Supabase to parse URL hash
  await new Promise(res => setTimeout(res, 20));

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🔒 Existing session detected:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("🔓 No active session.");
    handleSignedOut();
  }

  // SINGLE auth listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event);

    if (event === "SIGNED_IN" && session?.user) {
      await handleSignedInOnce(session.user);
      return;
    }

    if (event === "SIGNED_OUT") {
      handleSignedOut();
      return;
    }
  });
}

/* =============================================================
   SIGNED-IN (only once)
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__LOGIN_STATE__.handled) {
    console.log("⚠️ SIGNED_IN ignored (already handled)");
    return;
  }
  window.__LOGIN_STATE__.handled = true;

  console.log("🎉 SIGNED IN AS:", user.email);

  // Ensure user row exists
  await backfillCommunityUser();

  // Switch UI
  handleSignedIn(user);

  // Let main initialize profile AFTER auth completes
  window.dispatchEvent(new CustomEvent("auth-ready"));
}

/* =============================================================
   UI: Signed In
============================================================= */
function handleSignedIn(user) {
  userBadge.textContent = `Logged in as: ${user.email}`;
  userBadge.classList.remove("hidden");

  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");

  logoutBtn.classList.remove("hidden");
}

/* =============================================================
   UI: Signed Out
============================================================= */
function handleSignedOut() {
  console.log("👋 Signed out");

  window.__LOGIN_STATE__.handled = false;

  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  profileSection?.classList.add("hidden");
  loginSection?.classList.remove("hidden");

  if (loginEmailInput) loginEmailInput.value = "";
}
