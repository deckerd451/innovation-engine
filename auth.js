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
// ✅ AbortError handling = backoff + retry getSession only (no destructive loops)
// ✅ Exposes window.__authReady for other modules (ecosystem, session restoration, synapse init)
// ✅ No silent failures: visible authError UI + console logging
//
// Emits:
//  - profile-loaded  { detail: { user, profile } }
//  - profile-new     { detail: { user } }
//  - user-logged-out { detail: {} }
//  - app-ready       { detail: { user } }
//  - auth-ready      { detail: {} }
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
    // Keep lightweight; your app also has a global notifier elsewhere
    log(`[${String(type).toUpperCase()}] ${message}`);
    if (typeof window.showNotification === "function") {
      try {
        window.showNotification(message, type);
      } catch (_) {}
    }
  }

  function ensureAuthErrorEl() {
    // Prefer existing authError element if present, otherwise create one under login hint.
    let el = $("authError");
    if (el) return el;

    const hint = $("login-hint");
    if (!hint?.parentElement) return null;

    el = document.createElement("div");
    el.id = "authError";
    el.style.display = "none";
    el.style.marginTop = "10px";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.border = "1px solid rgba(255, 107, 107, 0.45)";
    el.style.background = "rgba(255, 107, 107, 0.08)";
    el.style.color = "#ff6b6b";
    el.style.fontSize = "0.95rem";
    el.style.lineHeight = "1.3";
    hint.parentElement.appendChild(el);
    return el;
  }

  function clearAuthError() {
    const el = ensureAuthErrorEl();
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
  }

  function showAuthError(message, type = "error") {
    const msg = message || "Login failed.";
    if (type === "error") {
      err("[AUTH] " + msg);
    } else {
      log("[AUTH] " + msg);
    }
    const el = ensureAuthErrorEl();
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
      el.style.color = type === "success" ? "#4caf50" : "#ff6b6b";
    } else {
      // ultra-safe fallback
      try {
        alert(msg);
      } catch (_) {}
    }
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

    // Ensure non-silent error UI exists when login UI is rendered
    ensureAuthErrorEl();

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

  let loginUIShown = false; // single-owner: only render login UI once per page load

  function showLoginUI() {
    // never let login UI override an already-booted app
    if (hasBootstrappedThisLoad) {
      warn("🟡 showLoginUI ignored (app already bootstrapped).");
      markAuthReadyOnce();
      return;
    }

    // Single-owner: only render login UI once
    if (loginUIShown) {
      warn("🟡 showLoginUI ignored (already shown).");
      markAuthReadyOnce();
      return;
    }
    loginUIShown = true;

    loginSection?.classList.remove("hidden");
    loginSection?.classList.add("active-tab-pane");

    mainHeader?.classList.add("hidden");
    mainContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
    setHint("Continue with GitHub or Google to get started.");
    clearAuthError();
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
      showAuthError("System error. Please refresh and try again.");
      return;
    }

    clearAuthError();
    setHint("Opening provider…");

    // Stable redirect target (align with your app)
    const redirectTo = window.location.origin + "/index.html";

    const { error } = await window.supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      err("❌ OAuth error:", error);
      setHint("Login failed. Try again.");
      showNotification("Login failed. Please try again.", "error");
      showAuthError(error.message || "OAuth login failed.");
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
        setTimeout(
          () => reject(new Error(`${label} after ${Math.floor(timeoutMs / 1000)}s`)),
          timeoutMs
        )
      ),
    ]);
  }

  async function fetchUserProfile(user) {
    const uid = user.id;
    const emailNorm = user.email ? user.email.toLowerCase().trim() : null;

    log(
      "🔍 [PROFILE-LINK] Starting profile resolution for uid:",
      uid,
      "email:",
      emailNorm
    );

    // ============================================================
    // STEP 1: Try to find profile by user_id (primary lookup)
    // ============================================================
    const { data: uidData, error: uidError } = await withTimeout(
      window.supabase.from("community").select("*").eq("user_id", uid).limit(1),
      15000,
      "Database query timeout"
    );

    if (uidError) {
      err("❌ [PROFILE-LINK] Database error fetching profile by user_id:", uidError);
      throw uidError;
    }

    if (uidData && uidData.length > 0) {
      const profile = uidData[0];
      log("✅ [PROFILE-LINK] found-by-uid:", profile.id, "email:", profile.email);
      return profile;
    }

    log("🔍 [PROFILE-LINK] No profile found by user_id, proceeding to email lookup");

    // ============================================================
    // STEP 2: Link by email (handle migrated profiles)
    // ============================================================
    if (!emailNorm) {
      log("⚠️ [PROFILE-LINK] No email available, cannot link by email");
      return null;
    }

    const { data: emailMatches, error: emailError } = await withTimeout(
      window.supabase
        .from("community")
        .select("*")
        .ilike("email", emailNorm)
        .order("created_at", { ascending: true, nullsLast: true }),
      15000,
      "Email lookup timeout"
    );

    if (emailError) {
      err("❌ [PROFILE-LINK] Error looking up profiles by email:", emailError);
      throw emailError;
    }

    if (!emailMatches || emailMatches.length === 0) {
      log("🔍 [PROFILE-LINK] No existing profiles found for email:", emailNorm);
      return null;
    }

    log(
      `🔍 [PROFILE-LINK] Found ${emailMatches.length} profile(s) with email:`,
      emailNorm
    );

    // ============================================================
    // CASE A: Exactly one profile with this email
    // ============================================================
    if (emailMatches.length === 1) {
      const row = emailMatches[0];

      // migrated profile - link it
      if (!row.user_id) {
        log("🔗 [PROFILE-LINK] Linking migrated profile (user_id=NULL) to user:", row.id);

        const { data: updatedData, error: updateError } = await window.supabase
          .from("community")
          .update({
            user_id: uid,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select()
          .single();

        if (updateError) {
          err("❌ [PROFILE-LINK] Failed to link migrated profile:", updateError);
          return null;
        }

        log("✅ [PROFILE-LINK] linked-by-email: Successfully linked profile", row.id, "to uid:", uid);

        setTimeout(() => {
          if (typeof window.showNotification === "function") {
            window.showNotification(
              "Welcome back! Your existing profile has been linked to your account.",
              "success"
            );
          }
        }, 1000);

        return updatedData;
      }

      // collision: already linked to different user_id
      if (row.user_id !== uid) {
        err(
          "⚠️ [PROFILE-LINK] duplicate-email-collision: Profile",
          row.id,
          "already linked to different user_id:",
          row.user_id
        );
        return row;
      }

      log("✅ [PROFILE-LINK] Profile already linked to this uid:", row.id);
      return row;
    }

    // ============================================================
    // CASE B: Multiple profiles with same email (duplicates)
    // ============================================================
    log(
      "⚠️ [PROFILE-LINK] duplicate-email-detected: Found",
      emailMatches.length,
      "profiles for email:",
      emailNorm
    );

    // Choose canonical profile:
    // 1) completed flags, else 2) oldest created_at (already sorted)
    let canonical = null;
    for (const row of emailMatches) {
      if (row.profile_completed === true || row.onboarding_completed === true) {
        canonical = row;
        log("🎯 [PROFILE-LINK] Selected canonical (completed):", row.id);
        break;
      }
    }
    if (!canonical) {
      canonical = emailMatches[0];
      log("🎯 [PROFILE-LINK] Selected canonical (oldest):", canonical.id, "created_at:", canonical.created_at);
    }

    // If uid is currently on a non-canonical row, clear it
    const uidRow = emailMatches.find((r) => r.user_id === uid);
    if (uidRow && uidRow.id !== canonical.id) {
      log(
        "🔄 [PROFILE-LINK] rehomed-uid: uid",
        uid,
        "currently on non-canonical profile",
        uidRow.id,
        "- rehoming to canonical",
        canonical.id
      );
      try {
        const { error: clearError } = await window.supabase
          .from("community")
          .update({
            user_id: null,
            is_hidden: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uidRow.id);

        if (clearError) {
          err("❌ [PROFILE-LINK] Failed to clear old uid link:", clearError);
        } else {
          log("✅ [PROFILE-LINK] Cleared uid from non-canonical profile:", uidRow.id);
        }
      } catch (e) {
        err("❌ [PROFILE-LINK] Exception during rehome clear:", e);
      }
    }

    // Link canonical to this uid
    if (!canonical.user_id) {
      log("🔗 [PROFILE-LINK] Linking canonical profile", canonical.id, "to uid:", uid);

      const { data: updatedCanonical, error: updateError } = await window.supabase
        .from("community")
        .update({
          user_id: uid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", canonical.id)
        .select()
        .single();

      if (updateError) {
        err("❌ [PROFILE-LINK] Failed to link canonical profile:", updateError);
        return canonical;
      }
      canonical = updatedCanonical;
      log("✅ [PROFILE-LINK] Successfully linked canonical profile to uid:", uid);
    } else if (canonical.user_id !== uid) {
      err(
        "⚠️ [PROFILE-LINK] duplicate-email-collision: Canonical profile",
        canonical.id,
        "already linked to different uid:",
        canonical.user_id
      );
      return canonical;
    }

    // Hide non-canonical duplicates
    const nonCanonicalIds = emailMatches
      .filter((r) => r.id !== canonical.id)
      .map((r) => r.id);

    if (nonCanonicalIds.length > 0) {
      log("🗑️ [PROFILE-LINK] Hiding", nonCanonicalIds.length, "non-canonical duplicate profile(s):", nonCanonicalIds);

      const { error: hideError } = await window.supabase
        .from("community")
        .update({
          is_hidden: true,
          updated_at: new Date().toISOString(),
        })
        .in("id", nonCanonicalIds);

      if (hideError) {
        err("❌ [PROFILE-LINK] Failed to hide non-canonical profiles:", hideError);
      } else {
        log("✅ [PROFILE-LINK] Successfully hid non-canonical profiles");
      }
    }

    setTimeout(() => {
      if (typeof window.showNotification === "function") {
        window.showNotification(
          "Welcome back! We've consolidated your duplicate profiles.",
          "success"
        );
      }
    }, 1000);

    return canonical;
  }

  async function loadUserProfileOnce(user) {
    if (!window.supabase || !user?.id) return null;
    if (profileLoadPromise) return profileLoadPromise;

    profileLoadPromise = (async () => {
      showProfileLoading(user);
      try {
        let profile = await fetchUserProfile(user);

        // ============================================================
        // STEP 3: Create new profile if no match found
        // ============================================================
        if (!profile) {
          log(
            "🆕 [PROFILE-LINK] created-new: No existing profile found, creating new profile for uid:",
            user.id
          );

          const newProfile = {
            user_id: user.id,
            email: user.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            onboarding_completed: false,
            profile_completed: false,
            is_hidden: false,
          };

          const { data: insertedProfile, error: insertError } = await window.supabase
            .from("community")
            .insert([newProfile])
            .select()
            .single();

          if (insertError) {
            err("❌ [PROFILE-LINK] Failed to create new profile:", insertError);
            setTimeout(() => emitProfileNew(user), 10);
            return null;
          }

          profile = insertedProfile;
          log("✅ [PROFILE-LINK] Successfully created new profile:", profile.id);
        }

        // ============================================================
        // Enforce onboarding if needed
        // ============================================================
        const needsOnboarding = !profile.onboarding_completed || !profile.profile_completed || !profile.name;

        if (needsOnboarding) {
          log("⚠️ [PROFILE-LINK] onboarding-forced: Profile", profile.id, "requires onboarding");
          log("   - onboarding_completed:", profile.onboarding_completed);
          log("   - profile_completed:", profile.profile_completed);
          log("   - name:", !!profile.name);
          profile._needsOnboarding = true;
        }

        log("📋 [PROFILE-LINK] Profile resolution complete:", profile.id);
        window.currentUserProfile = profile;
        setTimeout(() => emitProfileLoaded(user, profile), 10);
        return profile;
      } catch (e) {
        err("❌ [PROFILE-LINK] Exception loading profile:", e);
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

    // Set global user and emit authenticated-user event for other modules
    window.currentAuthUser = user;
    window.dispatchEvent(new CustomEvent("authenticated-user", { detail: { user } }));

    showAppUI(user);

    setTimeout(async () => {
      try {
        await withTimeout(loadUserProfileOnce(user), 10000, "Profile load timeout");
      } catch (e) {
        err("❌ Profile loading failed:", e);
        setTimeout(() => emitProfileNew(user), 10);
      } finally {
        setTimeout(() => {
          // Unified network handles visualization init via profile-loaded event
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
    log("📡 Setting up onAuthStateChange listener...");

    const { data: sub } = window.supabase.auth.onAuthStateChange(async (event, session) => {
      log(
        "⚡ Auth event received:",
        event,
        session?.user ? `user: ${session.user.email}` : "no user"
      );

      // INITIAL_SESSION with no user means user is logged out
      if (event === "INITIAL_SESSION" && !session?.user) {
        log("🟡 INITIAL_SESSION received - no active session");
        cancelSessionTimer();
        showLoginUI();
        markAuthReadyOnce();
        return;
      }

      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
        cancelSessionTimer();
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
        log("🔄 Token refreshed");
      }
    });

    authUnsub = sub?.subscription?.unsubscribe ? () => sub.subscription.unsubscribe() : null;
    window.__CH_IE_AUTH_UNSUB__ = authUnsub;
    log("✅ onAuthStateChange listener attached");
  }

  async function initLoginSystem() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      log("🚀 Initializing login system (OAuth)…");
      setHint("Checking session…");
      clearAuthError();

      const ok = await waitForSupabase(3000);
      if (!ok) {
        err("❌ CRITICAL: window.supabase is not available!");
        showLoginUI();
        return;
      }

      // Handle OAuth callback (code exchange) if present
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        log("🔄 OAuth callback detected, exchanging code for session...");
        try {
          await window.supabase.auth.exchangeCodeForSession(code);
          log("✅ Code exchanged successfully");
          cleanOAuthUrlNow();
          setTimeout(() => window.location.reload(), 100);
          return;
        } catch (e) {
          err("❌ Failed to exchange code:", e);
          cleanOAuthUrlNow();
          // Continue to show login UI if session isn't present
        }
      }

      // Clean any OAuth error params
      if (url.searchParams.has("error")) {
        cleanOAuthUrlNow();
      }

      if (!loginDOMReady) {
        try {
          setupLoginDOM();
        } catch (_) {}
      }

      // Subscribe to auth changes for future events
      attachAuthSubscriptionOnce();

      // Give Supabase a moment to finish any internal initialization
      await sleep(100);

      // Manual session check once (avoid unreliable INITIAL_SESSION in some environments)
      try {
        log("🔍 Checking initial session state...");
        const { data, error } = await Promise.race([
          window.supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Session check timeout")), 3000)),
        ]);

        if (hasBootstrappedThisLoad) {
          log("✅ App already bootstrapped via auth event");
          return;
        }

        if (error) throw error;

        const session = data?.session;
        if (session?.user) {
          log("🟢 Already logged in as:", session.user.email);
          await bootstrapForUser(session.user, "getSession");
        } else {
          log("🟡 No active session");
          showLoginUI();
        }
      } catch (e) {
        err("❌ Session check failed:", e);
        if (!hasBootstrappedThisLoad) {
          showLoginUI();
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
      console.log(
        "3. Current user:",
        userData?.user ? `${userData.user.email} (${userData.user.id})` : "None"
      );
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
