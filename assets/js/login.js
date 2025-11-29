// ======================================================================
// CharlestonHacks Innovation Engine — LOGIN CONTROLLER (2025 FINAL BUILD)
// Fully stable across:
//   ✔ index.html
//   ✔ 2card.html
//   ✔ desktop/mobile
//   ✔ Supabase magic link flows
//   ✔ hash token cleanup
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// Prevent double-handling signed-in events
window.__AUTH_GUARD__ = window.__AUTH_GUARD__ || {
  signedInHandled: false
};

// DOM references
const loginSection = document.getElementById("login-section");
const profileSection = document.getElementById("profile-section");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginButton = document.getElementById("login-button");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// ======================================================================
// Shared UI helpers
// ======================================================================

function showLoginUI() {
  loginSection.classList.remove("hidden");
  profileSection.classList.add("hidden");

  if (userBadge) userBadge.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.add("hidden");
}

function showProfileUI(user) {
  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");

  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }
  if (logoutBtn) logoutBtn.classList.remove("hidden");
}

async function handleSignedInOnce(user) {
  if (window.__AUTH_GUARD__.signedInHandled) return;

  console.log("🎉 Signed in as:", user.email);
  showProfileUI(user);

  window.__AUTH_GUARD__.signedInHandled = true;
}

function handleSignedOut() {
  console.log("🚪 Signed out");
  window.__AUTH_GUARD__.signedInHandled = false;
  showLoginUI();
}

// ======================================================================
// ✨ MAGIC LINK TOKEN PROCESSOR — REQUIRED FOR LOGIN TO WORK
// ======================================================================

async function processMagicLink() {
  try {
    const hash = window.location.hash;

    if (hash.includes("access_token")) {
      console.log("🔐 Magic link detected… consuming token via Supabase");

      const { data, error } = await supabase.auth.getSessionFromUrl({
        storeSession: true
      });

      if (error) {
        console.error("❌ Magic link error:", error);
      } else {
        console.log("✅ Magic link token consumed, session stored");
      }

      // Clean up URL (remove token)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (err) {
    console.error("❌ Magic link processing error:", err);
  }
}

// ======================================================================
// 📩 LOGIN FORM HANDLER
// ======================================================================

function wireLoginForm() {
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginEmail.value.trim();
    if (!email) return alert("Please enter your email.");

    loginButton.disabled = true;
    loginButton.textContent = "Sending…";

    console.log("📨 Sending magic link to:", email);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href.split("#")[0]
      }
    });

    loginButton.disabled = false;
    loginButton.textContent = "Send Magic Link";

    if (error) {
      console.error("❌ Failed to send magic link:", error);
      alert("Error sending magic link: " + error.message);
      return;
    }

    alert("Magic link sent! Check your inbox.");
  });
}

// ======================================================================
// 🚪 LOGOUT HANDLER
// ======================================================================

function wireLogout() {
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    handleSignedOut();
  });
}

// ======================================================================
// 🚀 MAIN LOGIN INIT
// ======================================================================

export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // 1) FIRST: Process magic link tokens
  await processMagicLink();

  // 2) Register supabase auth listeners
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event, "Session:", session?.user?.email);

    if (event === "TOKEN_REFRESHED") return;

    if (event === "SIGNED_OUT") {
      handleSignedOut();
      return;
    }

    if (event === "INITIAL_SESSION" && session?.user) {
      await handleSignedInOnce(session.user);
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      await handleSignedInOnce(session.user);
    }
  });

  // 3) After magic-link handling, check for existing session
  await new Promise((res) => setTimeout(res, 80));

  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🔄 Existing session detected:", session.user.email);
    await handleSignedInOnce(session.user);
  } else {
    console.log("⚠️ No active session, showing login");
    handleSignedOut();
  }

  // 4) Wire UI buttons
  wireLoginForm();
  wireLogout();
}
