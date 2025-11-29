// ======================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FINAL 2025)
// Handles:
//   ✔ Magic Link auth
//   ✔ URL callback cleanup
//   ✔ Switch Login <-> Profile sections
//   ✔ Ensures no infinite loops
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM refs
let loginSection, profileSection, loginForm, loginEmail, loginButton;

export function setupLoginDOM() {
  loginSection = document.getElementById("login-section");
  profileSection = document.getElementById("profile-section");
  loginForm = document.getElementById("login-form");
  loginEmail = document.getElementById("login-email");
  loginButton = document.getElementById("login-button");

  if (!loginForm) {
    console.error("❌ login-form not found in DOM");
    return;
  }

  // Attach listener safely
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendMagicLink();
  });

  console.log("🎨 Login DOM setup complete");
}

// ======================================================================
// UI Helpers
// ======================================================================
function showLoginUI() {
  loginSection.classList.remove("hidden");
  profileSection.classList.add("hidden");
}

function showProfileUI() {
  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");
}

// ======================================================================
// 1) Send Magic Link
// ======================================================================
async function sendMagicLink() {
  const email = loginEmail.value.trim();
  if (!email) return;

  loginButton.disabled = true;
  loginButton.textContent = "Sending...";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://www.charlestonhacks.com/2card.html",
    }
  });

  loginButton.disabled = false;
  loginButton.textContent = "Send Magic Link";

  if (error) {
    console.error("❌ Magic Link error:", error.message);
    showNotification("Error sending link. Check email format.");
    return;
  }

  showNotification("Magic link sent! Check your email.");
  console.log("📨 Magic link sent successfully");
}

// ======================================================================
// 2) Process Magic Link From URL
// ======================================================================
async function processMagicLink() {
  if (!window.location.hash.includes("access_token")) return;

  console.log("🔑 Processing Supabase URL callback...");

  const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });

  if (error) {
    console.error("❌ Error processing magic link:", error.message);
  } else {
    console.log("✨ Magic link processed:", data);
  }

  // 🚀 CLEAN URL so auth does not re-trigger
  window.history.replaceState({}, document.title, window.location.pathname);
}

// ======================================================================
// 3) Main Login Init
// ======================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system...");

  // Step 1 — Process magic link if present
  await processMagicLink();

  // Step 2 — Check current session
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (session && session.user) {
    console.log("🟢 Already signed in:", session.user.email);
    showProfileUI();
  } else {
    console.log("🟡 No active session");
    showLoginUI();
  }

  // Step 3 — Listen for auth events (single listener only)
  supabase.auth.onAuthStateChange((event, session) => {
    console.log(`⚡ Auth event: ${event}`);

    if (event === "SIGNED_IN") {
      console.log("🟢 User logged in:", session.user.email);
      showProfileUI();
    }

    if (event === "SIGNED_OUT") {
      console.log("🟡 User logged out");
      showLoginUI();
    }
  });

  console.log("✅ Login system initialized");
}
