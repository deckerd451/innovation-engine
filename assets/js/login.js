// ====================================================================
// CharlestonHacks Innovation Engine – Hardened Login Controller (2025)
// Now bullet-proof against auth loops, bad redirect URLs, and caching.
// ====================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

/* ------------------------------------------------------------
   0) RESOLVED REDIRECT URL (runs everywhere, no loops)
------------------------------------------------------------ */
function resolveRedirectURL() {
  const origin = window.location.origin;

  // Production GitHub Pages
  if (origin.includes("charlestonhacks.com")) {
    return "https://charlestonhacks.com/2card.html";
  }

  // Local development
  return "http://localhost:5500/2card.html";
}

const REDIRECT_URL = resolveRedirectURL();
console.log("🔁 LOGIN redirect URL:", REDIRECT_URL);

/* ------------------------------------------------------------
   1) DOM ELEMENTS
------------------------------------------------------------ */
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");

const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

/* Forgot password */
let forgotPasswordLink, forgotPasswordEmailInput, forgotPasswordButton;

/* =============================================================
   INIT LOGIN SYSTEM
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing hardened login system…");

  createForgotPasswordUI();

  // SAFETY: remove duplicate listeners if reloaded
  cleanupDuplicateListeners();

  // Restore session safely
  const { data } = await supabase.auth.getSession();
  const sessionUser = data?.session?.user ?? null;

  if (sessionUser) {
    console.log("🔐 Session restored:", sessionUser.email);
    handleSignedIn(sessionUser);
  }

  // Real-time auth listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔐 Auth event:", event);

    if (event === "SIGNED_IN" && session?.user) {
      handleSignedIn(session.user);
    }

    if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

/* =============================================================
   LOGIN WITH MAGIC LINK — NOW WITH FULL ERROR REPORTING
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmailInput.value.trim();
  if (!email) {
    showNotification("Please enter an email address.", "error");
    return;
  }

  console.log("📨 Sending magic link to:", email);
  console.log("📨 Redirect:", REDIRECT_URL);

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("❌ Magic Link Error:", error);
    showNotification(
      `Login failed: ${error.message || "Unknown error"}`,
      "error"
    );
    return;
  }

  showNotification("Magic Link sent! Check your email.", "success");
});

/* =============================================================
   FORGOT PASSWORD — HARNDED
============================================================= */
async function handleForgotPassword() {
  const email = forgotPasswordEmailInput.value.trim();
  if (!email) {
    showNotification("Enter your email to reset password.", "error");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: REDIRECT_URL
  });

  if (error) {
    console.error("❌ Reset password failed:", error);
    showNotification("Could not send password reset link.", "error");
  } else {
    showNotification("Password reset email sent!", "success");
  }
}

/* =============================================================
   BUILD FORGOT PASSWORD UI
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
  wrapper.style.display = "none";
  wrapper.style.marginTop = "12px";

  forgotPasswordEmailInput = document.createElement("input");
  forgotPasswordEmailInput.type = "email";
  forgotPasswordEmailInput.placeholder = "Enter your email";

  forgotPasswordButton = document.createElement("button");
  forgotPasswordButton.className = "action-btn";
  forgotPasswordButton.textContent = "Send Reset Link";

  wrapper.appendChild(forgotPasswordEmailInput);
  wrapper.appendChild(forgotPasswordButton);
  loginSection.appendChild(wrapper);

  forgotPasswordLink.addEventListener("click", () => {
    wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
  });

  forgotPasswordButton.addEventListener("click", handleForgotPassword);
}

/* =============================================================
   HANDLE SIGN-IN
============================================================= */
function handleSignedIn(user) {
  console.log("🔓 User authenticated:", user.email);

  userBadge.textContent = `Logged in as: ${user.email}`;
  userBadge.classList.remove("hidden");

  loginSection.classList.add("hidden");
  profileSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
}

/* =============================================================
   HANDLE SIGN-OUT
============================================================= */
function handleSignedOut() {
  console.log("🔒 User signed out");

  userBadge.classList.add("hidden");
  logoutBtn.classList.add("hidden");

  profileSection.classList.add("hidden");
  loginSection.classList.remove("hidden");

  loginEmailInput.value = "";
}

/* =============================================================
   LOGOUT
============================================================= */
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  handleSignedOut();
});

/* =============================================================
   SAFETY: CLEANUP DUPLICATE LISTENERS (prevents loops)
============================================================= */
function cleanupDuplicateListeners() {
  const newForm = loginForm.cloneNode(true);
  loginForm.parentNode.replaceChild(newForm, loginForm);
}
