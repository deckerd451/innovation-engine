// ======================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FINAL 2025)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM refs
let loginSection, profileSection, loginForm, loginEmail, loginButton;

// ======================================================================
// 1. SETUP LOGIN DOM
// ======================================================================
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

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await sendMagicLink();
  });

  console.log("🎨 Login DOM setup complete");
}

// ======================================================================
// 2. UI HELPERS
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
// 3. SEND MAGIC LINK
// ======================================================================
async function sendMagicLink() {
  const email = loginEmail.value.trim();
  if (!email) return;

  loginButton.disabled = true;
  loginButton.textContent = "Sending…";

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
    showNotification("Error sending link. Try again.");
    return;
  }

  console.log("📨 Magic link sent");
  showNotification("Magic link sent! Check your email.");
}

// ======================================================================
// 4. PROCESS MAGIC LINK (Supabase v2)
// ======================================================================
async function processMagicLink() {

  // Skip if no code= or error= in URL
 const hash = window.location.hash;
if (!(hash.includes("access_token") || hash.includes("refresh_token"))) {
  return;  // nothing to process
}


  console.log("🔁 Processing Supabase URL callback…");

  const { data, error } = await supabase.auth.exchangeCodeForSession(
    window.location.href
  );

  if (error) {
    console.error("❌ Error during magic link exchange:", error);
    return;
  }

  console.log("🔓 Auth: SIGNED_IN via magic link!", data);

  // 🚀 CLEAN URL after successful login
  window.history.replaceState({}, document.title, window.location.pathname);
}

// ======================================================================
// 5. MAIN INIT
// ======================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // STEP A — Handle magic link callback (if present)
  await processMagicLink();

  // STEP B — Get current session properly
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🟢 Already logged in as:", session.user.email);
    showProfileUI();
  } else {
    console.log("🟡 No active session");
    showLoginUI();
  }

  // STEP C — Auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("⚡ Auth event:", event);

    if (event === "SIGNED_IN") {
      showProfileUI();
    }
    if (event === "SIGNED_OUT") {
      showLoginUI();
    }
  });

  console.log("✅ Login system initialized");
}
