// ================================================================
// CharlestonHacks Innovation Engine — AUTH CONTROLLER (ROOT)
// File: /auth.js
// ================================================================
// Race-safe auth flow for GitHub Pages + Supabase OAuth.
//
// Guarantees:
// - Only ONE auth controller instance (global guard).
// - Only ONE onAuthStateChange subscription (ever).
// - Timeout fallback NEVER overrides a confirmed SIGNED_IN.
// - UI never hangs on "Checking session..." (timeout fallback).
//
// Emits canonical events:
//  - profile-loaded  { detail: { user, profile } }
//  - profile-new     { detail: { user } }
//  - user-logged-out { detail: {} }
//  - app-ready       { detail: { user } }
//
// Requires (loaded earlier):
//  - window.supabase from /assets/js/supabaseClient.js
//
// NOTE:
// - This file does NOT auto-boot by default.
// - Call window.setupLoginDOM() then window.initLoginSystem() from main.js.
// ================================================================

(() => {
  "use strict";

  const GUARD = "__CH_IE_AUTH_V3__";
  if (window[GUARD]) {
    console.log("⚠️ auth.js already initialized — skipping duplicate init.");
    return;
  }
  window[GUARD] = true;

  // -----------------------------
  // Tiny helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const log = (...args) => console.log(...args);
  const warn = (...args) => console.warn(...args);
  const err = (...args) => console.error(...args);

  function setHint(msg) {
    const hint = $("login-hint");
    if (hint) hint.textContent = msg || "";
  }

  function showNotification(message, type = "info") {
    log(`[${String(type).toUpperCase()}] ${message}`);
  }

  // -----------------------------
  // DOM refs
  // -----------------------------
  let loginSection, mainContent, mainHeader;
  let githubBtn, googleBtn;

  // -----------------------------
  // Internal state (race prevention)
  // -----------------------------
  let loginDOMReady = false;
  let initPromise = null;

  let authSubReady = false;
  let hasConfirmedSignedIn = false;
  let hasRenderedAppUI = false;
  let activeSessionCheckTimer = null;

  // -----------------------------
  // DOM Setup (idempotent)
  // -----------------------------
  function setupLoginDOM() {
    loginSection = $("login-section");
    mainContent = $("main-content");
    mainHeader = $("main-header");

    githubBtn = $("github-login");
    googleBtn = $("google-login");

    if (!loginSection || !mainContent) {
      err("❌ login-section or main-content not found in DOM");
      return;
    }

    if (!githubBtn?.dataset.bound) {
      githubBtn?.addEventListener("click", () => oauthLogin("github"));
      if (githubBtn) githubBtn.dataset.bound = "1";
    }

    if (!googleBtn?.dataset.bound) {
      googleBtn?.addEventListener("click", () => oauthLogin("google"));
      if (googleBtn) googleBtn.dataset.bound = "1";
    }

    loginDOMReady = true;
    log("🎨 Login DOM setup complete (OAuth mode)");
  }

  function showLoginUI() {
    // IMPORTANT: never override a confirmed SIGNED_IN state
    if (hasConfirmedSignedIn || hasRenderedAppUI) return;

    loginSection?.classList.remove("hidden");
    loginSection?.classList.add("active-tab-pane");

    mainHeader?.classList.add("hidden");
    mainContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
    setHint("Continue with GitHub or Google.");
    log("🔒 Showing login UI");
  }

  function showAppUI(user) {
    hasRenderedAppUI = true;

    loginSection?.classList.add("hidden");
    loginSection?.classList.remove("active-tab-pane");

    mainHeader?.classList.remove("hidden");
    mainContent?.classList.remove("hidden");

    document.body.style.overflow = "auto";

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("app-ready", { detail: { user } }));
    }, 50);

    log("✅ Showing app UI for:", user?.email);
  }

  function cleanOAuthUrlSoon() {
    const url = new URL(window.location.href);
    const hasOAuthHash =
      !!url.hash &&
      (url.hash.includes("access_token") ||
        url.hash.includes("refresh_token") ||
        url.hash.includes("expires_in") ||
        url.hash.includes("token_type") ||
        url.hash.includes("error"));

    if (!hasOAuthHash) return;

    setTimeout(() => {
      log("🧹 Cleaning OAuth URL hash…");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }, 800);
  }

  // -----------------------------
  // Events
  // -----------------------------
  function emitProfileLoaded(user, profile) {
    window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile } }));
  }
  function emitProfileNew(user) {
    window.dispatchEvent(new CustomEvent("profile-new", { detail: { user } }));
  }

  // -----------------------------
  // OAuth
  // -----------------------------
  async function oauthLogin(provider) {
    log(`🔐 Starting OAuth login with ${provider}…`);
    if (!window.supabase) {
      err("❌ Supabase not available! Cannot login.");
      showNotification("System error. Please refresh and try again.", "error");
      return;
    }

    setHint("Opening provider…");

    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await window.supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      err("❌ OAuth error:", error);
      setHint("Login failed. Try again.");
      showNotification("Login failed. Please try again.", "error");
    }
  }

  // -----------------------------
  // Logout (used by UI)
  // -----------------------------
  window.handleLogout = async function handleLogout() {
    log("👋 Logging out…");
    if (!window.supabase) {
      err("❌ Supabase not available!");
      return;
    }

    const { error } = await window.supabase.auth.signOut();
    if (error) {
      err("❌ Logout error:", error);
      showNotification("Logout failed. Please try again.", "error");
      return;
    }

    log("✅ Logged out successfully");
    hasConfirmedSignedIn = false;
    hasRenderedAppUI = false;

    window.dispatchEvent(new CustomEvent("user-logged-out"));
    showNotification("Logged out successfully", "success");
    showLoginUI();
  };

  // -----------------------------
  // Profile loader
  // -----------------------------
  async function loadUserProfile(user) {
    log("👤 Loading profile for:", user?.email);
    if (!window.supabase || !user?.id) return null;

    try {
      const { data, error } = await window.supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .limit(1);

      if (error) {
        err("❌ Error fetching profile:", error);
        setTimeout(() => emitProfileNew(user), 10);
        return null;
      }

      const profile = Array.isArray(data) && data.length ? data[0] : null;

      if (profile) {
        log("📋 Existing profile found:", profile);
        setTimeout(() => emitProfileLoaded(user, profile), 10);
        return profile;
      }

      log("🆕 New user — no profile row");
      setTimeout(() => emitProfileNew(user), 10);
      return null;
    } catch (e) {
      err("❌ Exception loading profile:", e);
      setTimeout(() => emitProfileNew(user), 10);
      return null;
    }
  }

  // -----------------------------
  // Core init (race-safe)
  // -----------------------------
  async function waitForSupabase(maxMs = 3000) {
    const start = Date.now();
    while (!window.supabase) {
      if (Date.now() - start > maxMs) return false;
      await sleep(50);
    }
    return true;
  }

  function clearSessionTimer() {
    if (activeSessionCheckTimer) {
      clearTimeout(activeSessionCheckTimer);
      activeSessionCheckTimer = null;
    }
  }

  function ensureAuthSubscription() {
    if (authSubReady) return;
    if (!window.supabase?.auth?.onAuthStateChange) return;

    // Subscribe ONCE and as early as possible
    const { data: sub } = window.supabase.auth.onAuthStateChange(async (event, session) => {
      log("⚡ Auth event:", event);

      if (event === "SIGNED_IN" && session?.user) {
        hasConfirmedSignedIn = true;
        clearSessionTimer();

        // Always force app UI if signed in (even if fallback login UI was shown)
        showAppUI(session.user);
        setTimeout(() => loadUserProfile(session.user), 100);
      }

      if (event === "SIGNED_OUT") {
        clearSessionTimer();
        hasConfirmedSignedIn = false;
        hasRenderedAppUI = false;
        showLoginUI();
      }
    });

    window.__CH_IE_AUTH_UNSUB__ = sub?.subscription?.unsubscribe
      ? () => sub.subscription.unsubscribe()
      : null;

    authSubReady = true;
  }

  async function initLoginSystem() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      log("🚀 Initializing login system (OAuth)…");
      setHint("Checking session…");

      if (!loginDOMReady) {
        try { setupLoginDOM(); } catch (_) {}
      }

      const ok = await waitForSupabase(3000);
      if (!ok) {
        err("❌ CRITICAL: window.supabase is not available!");
        showLoginUI();
        return;
      }

      cleanOAuthUrlSoon();

      // SUBSCRIBE FIRST (this is the key fix)
      ensureAuthSubscription();

      // Timeout fallback: only show login if we still have NOT confirmed SIGNED_IN
      const SESSION_TIMEOUT_MS = 6000; // slightly more forgiving; still finite
      clearSessionTimer();
      activeSessionCheckTimer = setTimeout(() => {
        activeSessionCheckTimer = null;
        if (!hasConfirmedSignedIn && !hasRenderedAppUI) {
          warn("⏱️ Session check timed out — showing login UI fallback.");
          showLoginUI();
        }
      }, SESSION_TIMEOUT_MS);

      try {
        // If getSession is slow, the SIGNED_IN event can still win now.
        const { data: { session } } = await window.supabase.auth.getSession();

        // Don’t let this override a confirmed SIGNED_IN that already rendered UI
        if (hasConfirmedSignedIn || hasRenderedAppUI) return;

        clearSessionTimer();

        if (session?.user) {
          hasConfirmedSignedIn = true;
          log("🟢 Already logged in as:", session.user.email);
          showAppUI(session.user);
          setTimeout(() => loadUserProfile(session.user), 100);
        } else {
          log("🟡 No active session");
          showLoginUI();
        }
      } catch (e) {
        clearSessionTimer();
        err("❌ ERROR in initLoginSystem:", e);
        showLoginUI();
      }
    })();

    return initPromise;
  }

  // Export to window
  window.setupLoginDOM = setupLoginDOM;
  window.initLoginSystem = initLoginSystem;

  log("✅ auth.js loaded (v3) — awaiting main.js to boot");
})();
