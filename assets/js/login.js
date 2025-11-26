// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (2025 FINAL)
// Zero loops. Zero race conditions. Correct Supabase workflow.
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
// DOM references
// ====================================================================
let loginSection;
let loginForm;
let loginEmailInput;
let profileSection;
let userBadge;
let logoutBtn;

// Your GitHub Pages URL. MUST match Supabase redirect list exactly.
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
   INIT LOGIN SYSTEM — main.js waits for auth-ready
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // Allow Supabase URL hash parsing to complete
  await new Promise(res => setTimeout(res, 20));

  // 1) INITIAL USER CHECK — UI ONLY. No backfill. No events.
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🔒 Existing session detected:", session.user.email);
    handleSignedIn(session.user); // UI only — safe
  } else {
    handleSignedOut();
  }

  // 2) AUTH EVENTS — delayed to avoid INITIAL_SESSION → SIGNED_IN loop
  setTimeout(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth event:", event);

      // 2a) Ignore token refresh — avoids loops
      if (event === "TOKEN_REFRESHED") {
        console.log("🔁 TOKEN_REFRESHED ignored (preventing loop)");
        return;
      }

      // 2b) Signed Out
      if (event === "SIGNED_OUT") {
        window.__AUTH_GUARD__.signedInHandled = false;
        handleSignedOut();
        return;
      }

      // 2c) INITIAL_SESSION — Supabase internal warm-up — ignore
      if (event === "INITIAL_SESSION") {
        return;
      }

      // 2d) SIGNED_IN — the *only* moment we run full logic
      if (event === "SIGNED_IN" && session?.user) {
        if (window.__AUTH_GUARD__.signedInHandled) {
          console.log("⚠️ SIGNED_IN ignored — already handled");
          return;
        }

        await handleSignedInOnce(session.user);
      }
    });
  }, 200);
}

/* =============================================================
   SIGNED-IN (run only once)
   → backfill
   → UI update
   → auth-ready
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) {
    console.log("⚠️ SIGNED_IN ignored (already processed)");
    return;
  }

  window.__AUTH_GUARD__.signedInHandled = true;

  console.log("🎉 SIGNED IN AS:", user.email);

  // BACKFILL community row
  await backfillCommunityUser();

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
  logoutBtn?.classList.add("hidde
