// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (2025 FINAL)
// Zero loops, zero race conditions, correct Supabase flow.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM elements
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// Prevent double SIGNED_IN triggers
window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || {
  handled: false
};

// Redirect for magic link
const REDIRECT_URL = window.location.href;

/* =============================================================
   INIT LOGIN SYSTEM  (called once by main.js)
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // Allow Supabase URL hash parsing to complete
  await new Promise(res => setTimeout(res, 10));

  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🔒 Existing session detected:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("🔓 No session — waiting for auth event");
    handleSignedOut();
  }

  /* ------------------------------------------------------------
     Single stable auth listener (critical)
  ------------------------------------------------------------ */
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
   SIGN IN WITH MAGIC LINK
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
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
});

/* =============================================================
   HANDLE SIGNED-IN (only once)
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__LOGIN_STATE__.handled) {
    console.log("⚠️ SIGNED_IN ignored (already handled)");
    return;
  }
  window.__LOGIN_STATE__.handled = true;

  console.log("🎉 SIGNED_IN:", user.email);
  await backfillCommunityUser();

  handleSignedIn(user);
}

/* =============================================================
   UI Update: Signed In
============================================================= */
function handleSignedIn(user) {
  userBadge.textContent = `Logged in as: ${user.email}`;
  userBadge.classList.remove("hidden");

  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");

  logoutBtn.classList.remove("hidden");
}

/* =============================================================
   UI Update: Signed Out
============================================================= */
function handleSignedOut() {
  console.log("👋 Signed out");

  window.__LOGIN_STATE__.handled = false;

  userBadge.classList.add("hidden");
  logoutBtn.classList.add("hidden");

  profileSection.classList.add("hidden");
  loginSection.classList.remove("hidden");

  loginEmailInput.value = "";
}

/* =============================================================
   LOGOUT
============================================================= */
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  handleSignedOut();
});
