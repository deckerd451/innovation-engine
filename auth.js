// ================================================================
// CharlestonHacks Innovation Engine — AUTH CONTROLLER (ROOT)
// File: /auth.js
// ================================================================
// OAuth-safe auth flow for GitHub Pages + Supabase.
//
// Improvements vs prior version:
// ✅ NO Supabase client recreation during retries (prevents lock AbortError cascades)
// ✅ NO stopAutoRefresh() during boot (avoids half-disabled auth state)
// ✅ Single-flight init + single auth subscription guard
// ✅ One cleanOAuthUrlSoon() (duplicate removed)
// ✅ AbortError handling = backoff + retry getSession only
// ✅ Exposes window.__authReady for other modules (ecosystem, session restoration, synapse init)
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
//
// Based on your current auth controller file: :contentReference[oaicite:0]{index=0}

/* global window, document */

(() => {
  "use strict";

  const GUARD = "__CH_IE_AUTH_V5__";
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

  const isAbortError = (e) =>
    e?.name === "AbortError" ||
    String(e?.message || "").includes("signal is aborted") ||
    String(e?.message || "").toLowerCase().includes("aborted");

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

  let hasBootstrappedThisLoad = false;
  let sessionTimer = null;

  // Auth subscription guard
  let authSubAttached = false;
  let authUnsub = null;

  // Signal to other modules that initial auth decision is done
  window.__authReady = false;

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

    if (githubBtn && !githubBtn.dataset.bound) {
      githubBtn.addEventListener("click", () => oauthLogin("github"));
      githubBtn.dataset.bound = "1";
    }

    if (googleBtn && !googleBtn.dataset.bound) {
      googleBtn.addEventListener("click", () => oauthLogin("google"));
      googleBtn.dataset.bound = "1";
    }

    loginDOMReady = true;
    log("🎨 Login DOM setup complete (OAuth mode)");
  }

  function cancelSessionTimer() {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
  }

  function markAuthReadyOnce() {
    if (window.__authReady) return;
    window.__authReady = true;
    window.dispatchEvent(new CustomEvent("auth-ready", { detail: {} }));
  }

  function showLoginUI() {
    // never let login UI override an already-booted app
    if (hasBootstrappedThisLoad) {
      warn("🟡 showLoginUI ignored (app already bootstrapped).");
      markAuthReadyOnce();
      return;
    }

    loginSection?.classList.remove("hidden");
    loginSection?.classList.add("active-tab-pane");

    mainHeader?.classList.add("hidden");
    mainContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
    setHint("Continue with GitHub or Google.");
    log("🔒 Showing login UI");

    markAuthReadyOnce();
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
    markAuthReadyOnce();
  }

  function showProfileLoading(user) {
    log("👤 Loading profile for:", user?.email);
  }

  function hideProfileLoading() {
    // no-op
  }

  // -----------------------------
  // OAuth URL cleanup
  // -----------------------------
  // Immediate cleanup for ?code / ?error to break login loops (safe to do before session)
  function cleanOAuthUrlNow() {
    const url = new URL(window.location.href);
    const hasOAuthCode = url.searchParams.has("code");
    const hasOAuthError = url.searchParams.has("error");

    if (hasOAuthCode || hasOAuthError) {
      log("🧹 Immediately cleaning OAuth URL to break login loop…");
      window.history.replaceState({}, document.title, url.pathname);
      return true;
    }
    return false;
  }

  // Clean OAuth hash (access_token etc.) AFTER auth had a chance to parse it
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
  function withTimeout(promise, timeoutMs, label = "Timeout") {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} after ${Math.floor(timeoutMs / 1000)}s`)), timeoutMs)
      ),
    ]);
  }

  async function fetchUserProfile(user) {
    log("🔍 Fetching profile for user_id:", user.id);

    const { data, error } = await withTimeout(
      window.supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .limit(1),
      15000,
      "Database query timeout"
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

    cancelSessionTimer();
    cleanOAuthUrlSoon();
    showAppUI(user);

    // Load profile, then let synapse init (event driven + safe fallback)
    setTimeout(async () => {
      try {
        await withTimeout(loadUserProfileOnce(user), 10000, "Profile load timeout");
      } catch (e) {
        err("❌ Profile loading failed:", e);
        setTimeout(() => emitProfileNew(user), 10);
      } finally {
        setTimeout(() => {
          if (typeof window.ensureSynapseInitialized === "function") {
            window.ensureSynapseInitialized();
          }
        }, 500);
      }
    }, 100);
  }

  // -----------------------------
  // Core init
  // -----------------------------
  async function waitForSupabase(maxMs = 3000) {
    const start = Date.now();
    while (!window.supabase) {
      if (Date.now() - start > maxMs) return false;
      await sleep(50);
    }
    return true;
  }

  function attachAuthSubscriptionOnce() {
    if (authSubAttached) return;
    if (!window.supabase?.auth?.onAuthStateChange) return;

    authSubAttached = true;

    const { data: sub } = window.supabase.auth.onAuthStateChange(
      async (event, session) => {
        log("⚡ Auth event:", event);

        if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
          cancelSessionTimer();
          cleanOAuthUrlSoon();
          await bootstrapForUser(session.user, event);
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
          // Useful log only
          log("🔄 Token refreshed");
        }
      }
    );

    authUnsub = sub?.subscription?.unsubscribe
      ? () => sub.subscription.unsubscribe()
      : null;

    window.__CH_IE_AUTH_UNSUB__ = authUnsub;
  }

  async function initLoginSystem() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      log("🚀 Initializing login system (OAuth)…");
      setHint("Checking session…");

      // Early cleanup for OAuth callback query params
      const wasOAuthCallback = cleanOAuthUrlNow();
      if (wasOAuthCallback) {
        log("🔄 OAuth callback detected and cleaned, reloading...");
        setTimeout(() => window.location.reload(), 100);
        return;
      }

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

      // Subscribe FIRST so we can't miss SIGNED_IN / INITIAL_SESSION
      attachAuthSubscriptionOnce();

      // Session timeout fallback (won't override a booted app)
      const SESSION_TIMEOUT_MS = 12000;
      cancelSessionTimer();
      sessionTimer = setTimeout(() => {
        if (hasBootstrappedThisLoad) {
          warn("⏱️ Session timeout fired but app already bootstrapped — ignoring.");
          return;
        }
        warn("⏱️ Session check timed out — showing login UI fallback.");
        showLoginUI();
      }, SESSION_TIMEOUT_MS);

      // Attempt getSession with retries + AbortError backoff
      const maxSessionAttempts = 3;
      for (let attempt = 1; attempt <= maxSessionAttempts; attempt++) {
        try {
          log(`🔍 Attempting to get session (attempt ${attempt}/${maxSessionAttempts})...`);

          const { data, error } = await window.supabase.auth.getSession();
          if (error) throw error;

          // If auth event already booted the app, stop here.
          if (hasBootstrappedThisLoad) {
            cancelSessionTimer();
            log("✅ App already bootstrapped via auth event");
            return;
          }

          const session = data?.session;
          cancelSessionTimer();

          if (session?.user) {
            log("🟢 Already logged in as:", session.user.email);
            cleanOAuthUrlSoon();
            await bootstrapForUser(session.user, "getSession");
            return;
          }

          // No session
          if (attempt === maxSessionAttempts) {
            log("🟡 No active session after all attempts");
            showLoginUI();
            return;
          }

          await sleep(800);
        } catch (e) {
          err(`❌ ERROR in session attempt ${attempt}:`, e);

          // If auth event already booted the app, don’t override it
          if (hasBootstrappedThisLoad) {
            cancelSessionTimer();
            return;
          }

          if (attempt === maxSessionAttempts) {
            cancelSessionTimer();
            showLoginUI();
            return;
          }

          // Backoff: AbortError usually indicates overlapping auth work; wait longer
          await sleep(isAbortError(e) ? 2500 : 1200);
        }
      }
    })();

    return initPromise;
  }

  // Suppress noisy AbortError unhandled rejections
  window.addEventListener("unhandledrejection", (event) => {
    const r = event.reason;
    if (isAbortError(r)) {
      console.warn("⚠️ Suppressed AbortError promise rejection:", r?.message || r);
      event.preventDefault();
    }
  });

  // Diagnostic helpers (non-destructive)
  window.testAuthSystem = async function () {
    console.log("🔍 Testing auth system...");

    try {
      console.log("1. Supabase client:", !!window.supabase);
      console.log("2. Auth client:", !!window.supabase?.auth);

      const { data: userData, error: userError } = await window.supabase.auth.getUser();
      console.log("3. Current user:", userData?.user ? `${userData.user.email} (${userData.user.id})` : "None");
      console.log("4. getUser error:", userError?.message || "None");

      const { data: sessData, error: sessError } = await window.supabase.auth.getSession();
      console.log("5. Current session:", sessData?.session ? "Active" : "None");
      console.log("6. getSession error:", sessError?.message || "None");

      const authKeys = Object.keys(localStorage).filter(
        (k) => k.includes("supabase") || k.includes("sb-") || k.includes("auth")
      );
      console.log("7. Auth localStorage keys:", authKeys);
      console.log("8. __authReady:", window.__authReady);
    } catch (error) {
      console.error("❌ Auth test failed:", error);
    }
  };

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

  log("✅ auth.js loaded (v5) — awaiting main.js to boot");
})();
