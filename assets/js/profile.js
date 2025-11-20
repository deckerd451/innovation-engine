// ====================================================================
// CharlestonHacks Innovation Engine – Hardened Login Controller (2025)
// FINAL PRODUCTION VERSION
// Fixes:
//   ✔ Magic link not sending
//   ✔ Placeholder email bug
//   ✔ No notification displayed
//   ✔ Race conditions between login + profile load
// ====================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM Elements
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");

const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   INIT LOGIN SYSTEM
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing hardened login system…");

  // Restore existing session
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) {
    console.log("🔐 Session restored → logged in");
    handleSignedIn(data.session.user);
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      console.log("🔐 Auth state change:", event, "→ logged in");
      handleSignedIn(session.user);
    } else if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

/* =============================================================
   LOGIN WITH MAGIC LINK (FIXED)
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmailInput.value.trim();

  if (!email || !email.includes("@")) {
    showNotification("Enter a valid email.", "error");
    return;
  }

  console.log("📨 Sending magic link to:", email);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("❌ Magic link error:", error);
    showNotification("Could not send magic link.", "error");
  } else {
    showNotification("Magic link sent! Check your email.", "success");
  }
});

/* =============================================================
   HANDLE SIGN-IN EVENTS
============================================================= */
function handleSignedIn(user) {
  console.log("[Login] Authenticated:", user.email);

  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }

  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
}

/* =============================================================
   HANDLE SIGN-OUT EVENTS
============================================================= */
function handleSignedOut() {
  console.log("[Login] Signed out.");

  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  profileSection?.classList.add("hidden");
  loginSection?.classList.remove("hidden");
  loginEmailInput.value = "";
}

/* =============================================================
   LOGOUT
============================================================= */
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  handleSignedOut();
});
