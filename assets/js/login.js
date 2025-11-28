// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FINAL 2025)
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

// ====================================================================
// BUILD REDIRECT URL (works on localhost + production)
// ====================================================================
function buildRedirectUrl() {
  try {
    const origin = window.location?.origin;
    const usableOrigin = origin && origin !== "null"
      ? origin
      : "https://www.charlestonhacks.com";

    const normalized = usableOrigin.replace(/\/$/, "");
    return `${normalized}/2card.html`;
  } catch (err) {
    console.warn("[Login] Failed to build redirect URL — using fallback", err);
    return "https://www.charlestonhacks.com/2card.html";
  }
}

const REDIRECT_URL = buildRedirectUrl();

// ====================================================================
// DOM SETUP
// ====================================================================
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

  loginForm.addEventListener("submit", onSubmitLogin);

  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.__AUTH_GUARD__.signedInHandled = false;
    handleSignedOut();
  });
}

// ====================================================================
// LOGIN SUBMISSION
// ====================================================================
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

// ====================================================================
// INIT LOGIN SYSTEM
// ====================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event, "Session:", session?.user?.email);

    if (event === "TOKEN_REFRESHED") return;

    if (event === "SIGNED_OUT") {
      window.__AUTH_GUARD__.signedInHandled = false;
      handleSignedOut();
      return;
    }

    if (event === "INITIAL_SESSION" && session?.user) {
      if (!window.__AUTH_GUARD__.signedInHandled) {
        await handleSignedInOnce(session.user);
      }
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      if (!window.__AUTH_GUARD__.signedInHandled) {
        await handleSignedInOnce(session.user);
      }
    }
  });

  // Let Supabase parse the hash fragment
  await new Promise(res => setTimeout(res, 100));

  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    await handleSignedInOnce(session.user);
  } else {
    handleSignedOut();
  }
}

// ====================================================================
// SIGN-IN HANDLER (runs only once)
// ====================================================================
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) return;

  window.__AUTH_GUARD__.signedInHandled = true;

  console.log("🎉 SIGNED IN AS:", user.email);

  try {
    await backfillCommunityUser();
  } catch (err) {
    console.error("❌ Backfill failed:", err);
  }

  handleSignedIn(user);

  if (!window.__AUTH_GUARD__.initialized) {
    window.__AUTH_GUARD__.initialized = true;
    window.dispatchEvent(new CustomEvent("auth-ready"));
  }
}

// ====================================================================
// UI: SIGNED IN
// ====================================================================
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

// ====================================================================
// UI: SIGNED OUT
// ====================================================================
function handleSignedOut() {
  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  profileSection?.classList.add("hidden");
  loginSection?.classList.remove("hidden");
  loginSection?.classList.remove("fade-out");

  if (loginEmailInput) loginEmailInput.value = "";
}

// ====================================================================
// EXPORT for main.js
// ====================================================================
window.initLoginSystem = initLoginSystem;
window.setupLoginDOM = setupLoginDOM;
