// ====================================================================
// CharlestonHacks Innovation Engine — LOGIN CONTROLLER (2025 FINAL)
// Completely stable, no loops, no duplicate handling, no race conditions.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ====================================================================
// GLOBAL AUTH GUARD — prevents loops
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
// REDIRECT URL (auto-detect local, preview, production)
// ====================================================================
function buildRedirectUrl() {
  try {
    const origin = window.location.origin;

    if (!origin || origin === "null") {
      return "https://www.charlestonhacks.com/2card.html";
    }

    const normalized = origin.replace(/\/$/, "");
    return `${normalized}/2card.html`;
  } catch (err) {
    console.warn("[Login] Redirect fallback used:", err);
    return "https://www.charlestonhacks.com/2card.html";
  }
}

const REDIRECT_URL = buildRedirectUrl();

// ====================================================================
// DOM SETUP
// ====================================================================
export function setupLoginDOM() {
  loginSection    = document.getElementById("login-section");
  loginForm       = document.getElementById("login-form");
  loginEmailInput = document.getElementById("login-email");
  profileSection  = document.getElementById("profile-section");
  userBadge       = document.getElementById("user-badge");
  logoutBtn       = document.getElementById("logout-btn");

  if (!loginForm) {
    console.error("❌ login-form not found — DOM incomplete");
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
// LOGIN SUBMIT HANDLER
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
// LOGIN SYSTEM INIT
// ====================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  if (window.__AUTH_GUARD__.initialized) {
    console.log("⚠️ Login system already initialized — skipping");
    return;
  }

  window.__AUTH_GUARD__.initialized = true;

  // Auth listener FIRST
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event, "Session:", session?.user?.email);

    switch (event) {
      case "SIGNED_OUT":
        window.__AUTH_GUARD__.signedInHandled = false;
        handleSignedOut();
        break;

      case "SIGNED_IN":
        if (!window.__AUTH_GUARD__.signedInHandled) {
          await handleSignedInOnce(session.user);
        }
        break;

      case "INITIAL_SESSION":
        if (session?.user && !window.__AUTH_GUARD__.signedInHandled) {
          await handleSignedInOnce(session.user);
        }
        break;

      default:
        break;
    }
  });

  // Check for existing session
  await new Promise(res => setTimeout(res, 120));

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("❌ Session error:", error);
    handleSignedOut();
    return;
  }

  if (session?.user) {
    console.log("🔒 Existing session:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("👤 No active session — showing login");
    handleSignedOut();
  }
}

// ====================================================================
// HANDLE SIGNED-IN (ONLY ONCE)
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
  window.dispatchEvent(new CustomEvent("auth-ready"));
}

// ====================================================================
// UI: Signed In
// ====================================================================
function handleSignedIn(user) {
  userBadge.textContent = `Logged in as: ${user.email}`;
  userBadge.classList.remove("hidden");

  loginSection.classList.add("fade-out");

  setTimeout(() => {
    loginSection.classList.add("hidden");
    profileSection.classList.remove("hidden");
  }, 300);

  logoutBtn.classList.remove("hidden");
}

// ====================================================================
// UI: Signed Out
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
// EXPORT TO WINDOW (GitHub Pages)
// ====================================================================
window.initLoginSystem = initLoginSystem;
window.setupLoginDOM = setupLoginDOM;
