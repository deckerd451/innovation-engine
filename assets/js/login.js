// assets/js/login.js
// CharlestonHacks Innovation Engine – Public-Mode-Ready Login Controller
// -------------------------------------------------------------

import { supabaseClient as supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// 🔧 Toggle this flag to enable / disable login requirement
const LOGIN_DISABLED = true;

// Main elements
const loginSection = document.getElementById("login-section");
const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// -------------------------------------------------------------
// 🚪 1) PUBLIC-MODE SHORT-CIRCUIT
// -------------------------------------------------------------
if (LOGIN_DISABLED) {
  console.log("🔓 Login disabled — public mode active.");
  if (loginSection) loginSection.classList.add("hidden");
  if (profileSection) profileSection.classList.remove("hidden");

  // Fake a “guest” session so rest of site works as usual
  window.currentUser = {
    id: "guest-" + crypto.randomUUID(),
    email: "guest@charlestonhacks.com",
    role: "guest"
  };

  if (userBadge) {
    userBadge.textContent = "Guest Mode";
    userBadge.classList.remove("hidden");
  }
  if (logoutBtn) logoutBtn.classList.add("hidden");

  // Optionally create a record in localStorage for persistence
  if (!localStorage.getItem("guest_id")) {
    localStorage.setItem("guest_id", window.currentUser.id);
  }

  // Skip Supabase auth listener entirely
  console.log("✅ Public mode initialized – skipping auth setup.");
} else {
  // -------------------------------------------------------------
  // 🔐 2) NORMAL LOGIN FLOW (Magic Link Auth)
  // -------------------------------------------------------------
  const loginForm = document.getElementById("login-form");
  const loginEmail = document.getElementById("login-email");

  // When user submits email
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    if (!email) return showNotification("Please enter an email address.");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      console.error("❌ Magic link error:", error.message);
      return showNotification("Error sending link. Try again.");
    }
    showNotification("Magic link sent! Check your inbox.");
  });

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔄 Auth event:", event);
    if (session?.user) {
      const user = session.user;
      window.currentUser = user;
      if (userBadge) {
        userBadge.textContent = user.email;
        userBadge.classList.remove("hidden");
      }
      if (loginSection) loginSection.classList.add("hidden");
      if (profileSection) profileSection.classList.remove("hidden");
      logoutBtn?.classList.remove("hidden");
    } else {
      if (loginSection) loginSection.classList.remove("hidden");
      if (profileSection) profileSection.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
    }
  });

  // Logout button
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("guest_id");
    showNotification("Logged out successfully.");
  });
}
