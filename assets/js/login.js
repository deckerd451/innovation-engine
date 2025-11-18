// =============================================================
// CharlestonHacks Innovation Engine – Complete Login Controller
// Rewritten 2025 – Fully Compatible with Merged HTML
// =============================================================

import { supabase } from "./supabaseClient.js";

import { showNotification } from "./utils.js";

// =============================================================
// DOM ELEMENTS
// =============================================================
const loginSection = document.getElementById("login-section");
const profileSection = document.getElementById("profile-section");
const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// Safety checks
if (!loginSection || !profileSection) {
  console.warn("[Login] Missing required DOM elements.");
}

// =============================================================
// SHOW / HIDE HELPERS
// =============================================================
function showLogin() {
  loginSection?.classList.remove("hidden");
  profileSection?.classList.add("hidden");
  if (userBadge) userBadge.textContent = "";
}

function showProfile(user) {
  loginSection?.classList.add("hidden");
  profileSection?.classList.remove("hidden");

  if (userBadge && user?.email) {
    userBadge.classList.remove("hidden");
    userBadge.textContent = user.email;
  }
}

// =============================================================
// INITIAL SESSION RESTORE
// Called on every page load BEFORE profile.js initializes
// =============================================================
async function restoreSession() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn("[Login] Session restore error:", error);
      showLogin();
      return;
    }

    const session = data?.session;
    const user = session?.user;

    if (user) {
      console.log("[Login] Session found:", user.email);
      showProfile(user);
    } else {
      showLogin();
    }
  } catch (err) {
    console.error("[Login] Unexpected restore error:", err);
    showLogin();
  }
}

// Run session restore immediately
restoreSession();

// =============================================================
// MAGIC LINK LOGIN HANDLER
// =============================================================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmail?.value?.trim();
  if (!email) {
    showNotification("Please enter an email address.", "error");
    return;
  }

  // Send magic link via Supabase
  try {
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      console.error("[Login] Magic link error:", error);
      showNotification("Login failed: " + error.message, "error");
      return;
    }

    showNotification(
      "Magic link sent! Check your email to complete login.",
      "success"
    );
  } catch (err) {
    console.error("[Login] Unexpected login error:", err);
    showNotification("Unexpected error sending magic link.", "error");
  }
});

// =============================================================
// AUTH STATE CHANGE LISTENER
// Ensures UI updates correctly after coming back via magic link
// =============================================================
supabase.auth.onAuthStateChange((event, session) => {
  console.log("[Login] Auth event:", event);

  const user = session?.user;

  if (user) {
    console.log("[Login] Authenticated:", user.email);
    showProfile(user);
  } else {
    showLogin();
  }
});

// =============================================================
// LOGOUT HANDLER
// =============================================================
logoutBtn?.addEventListener("click", async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[Login] Logout error:", error);
      showNotification("Logout failed.", "error");
      return;
    }

    showNotification("Logged out successfully.", "success");
    showLogin();
  } catch (err) {
    console.error("[Login] Unexpected logout error:", err);
    showNotification("Unexpected error logging out.", "error");
  }
});

// =============================================================
// END OF FILE
// =============================================================
