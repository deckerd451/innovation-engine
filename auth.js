// ================================================================
// CharlestonHacks Innovation Engine — AUTH CONTROLLER (ROOT)
// File: /auth.js
// ================================================================
// OAuth-safe auth flow for GitHub Pages + Supabase.
//
// Fixes included:
// ✅ Cancels “timeout fallback” when auth succeeds
// ✅ Subscribes to onAuthStateChange BEFORE getSession() (so we never miss SIGNED_IN)
// ✅ If getSession() hangs, auth event still boots the app
// ✅ Hash cleanup ONLY after session exists
//
// Emits:
//  - profile-loaded  { detail: { user, profile } }
//  - profile-new     { detail: { user } }
//  - user-logged-out { detail: {} }
//  - app-ready       { detail: { user } }
//
// Requires (loaded earlier):
//  - window.supabase from /assets/js/supabaseClient.js
//
// NOTE:
// - Does NOT auto-boot by default.
// - Call window.setupLoginDOM() then window.initLoginSystem() from main.js.
// ================================================================

/* global window, document */

(() => {
  "use strict";

  const GUARD = "__CH_IE_AUTH_V4__";
  if (window[GUARD]) {
    console.log("⚠️ auth.js already initialized — skipping duplicate init.");
    return;
  }
  window[GUARD] = true;

  // -----------------------------
  // Helpers
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
  // Internal state
  // -----------------------------
  let loginDOMReady = false;
  let initPromise = null;

  let bootUserId = null; // booted user id for this page load
  let profileLoadPromise = null; // in-flight profile request (single flight)
  let lastAuthEvent = null;

  // Track whether we already successfully booted UI (prevents timeout override)
  let hasBootstrappedThisLoad = false;

  // -----------------------------
  // DOM wiring
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
    // IMPORTANT: never let login UI override an already-booted app
    if (hasBootstrappedThisLoad) {
      warn("🟡 showLoginUI ignored (app already bootstrapped).");
      return;
    }

    loginSection?.classList.remove("hidden");
    loginSection?.classList.add("active-tab-pane");

    mainHeader?.classList.add("hidden");
    mainContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
    setHint("Continue with GitHub or Google.");
    log("🔒 Showing login UI");
  }

  function showAppUI(user) {
    hasBootstrappedThisLoad = true;

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

  function showProfileLoading(user) {
    log("👤 Loading profile for:", user?.email);
  }

  function hideProfileLoading() {
    // no-op
  }

  // Clean OAuth hash ONLY AFTER session exists
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
    window.dispatchEvent(
      new CustomEvent("profile-loaded", { detail: { user, profile } })
    );
  }

  function emitProfileNew(user) {
    window.dispatchEvent(new CustomEvent("profile-new", { detail: { user } }));
  }

  // -----------------------------
  // OAuth login
  // -----------------------------
  async function oauthLogin(provider) {
    log(`🔐 Starting OAuth login with ${provider}…`);

    if (!window.supabase) {
      err("❌ Supabase not available! Cannot login.");
      showNotification("System error. Please refresh and try again.", "error");
      return;
    }

    setHint("Opening provider…");

    // Stable redirect target (align with your app)
    const redirectTo = window.location.origin + "/dashboard.html";

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
  // Logout
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

    bootUserId = null;
    profileLoadPromise = null;
    hasBootstrappedThisLoad = false;

    log("✅ Logged out successfully");
    window.dispatchEvent(new CustomEvent("user-logged-out"));
    showNotification("Logged out successfully", "success");
    showLoginUI();
  };

  // -----------------------------
  // Profile loader (single-flight)
  // -----------------------------
  async function fetchUserProfile(user) {
    log("🔍 Fetching profile for user_id:", user.id);
    
    // Add timeout wrapper
    const withTimeout = (promise, timeoutMs) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Database query timeout after ${timeoutMs/1000}s`)), timeoutMs)
        )
      ]);
    };

    const { data, error } = await withTimeout(
      window.supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .limit(1),
      15000 // 15 second timeout instead of 8
    );

    if (error) {
      err("❌ Database error fetching profile:", error);
      throw error;
    }

    const profile = Array.isArray(data) && data.length ? data[0] : null;
    log("🔍 Profile query result:", profile ? "found" : "not found");

    return profile;
  }

  async function loadUserProfileOnce(user) {
    if (!window.supabase || !user?.id) return null;
    if (profileLoadPromise) return profileLoadPromise;

    profileLoadPromise = (async () => {
      showProfileLoading(user);
      try {
        const profile = await fetchUserProfile(user);

        if (profile) {
          log("📋 Existing profile found:", profile);
          // Expose profile globally for START flow and other modules
          window.currentUserProfile = profile;
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
      } finally {
        hideProfileLoading();
      }
    })();

    return profileLoadPromise;
  }

  // -----------------------------
  // Boot logic (dedupe auth events + ensure synapse loads)
  // -----------------------------
  async function bootstrapForUser(user, sourceEvent = "unknown") {
    if (!user?.id) return;

    if (bootUserId === user.id) {
      log(`🟡 Ignoring duplicate auth bootstrap (${sourceEvent}) for:`, user.email);
      return;
    }

    bootUserId = user.id;
    log(`🟢 Bootstrapping app for user (${sourceEvent}):`, user.email);

    showAppUI(user);

    // Load profile first, then ensure synapse initialization
    setTimeout(async () => {
      try {
        // Add timeout protection to prevent hanging
        const profileLoadTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile load timeout after 10s')), 10000)
        );

        await Promise.race([
          loadUserProfileOnce(user),
          profileLoadTimeout
        ]);
      } catch (error) {
        err("❌ Profile loading failed:", error);
        // Emit profile-new as fallback to allow dashboard to initialize
        log("⚠️ Falling back to new profile creation flow");
        setTimeout(() => emitProfileNew(user), 10);
      }
    }, 100);
  }

  // -----------------------------
  // Core init
  // -----------------------------
  async function waitForSupabase(maxMs = 2500) {
    const start = Date.now();
    while (!window.supabase) {
      if (Date.now() - start > maxMs) return false;
      await sleep(50);
    }
    return true;
  }

  async function initLoginSystem() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      log("🚀 Initializing login system (OAuth)…");
      setHint("Checking session…");

      if (!loginDOMReady) {
        try {
          setupLoginDOM();
        } catch (_) {}
      }

      const ok = await waitForSupabase(3000);
      if (!ok) {
        err("❌ CRITICAL: window.supabase is not available!");
        showLoginUI();
        return;
      }

      // ---- Enhanced timeout with better reliability ----
      const SESSION_TIMEOUT_MS = 12000; // Increased timeout for better reliability

      let sessionTimer = null;
      const cancelSessionTimer = () => {
        if (sessionTimer) {
          clearTimeout(sessionTimer);
          sessionTimer = null;
        }
      };

      sessionTimer = setTimeout(() => {
        // If we already booted due to an auth event, do nothing.
        if (hasBootstrappedThisLoad) {
          warn("⏱️ Session timeout fired but app already bootstrapped — ignoring.");
          return;
        }

        warn("⏱️ Session check timed out — showing login UI fallback.");
        showLoginUI();
      }, SESSION_TIMEOUT_MS);

      // ---- Subscribe FIRST so we can't miss SIGNED_IN ----
      if (!window.__CH_IE_AUTH_UNSUB__ && window.supabase?.auth?.onAuthStateChange) {
        const { data: sub } = window.supabase.auth.onAuthStateChange(
          async (event, session2) => {
            lastAuthEvent = event;
            log("⚡ Auth event:", event);

            if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session2?.user) {
              cancelSessionTimer();
              cleanOAuthUrlSoon();
              await bootstrapForUser(session2.user, event);
              return;
            }

            if (event === "SIGNED_OUT") {
              cancelSessionTimer();
              log("🟡 User signed out");
              bootUserId = null;
              profileLoadPromise = null;
              hasBootstrappedThisLoad = false;
              showLoginUI();
              return;
            }

            if (event === "TOKEN_REFRESHED") {
              log("🔄 Token refreshed");
              return;
            }
          }
        );

        window.__CH_IE_AUTH_UNSUB__ = sub?.subscription?.unsubscribe
          ? () => sub.subscription.unsubscribe()
          : null;
      }

      // ---- Enhanced session fetch with retry logic ----
      let sessionAttempts = 0;
      const maxSessionAttempts = 3;
      
      while (sessionAttempts < maxSessionAttempts) {
        try {
          sessionAttempts++;
          log(`🔍 Attempting to get session (attempt ${sessionAttempts}/${maxSessionAttempts})...`);
          
          const {
            data: { session },
          } = await window.supabase.auth.getSession();

          // If an auth event already booted the app, just stop here.
          if (hasBootstrappedThisLoad) {
            cancelSessionTimer();
            log("✅ App already bootstrapped via auth event");
            return;
          }

          cancelSessionTimer();

          if (session?.user) {
            log("🟢 Already logged in as:", session.user.email);
            cleanOAuthUrlSoon();
            await bootstrapForUser(session.user, "getSession");
            return;
          } else if (sessionAttempts === maxSessionAttempts) {
            log("🟡 No active session after all attempts");
            showLoginUI();
            return;
          } else {
            // Wait before retry
            await sleep(1000);
          }
        } catch (e) {
          err(`❌ ERROR in session attempt ${sessionAttempts}:`, e);
          
          if (sessionAttempts === maxSessionAttempts) {
            cancelSessionTimer();
            // If we already booted via auth event, don't override.
            if (!hasBootstrappedThisLoad) showLoginUI();
            return;
          } else {
            // Wait before retry
            await sleep(1500);
          }
        }
      }
    })();

    return initPromise;
  }

  // Export to window (legacy callers)
  window.setupLoginDOM = setupLoginDOM;
  window.initLoginSystem = initLoginSystem;

  // Optional autostart flag
  const autostart = !!window.__CH_IE_AUTH_AUTOBOOT__;

  const boot = async () => {
    const run = () => {
      setupLoginDOM();
      initLoginSystem();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  if (autostart) boot();

  log("✅ auth.js loaded (v4) — awaiting main.js to boot");
})();

// ================================================================
// GLOBAL ERROR HANDLERS
// ================================================================
window.addEventListener('error', (event) => {
  console.error('❌ Uncaught error:', event.error);
  // Optional: Send to error tracking service
  // trackError(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled promise rejection:', event.reason);
  // Optional: Send to error tracking service
  // trackError(event.reason);
});
