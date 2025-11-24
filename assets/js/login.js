// ====================================================================
// CharlestonHacks Innovation Engine – Login Controller (2025)
// FULLY SYNCED WITH supabaseClient.js (no loops, final build)
// ====================================================================

import { supabase, backfillCommunityUser } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// --------------------------------------------------
// DOM Elements
// --------------------------------------------------
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");

const profileSection = document.getElementById("profile-section");
const userBadge = document.getElementById("user-badge");
const logoutBtn = document.getElementById("logout-btn");

// Dynamic forgot-password elements
let forgotPasswordLink, forgotPasswordButton, forgotPasswordEmailInput;

// Redirect target after magic link login
const REDIRECT_URL = "https://charlestonhacks.com/2card.html";

/* =============================================================
   INIT LOGIN SYSTEM  (called by main.js)
============================================================= */
export async function initLoginSystem() {
  console.log("🔐 Initializing login system…");

  // ------------------------------------------------------------
  // MICROTASK FIX — CRITICAL FOR MAGIC-LINK FLOW
  // ------------------------------------------------------------
  // Allows Supabase to attach internal URL listeners before we call getSession().
  await new Promise(res => setTimeout(res, 0));

  createForgotPasswordUI();


  // ------------------------------------------------------------
  // 1) Prevent AUTH LOOP after magic link
  // ------------------------------------------------------------
  // Supabase writes the session from URL fragments asynchronously.
  // For ~200–400ms, getSession() will return null even though
  // the user IS authenticated.
  // This delay ensures the session is stored BEFORE UI checks run.
  // ------------------------------------------------------------
  const urlContainsAuth =
    window.location.hash.includes("access_token") ||
    window.location.search.includes("access_token");

  if (urlContainsAuth) {
    console.log("⏳ Completing Supabase magic-link login…");
    await new Promise((res) => setTimeout(res, 400));
  }

  // ------------------------------------------------------------
  // 2) Try restoring session from localStorage
  // ------------------------------------------------------------
  const { data: initial } = await supabase.auth.getSession();
  const existingUser = initial?.session?.user;

  if (existingUser) {
    console.log("🔒 Restored existing session:", existingUser.email);
    await backfillCommunityUser();
    handleSignedIn(existingUser);
  } else {
    console.log("🔓 No active session — showing login page");
    handleSignedOut();
  }

  // ------------------------------------------------------------
  // 3) Live auth event listener
  // ------------------------------------------------------------
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("[Login] Auth event:", event);

    if (event === "SIGNED_IN" && session?.user) {
      await backfillCommunityUser();
      handleSignedIn(session.user);
    }

    if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

/* =============================================================
   MAGIC LINK LOGIN
============================================================= */
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = loginEmailInput.value.trim();
  if (!email) {
    showNotification("Please enter your email.", "error");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("[Login] OTP Error:", error);
    showNotification("Login failed. Please check your email.", "error");
  } else {
    showNotification("Magic link sent! Check your email.", "success");
  }
});

/* =============================================================
   FORGOT PASSWORD
============================================================= */
async function handleForgotPassword() {
  const email = forgotPasswordEmailInput.value.trim();

  if (!email) {
    showNotification("Enter your email to reset your password.", "error");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: REDIRECT_URL
  });

  if (error) {
    console.error("[Login] Reset error:", error);
    showNotification("Could not send reset email.", "error");
  } else {
    showNotification("Password reset email sent!", "success");
  }
}

/* =============================================================
   CREATE FORGOT PASSWORD UI
============================================================= */
function createForgotPasswordUI() {
  forgotPasswordLink = document.createElement("p");
  forgotPasswordLink.textContent = "Forgot your password?";
  forgotPasswordLink.style.cursor = "pointer";
  forgotPasswordLink.style.marginTop = "10px";
  forgotPasswordLink.style.textDecoration = "underline";
  forgotPasswordLink.className = "forgot-password-link";

  loginSection.appendChild(forgotPasswordLink);

  const wrapper = document.createElement("div");
  wrapper.id = "forgot-password-wrapper";
  wrapper.style.display = "none";
  wrapper.style.marginTop = "10px";

  forgotPasswordEmailInput = document.createElement("input");
  forgotPasswordEmailInput.type = "email";
  forgotPasswordEmailInput.placeholder = "Your email";
  forgotPasswordEmailInput.className = "forgot-email-input";

  forgotPasswordButton = document.createElement("button");
  forgotPasswordButton.textContent = "Send Reset Link";
  forgotPasswordButton.className = "action-btn";

  wrapper.appendChild(forgotPasswordEmailInput);
  wrapper.appendChild(forgotPasswordButton);
  loginSection.appendChild(wrapper);

  forgotPasswordLink.addEventListener("click", () => {
    wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
  });

  forgotPasswordButton.addEventListener("click", handleForgotPassword);
}

/* =============================================================
   ON SIGN-IN
============================================================= */
function handleSignedIn(user) {
  console.log("[Login] Authenticated:", user.email);

  if (userBadge) {
    userBadge.textContent = `Logged in as: ${user.email}`;
    userBadge.classList.remove("hidden");
  }

  loginSection?.classList.add("hidden");
  profileSection?.classList.remove("hidden");

  logoutBtn?.classList.remove("hidden");
}

/* =============================================================
   ON SIGN-OUT
============================================================= */
function handleSignedOut() {
  console.log("[Login] Signed out.");

  userBadge?.classList.add("hidden");
  logoutBtn?.classList.add("hidden");

  profileSection?.classList.add("hidden");
  loginSection?.classList.remove("hidden");

  if (loginEmailInput) loginEmailInput.value = "";
}

/* =============================================================
   LOGOUT BUTTON
============================================================= */
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  handleSignedOut();
});
