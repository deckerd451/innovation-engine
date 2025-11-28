// ====================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FINAL 2025)
// Fully stable. No duplicate variables. No login loops.
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ====================================================================
// GLOBAL AUTH GUARD (single-run protection)
// ====================================================================
window.__AUTH_GUARD__ = window.__AUTH_GUARD__ || {
  initialized: false,       // main.js sync flag
  signedInHandled: false,   // prevents SIGNED_IN loops
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
// REDIRECT URL (Safe for localhost + production)
// ====================================================================
function buildRedirectUrl() {
  try {
    const origin = window.location?.origin;
    const safeOrigin =
      origin && origin !== "null"
        ? origin
        : "https://www.charlestonhacks.com";

    return `${safeOrigin.replace(/\/$/, "")}/2card.html`;
  } catch (err) {
    console.warn("[Login] Failed to compute redirect URL:", err);
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
    console.error("❌ login-form missing");
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
// SUBMIT LOGIN (Send Magic Link)
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
      shouldCreateUser: true,
    },
  });

  btn.disabled = false;
  btn.classList.remove("pulse", "sending");

  if (error) {
    console.error("[Login] Magic Link Error:", error);
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

  // ------------------------------------------------------------
  // 1) AUTH LISTENER — Single-run protection
  // ------------------------------------------------------------
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event, "Session:", session?.user?.email);

    if (event === "TOKEN_REFRESHED") return;

    if (event === "SIGNED_OUT") {
      window.__AUTH_GUARD__.signedInHandled = false;
      handleSignedOut();
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      if (window.__AUTH_GUARD__.signedInHandled) {
        console.log("⚠️ SIGNED_IN ignored (already handled)");
        return;
      }
      await handleSignedInOnce(session.user);
      return;
    }

    if (event === "INITIAL_SESSION" && session?.user) {
      if (window.__AUTH_GUARD__.signedInHandled) {
        console.log("⚠️ INITIAL_SESSION ignored (already handled)");
        return;
      }
      await handleSignedInOnce(session.user);
      return;
    }
  });

  // ------------------------------------------------------------
  // 2) CHECK SESSION (after URL hash is ready)
  // ------------------------------------------------------------
  await new Promise(res => setTimeout(res, 120));

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("❌ getSession error:", error);
    handleSignedOut();
    return;
  }

  if (session?.user) {
    console.log("🔒 Existing session:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("👤 No session — showing login");
    handleSignedOut();
  }
}

// ====================================================================
// SIGNED-IN HANDLER (run once only)
// ====================================================================
async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) return;

  window.__AUTH_GUARD__.signedInHandled = true;
  console.log("🎉 SIGNED IN AS:", user.email);

  try {
    await backfillCommunityUser();
  } catch (err) {
    console.error("❌ Backfill error:", err);
  }

  handleSignedIn(user);

  if (!window.__AUTH_GUARD__.initialized) {
    window.__AUTH_GUARD__.initialized = true;
    window.dispatchEvent(new CustomEvent("auth-ready"));
  }
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
  }, 250);

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
// EXPORT FOR MAIN.JS (GitHub Pages requirement)
// ====================================================================
window.initLoginSystem = initLoginSystem;
window.setupLoginDOM = setupLoginDOM;
