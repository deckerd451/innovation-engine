// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (2025 FINAL)
// Zero loops, stable DOM, correct Supabase workflow.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ====================================================================
// GLOBAL AUTH GUARD — prevents loops and double events
// ====================================================================
window.__AUTH_GUARD__ = window.__AUTH_GUARD__ || {
  initialized: false,       // prevents multiple init cycles
  signedInHandled: false    // prevents SIGNED_IN firing twice
};

// ====================================================================
// DOM references (resolved after DOMContentLoaded)
// ====================================================================
let loginSection;
let loginForm;
let loginEmailInput;
let profileSection;
let userBadge;
let logoutBtn;

// FINAL GitHub Pages redirect URL — MUST MATCH Supabase config exactly
const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   DOM SETUP — ensures login button works reliably
============================================================= */
export function setupLoginDOM() {
  loginSection      = document.getElementById("login-section");
  loginForm         = document.getElementById("login-form");
  loginEmailInput   = document.getElementById("login-email");
  profileSection    = document.getElementById("profile-section");
  userBadge         = document.getElementById("user-badge");
  logoutBtn         = document.getElementById("logout-btn");

  if (!loginForm) {
    console.error("❌ login-form not found — DOM not ready.");
    return;
  }

  // LOGIN HANDLER
  loginForm.addEventListener("submit", onSubmitLogin);

  // LOGOUT HANDLER
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.__AUTH_GUARD__.signedInHandled = false;
    handleSignedOut();
  });
}

/* =============================================================
   LOGIN SUBMISSION HANDLER
============================================================= */
async function onSubmitLogin(e) {
  e.preventDefault();

  const email = loginEmailInput.value.trim();
  if (!email) {
    showNotification("Please enter your email.", "error");
    return;
  }

  const btn = loginForm.querySelector("button");
  btn.disabled = true;
  btn.classList.add("pulse", "sending");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true
    }
  });

  btn.disabled = false;
  btn.classList.remove("pulse", "sending");

  if (error) {
    console.error("[Login] OTP Error:", error);
    showNotification("Login failed. Try again.", "error");
  } else {
    showNotification("Magic link sent! Check your email.", "success");
  }
}

/* =============================================================
   INIT LOGIN SYSTEM — main.js waits for auth-ready event
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // Allow Supabase to parse tokens in URL hash
  await new Promise(res => setTimeout(res, 20));

  // Check existing session before listening
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log("🔒 Existing session detected:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    handleSignedOut();
  }

  // =============================================================
  // ONE STABLE AUTH LISTENER — ignores token refresh loop
  // =============================================================
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event);

    // TOKEN_REFRESHED always causes loops → ignore it
    if (event === "TOKEN_REFRESHED") {
      console.log("🔁 TOKEN_REFRESHED ignored (prevents loop)");
      return;
    }

    if (event === "SIGNED_OUT") {
      console.log("👋 Signed out");
      window.__AUTH_GUARD__.signedInHandled = false;
      handleSignedOut();
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      if (window.__AUTH_GUARD__.signedInHandled) {
        console.log("⚠️ SIGNED_IN ignored — already handled");
        return;
      }

      await handleSignedInOnce(session.user);
      return;
    }
  });
}

/* =============================================================
   SIGNED-IN (run only once)
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) {
    console.log("⚠️ SIGNED_IN ignored (already processed)");
    return;
  }

  window.__AUTH_GUARD__.signedInHandled = true;

  console.log("🎉 SIGNED IN AS:", user.email);

  await backfillCommunityUser();

  handleSignedIn(user);

  // Signal main.js to initialize profile + tabs
  if (!window.__AUTH_GUARD__.initialized) {
    window.__AUTH_GUARD__.initialized = true;
    window.dispatchEvent(new CustomEvent("auth-ready"));
  }
}

/* =============================================================
   UI: Signed In
============================================================= */
function handleSignedIn(user) {
  userBadge.textContent = `Logged in as: ${user.email}`;
  userBadge.classList.remove("hidden");

  // Fade-out login section for animation
  loginSection.classList.add("fade-out");
  setTimeout(() => {
    loginSection.classList.add("hidden");
    profileSection.classList.remove("hidden");
  }, 300);

  logoutBtn.classList.remove("hidden");
}

/* =============================================================
   UI: Signed Out
============================================================= */
function handleSignedOut() {
  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  profileSection?.classList.add("hidden");
  loginSection?.classList.remove("hidden");
  loginSection?.classList.remove("fade-out");

  if (loginEmailInput) loginEmailInput.value = "";
}
