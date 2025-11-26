// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FIXED 2025)
// Zero loops. Zero race conditions. Correct Supabase workflow.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ====================================================================
// GLOBAL AUTH GUARD – prevents loops and double events
// ====================================================================
window.__AUTH_GUARD__ = window.__AUTH_GUARD__ || {
  initialized: false,
  signedInHandled: false
};

// ====================================================================
// DOM references
// ====================================================================
let loginSection;
let loginForm;
let loginEmailInput;
let profileSection;
let userBadge;
let logoutBtn;

// MUST MATCH SUPABASE EXACTLY
const REDIRECT_URL = "https://www.charlestonhacks.com/2card.html";


/* =============================================================
   DOM SETUP – ensures login button works reliably
============================================================= */
export function setupLoginDOM() {
  loginSection      = document.getElementById("login-section");
  loginForm         = document.getElementById("login-form");
  loginEmailInput   = document.getElementById("login-email");
  profileSection    = document.getElementById("profile-section");
  userBadge         = document.getElementById("user-badge");
  logoutBtn         = document.getElementById("logout-btn");

  if (!loginForm) {
    console.error("❌ login-form not found – DOM not ready.");
    return;
  }

  // LOGIN SUBMIT
  loginForm.addEventListener("submit", onSubmitLogin);

  // LOGOUT
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
   INIT LOGIN SYSTEM – main.js waits for auth-ready
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // FIRST: Set up auth listener (before checking session)
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event, "Session:", session?.user?.email);

    if (event === "TOKEN_REFRESHED") {
      console.log("🔄 TOKEN_REFRESHED ignored");
      return;
    }

    if (event === "SIGNED_OUT") {
      window.__AUTH_GUARD__.signedInHandled = false;
      handleSignedOut();
      return;
    }

    if (event === "INITIAL_SESSION") {
      // Handle INITIAL_SESSION event (this is what fires when returning from magic link)
      if (session?.user && !window.__AUTH_GUARD__.signedInHandled) {
        console.log("🔗 INITIAL_SESSION with user - handling sign in");
        await handleSignedInOnce(session.user);
      }
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      if (window.__AUTH_GUARD__.signedInHandled) {
        console.log("⚠️ SIGNED_IN ignored – already handled");
        return;
      }
      await handleSignedInOnce(session.user);
    }
  });

  // THEN: Check for existing session (with small delay to let hash parsing complete)
  await new Promise(res => setTimeout(res, 100));
  
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("❌ Session error:", error);
    handleSignedOut();
    return;
  }

  if (session?.user) {
    console.log("🔒 Existing session detected:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("👤 No active session - showing login");
    handleSignedOut();
  }
}

/* =============================================================
   SIGNED-IN (run only once)
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) return;

  window.__AUTH_GUARD__.signedInHandled = true;
  console.log("🎉 SIGNED IN AS:", user.email);

  // BACKFILL community row with error handling
  try {
    await backfillCommunityUser();
  } catch (err) {
    console.error("❌ Backfill failed:", err);
    // Don't block login on backfill failure
  }

  // Update UI
  handleSignedIn(user);

  // Notify main.js that auth is stable
  if (!window.__AUTH_GUARD__.initialized) {
    window.__AUTH_GUARD__.initialized = true;
    window.dispatchEvent(new CustomEvent("auth-ready"));
  }
}

/* =============================================================
   UI: Signed In
============================================================= */
function handleSignedIn(user) {
  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }

  loginSection?.classList.add("fade-out");

  setTimeout(() => {
    loginSection?.classList.add("hidden");
    profileSection?.classList.remove("hidden");
  }, 300);

  logoutBtn?.classList.remove("hidden");
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

// =============================================================
// EXPORT TO WINDOW – required on GitHub Pages
// =============================================================
window.initLoginSystem = initLoginSystem;
window.setupLoginDOM = setupLoginDOM;
