// ================================================================
// CharlestonHacks Innovation Engine — AUTH CONTROLLER (ROOT)
// File: /auth.js
// ================================================================
// Opinionated, race-safe auth flow for GitHub Pages + Supabase OAuth.
//
// Guarantees:
// - Only ONE auth controller instance (global guard).
// - Only ONE onAuthStateChange subscription.
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
// NOTE (important):
// - This file NO LONGER auto-boots by default.
// - Call window.setupLoginDOM() then window.initLoginSystem() from main.js.
// ================================================================

/* global window, document */

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
    // You can later swap this with your globals.js toast system.
    log(`[${String(type).toUpperCase()}] ${message}`);
  }

  // -----------------------------
  // DOM refs
  // -----------------------------
  let loginSection, mainContent, mainHeader;
  let githubBtn, googleBtn;

  // -----------------------------
  // Internal state (prevents races)
  // -----------------------------
  let domReady = false;
  let loginDOMReady = false;
  let initPromise = null; // makes initLoginSystem idempotent

  function setupLoginDOM() {
    // Safe to call repeatedly
    loginSection = $("login-section");
    mainContent = $("main-content");
    mainHeader = $("main-header");

    githubBtn = $("github-login");
    googleBtn = $("google-login");

    if (!loginSection || !mainContent) {
      err("❌ login-section or main-content not found in DOM");
      return;
    }

    // Bind only once
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
    loginSection?.classList.remove("hidden");
    loginSection?.classList.add("active-tab-pane");

    mainHeader?.classList.add("hidden");
    mainContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
    setHint("Continue with GitHub or Google.");
    log("🔒 Showing login UI");
  }

  function showAppUI(user) {
    loginSection?.classList.add("hidden");
    loginSection?.classList.remove("active-tab-pane");

    mainHeader?.classList.remove("hidden");
    mainContent?.classList.remove("hidden");

    document.body.style.overflow = "auto";

    // Fire "app-ready" after UI is visible; onboarding can use this safely.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("app-ready", { detail: { user } }));
    }, 50);

    log("✅ Showing app UI for:", user?.email);
  }

  function cleanOAuthUrlSoon() {
    // Supabase OAuth returns tokens in hash; clean it after it processes.
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
  async function waitForSupabase(maxMs = 2500) {
    const start = Date.now();
    while (!window.supabase) {
      if (Date.now() - start > maxMs) return false;
      await sleep(50);
    }
    return true;
  }

  async function initLoginSystem() {
    // Idempotent: if called twice, return the same promise and do nothing extra.
    if (initPromise) return initPromise;

    initPromise = (async () => {
      log("🚀 Initializing login system (OAuth)…");
      setHint("Checking session…");

      // If someone forgot to call setupLoginDOM, try once, safely.
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

      // Hard timeout guard: never hang on spinner.
      const SESSION_TIMEOUT_MS = 3500;
      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        warn("⏱️ Session check timed out — showing login UI fallback.");
        showLoginUI();
      }, SESSION_TIMEOUT_MS);

      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        clearTimeout(t);

        if (timedOut) return;

        if (session?.user) {
          log("🟢 Already logged in as:", session.user.email);
          showAppUI(session.user);
          // Load profile after UI is visible
          setTimeout(() => loadUserProfile(session.user), 100);
        } else {
          log("🟡 No active session");
          showLoginUI();
        }
      } catch (e) {
        clearTimeout(t);
        err("❌ ERROR in initLoginSystem:", e);
        showLoginUI();
      }

      // Subscribe once (ever)
      if (!window.__CH_IE_AUTH_UNSUB__ && window.supabase?.auth?.onAuthStateChange) {
        const { data: sub } = window.supabase.auth.onAuthStateChange(async (event, session2) => {
          log("⚡ Auth event:", event);

          if (event === "SIGNED_IN" && session2?.user) {
            log("🟢 User authenticated:", session2.user.email);
            showAppUI(session2.user);
            setTimeout(() => loadUserProfile(session2.user), 100);
          }

          if (event === "SIGNED_OUT") {
            log("🟡 User signed out");
            showLoginUI();
          }
        });

        // store unsubscribe
        window.__CH_IE_AUTH_UNSUB__ = sub?.subscription?.unsubscribe
          ? () => sub.subscription.unsubscribe()
          : null;
      }
    })();

    return initPromise;
  }

  // Export to window (legacy callers)
  window.setupLoginDOM = setupLoginDOM;
  window.initLoginSystem = initLoginSystem;

  // Optional: if you ever want to re-enable auto-boot, set:
  // window.__CH_IE_AUTH_AUTOBOOT__ = true; BEFORE this script runs.
  // (Main.js should be the coordinator, so default is false.)
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

  log("✅ auth.js loaded (v3) — awaiting main.js to boot");
})();
