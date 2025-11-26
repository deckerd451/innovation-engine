// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (2025 FINAL)
// Ultra-stable. Zero loops. Zero duplicates. GitHub Pages–safe.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ====================================================================
// GLOBAL AUTH GUARD (Prevents Duplicates + Loops)
// ====================================================================
window.__AUTH_GUARD__ = window.__AUTH_GUARD__ || {
  initialized: false,
  signedInHandled: false
};

// ====================================================================
// DOM references (assigned in setupLoginDOM)
// ====================================================================
let loginSection;
let loginForm;
let loginEmailInput;
let profileSection;
let userBadge;
let logoutBtn;

// MUST MATCH Supabase redirect URL EXACTLY
const REDIRECT_URL = "https://www.charlestonhacks.com/2card.html";

/* =============================================================
   DOM SETUP — ensures login button works immediately
============================================================= */
export function setupLoginDOM() {
  loginSection      = document.getElementById("login-section");
  loginForm         = document.getElementById("login-form");
  loginEmailInput   = document.getElementById("login-email");
  profileSection    = document.getElementById("profile-section");
  userBadge         = document.getElementById("user-badge");
  logoutBtn         = document.getElementById("logout-btn");

  if (!loginForm) {
    console.error("❌ login-form not found.");
    return;
  }

  loginForm.addEventListener("submit", onSubmitLogin);

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
   LOGIN SYSTEM INITIALIZATION
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // Give Supabase time to parse URL hash → session
  await new Promise(res => setTimeout(res, 30));

  // Check existing session BEFORE adding listeners
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🔒 Existing session:", session.user.email);
    handleSignedIn(session.user); // UI only
  } else {
    handleSignedOut();
  }

  // Delay listener to avoid INITIAL_SESSION → SIGNED_IN loop
  setTimeout(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth event:", event);

      if (event === "TOKEN_REFRESHED") {
        console.log("🔁 TOKEN_REFRESHED ignored");
        return;
      }

      if (event === "SIGNED_OUT") {
        window.__AUTH_GUARD__.signedInHandled = false;
        handleSignedOut();
        return;
      }

      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_IN" && session?.user) {
        if (window.__AUTH_GUARD__.signedInHandled) {
          console.log("⚠️ SIGNED_IN ignored (already handled)");
          return;
        }
        await handleSignedInOnce(session.user);
      }
    });
  }, 250);
}

/* =============================================================
   SIGNED-IN HANDLER (Runs Once)
============================================================= */
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) return;

  window.__AUTH_GUARD__.signedInHandled = true;

  console.log("🎉 SIGNED IN:", user.email);

  await backfillCommunityUser();
  handleSignedIn(user);

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
