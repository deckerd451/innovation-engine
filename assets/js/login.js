// ====================================================================
// CharlestonHacks Innovation Engine – Hardened Login (Final 2025)
// Fixed: correct email extraction, safe redirects, notifications
// ====================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");

const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   INIT
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing hardened login system…");

  const { data } = await supabase.auth.getSession();

  if (data?.session?.user) {
    console.log("🔐 Existing session detected");
    handleSignedIn(data.session.user);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth state change:", event);

    if (event === "SIGNED_IN" && session?.user) {
      handleSignedIn(session.user);
    }

    if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

/* =============================================================
   LOGIN (Magic Link)
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmailInput.value.trim();

  if (!email || !email.includes("@")) {
    showNotification("Please enter a valid email address.", "error");
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
    showNotification("Login failed. Check the email format.", "error");
  } else {
    showNotification("Magic link sent! Check your email.", "success");
  }
});

/* =============================================================
   SIGNED IN
============================================================= */
function handleSignedIn(user) {
  console.log("[Login] Authenticated:", user.email);

  loginSection?.classList.add("hidden");
  profileSection?.classList.remove("hidden");

  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }

  if (logoutBtn) logoutBtn.classList.remove("hidden");
}

/* =============================================================
   SIGNED OUT
============================================================= */
function handleSignedOut() {
  console.log("[Login] Signed out.");

  loginSection?.classList.remove("hidden");
  profileSection?.classList.add("hidden");

  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  if (loginEmailInput) loginEmailInput.value = "";
}

/* =============================================================
   LOGOUT
============================================================= */
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  handleSignedOut();
});
