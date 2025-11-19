// ====================================================================
// CharlestonHacks Innovation Engine – Login Controller (2025)
// FINAL VERSION with Magic Link, Password Reset, Session Sync
// ====================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// UI Elements
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");

const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// NEW: Forgot password UI
let forgotPasswordLink = null;
let forgotPasswordButton = null;
let forgotPasswordEmailInput = null;

// Redirect back to this page after auth
const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   INIT LOGIN SYSTEM
============================================================= */
export async function initLoginSystem() {
  createForgotPasswordUI();

  // Restore existing session
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) {
    handleSignedIn(data.session.user);
  }

  // Listen for future changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      handleSignedIn(session.user);
    }

    if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

/* =============================================================
   LOGIN WITH MAGIC LINK
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmailInput.value.trim();
  if (!email) {
    showNotification("Please enter an email.", "error");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_URL }
  });

  if (error) {
    console.error(error);
    showNotification("Login failed. Check your email.", "error");
  } else {
    showNotification("Check your email for your magic link!", "success");
  }
});

/* =============================================================
   FORGOT PASSWORD – SEND RESET LINK
============================================================= */
async function handleForgotPassword() {
  const email = forgotPasswordEmailInput.value.trim();
  if (!email) {
    showNotification("Enter your email to reset password.", "error");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: REDIRECT_URL,
  });

  if (error) {
    console.error(error);
    showNotification("Could not send reset link.", "error");
  } else {
    showNotification("Password reset email sent!", "success");
  }
}

/* =============================================================
   CREATE FORGOT PASSWORD UI ELEMENTS
============================================================= */
function createForgotPasswordUI() {
  forgotPasswordLink = document.createElement("p");
  forgotPasswordLink.className = "forgot-password-link";
  forgotPasswordLink.textContent = "Forgot your password?";
  forgotPasswordLink.style.cursor = "pointer";
  forgotPasswordLink.style.marginTop = "10px";
  forgotPasswordLink.style.textDecoration = "underline";

  loginSection.appendChild(forgotPasswordLink);

  const wrapper = document.createElement("div");
  wrapper.id = "forgot-password-wrapper";
  wrapper.style.display = "none";
  wrapper.style.marginTop = "15px";

  forgotPasswordEmailInput = document.createElement("input");
  forgotPasswordEmailInput.type = "email";
  forgotPasswordEmailInput.placeholder = "Enter your email";
  forgotPasswordEmailInput.style.marginBottom = "6px";

  forgotPasswordButton = document.createElement("button");
  forgotPasswordButton.textContent = "Send Reset Link";
  forgotPasswordButton.className = "action-btn";

  wrapper.appendChild(forgotPasswordEmailInput);
  wrapper.appendChild(forgotPasswordButton);

  loginSection.appendChild(wrapper);

  // Toggle visibility
  forgotPasswordLink.addEventListener("click", () => {
    wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
  });

  forgotPasswordButton.addEventListener("click", handleForgotPassword);
}

/* =============================================================
   HANDLE SIGN-IN EVENTS
============================================================= */
function handleSignedIn(user) {
  console.log("[Login] Authenticated:", user.email);

  // Show user in badge
  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }

  // Show profile section
  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");

  // Enable logout
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
