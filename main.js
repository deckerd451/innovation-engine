// ================================================================
// MAIN ENTRY POINT (Hardened)
// ================================================================
// Coordinates auth.js, profile.js, dashboardPane.js, and system integrations.
// Goal: reduce flakiness + startup cost by preventing duplicate init,
// avoiding missed events, and making logger fallback safe.

// ------------------------------
// Safe logger shim (prevents boot crashes when window.log isn't ready)
// ------------------------------
const log =
  window.log ??
  {
    moduleLoad: () => {},
    once: (_k, ...a) => console.warn(...a),
    info: (...a) => console.info(...a),
    debug: (...a) => console.debug(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
  };

log.moduleLoad("main.js");
log.info("🚀 CharlestonHacks Innovation Engine starting...");

// ------------------------------
// Global guards (per-system)
// ------------------------------
window.__IE_MAIN_INIT_DONE__ = window.__IE_MAIN_INIT_DONE__ || false;
window.__IE_PROFILE_HANDLER_ATTACHED__ = window.__IE_PROFILE_HANDLER_ATTACHED__ || false;

window.__IE_UNIFIED_INIT__ = window.__IE_UNIFIED_INIT__ || false;
window.__IE_SYNAPSE_BRIDGE_INIT__ = window.__IE_SYNAPSE_BRIDGE_INIT__ || false;
window.__IE_PRESENCE_INIT__ = window.__IE_PRESENCE_INIT__ || false;
window.__IE_PRESENCE_UI_INIT__ = window.__IE_PRESENCE_UI_INIT__ || false;
window.__IE_REALTIME_STARTED__ = window.__IE_REALTIME_STARTED__ || false;
window.__IE_ADMIN_LOADED__ = window.__IE_ADMIN_LOADED__ || false;
window.__IE_DESKTOP_DASHBOARD_INIT__ = window.__IE_DESKTOP_DASHBOARD_INIT__ || false;

// ------------------------------
// Helper: wait for required globals (best-effort, short timeout)
// ------------------------------
function waitForGlobals() {
  return new Promise((resolve) => {
    const start = Date.now();
    const TIMEOUT_MS = 5000;

    const check = () => {
      const ok =
        !!window.supabase &&
        typeof window.setupLoginDOM === "function" &&
        typeof window.initLoginSystem === "function";

      if (ok) return resolve();

      if (Date.now() - start > TIMEOUT_MS) {
        log.warn("⏱️ waitForGlobals timed out — continuing best-effort.");
        return resolve();
      }

      setTimeout(check, 50);
    };

    check();
  });
}

// ------------------------------
// Profile-loaded orchestration (attach EARLY so we don't miss events)
// ------------------------------
async function onProfileLoaded(e) {
  // Some callers may dispatch without detail; harden defensively
  const detail = e?.detail || {};
  const user = detail.user;
  const profile = detail.profile;

  // Avoid work until main init has run at least once
  // (prevents firing during partial loads before DOM is ready)
  if (!window.__IE_MAIN_INIT_DONE__) {
    // Cache the most recent event so we can replay once main is ready
    window.__IE_LAST_PROFILE_EVENT__ = e;
    return;
  }

  // Cache for any late subscribers (and for debugging)
  window.__IE_LAST_PROFILE_EVENT__ = e;

  // ------------------------------
  // Unified Network Discovery init (single-flight)
  // ------------------------------
  if (!window.__IE_UNIFIED_INIT__ && user && window.unifiedNetworkIntegration) {
    window.__IE_UNIFIED_INIT__ = true;
    log.debug("🧠 Initializing Unified Network Discovery...");

    try {
      const initialized = await window.unifiedNetworkIntegration.init(user.id, "synapse-svg");

      if (initialized) {
        log.info("✅ Unified Network Discovery active");
      } else {
        log.info("ℹ️ Using legacy synapse visualization");
      }
    } catch (error) {
      // Allow retry if init failed
      window.__IE_UNIFIED_INIT__ = false;
      log.error("❌ Unified Network initialization failed:", error);
    }
  }

  // ------------------------------
  // Synapse bridge init (single-flight)
  // ------------------------------
  if (!window.__IE_SYNAPSE_BRIDGE_INIT__ && window.synapseBridge) {
    window.__IE_SYNAPSE_BRIDGE_INIT__ = true;
    try {
      log.debug("🌉 Initializing synapse bridge...");
      window.synapseBridge.init();
    } catch (error) {
      window.__IE_SYNAPSE_BRIDGE_INIT__ = false;
      log.error("❌ Synapse bridge init failed:", error);
    }
  }

  // ------------------------------
  // Presence tracking init (single-flight)
  // ------------------------------
  if (!window.__IE_PRESENCE_INIT__ && profile?.id && window.PresenceRealtime && window.supabase) {
    window.__IE_PRESENCE_INIT__ = true;
    log.debug("👋 Initializing presence tracking (Realtime)...");

    try {
      await window.PresenceRealtime.initialize(window.supabase, profile.id);
      log.info("✅ Presence tracking active (Realtime + low-frequency DB)");
    } catch (error) {
      window.__IE_PRESENCE_INIT__ = false;
      log.error("❌ Presence tracking initialization failed:", error);
    }
  }

  // ------------------------------
  // Presence UI init (single-flight)
  // ------------------------------
  if (!window.__IE_PRESENCE_UI_INIT__ && window.PresenceUI && window.supabase) {
    window.__IE_PRESENCE_UI_INIT__ = true;
    log.debug("👁️ Initializing presence UI...");

    try {
      await window.PresenceUI.init(window.supabase, profile?.id);
      log.info("✅ Presence UI active");
    } catch (error) {
      window.__IE_PRESENCE_UI_INIT__ = false;
      log.error("❌ Presence UI initialization failed:", error);
    }
  }

  // ------------------------------
  // Delayed realtime startup (single-flight)
  // ------------------------------
  if (!window.__IE_REALTIME_STARTED__ && window.realtimeManager && window.bootstrapSession) {
    window.__IE_REALTIME_STARTED__ = true;
    log.debug("⏱️ Scheduling delayed realtime startup...");

    const startRealtime = async () => {
      try {
        const context = await window.bootstrapSession.getSessionContext();
        if (context) {
          await window.realtimeManager.startRealtime(context);
          log.info("✅ Realtime subscriptions started");
        } else {
          // If context missing, allow retry later
          window.__IE_REALTIME_STARTED__ = false;
          log.warn("⚠️ No bootstrap session context — realtime not started yet");
        }
      } catch (error) {
        window.__IE_REALTIME_STARTED__ = false;
        log.error("❌ Realtime startup failed:", error);
      }
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(startRealtime, { timeout: 3000 });
    } else {
      setTimeout(startRealtime, 3000);
    }
  }

  // ------------------------------
  // Unified Tier Command Dashboard (all viewports, single-flight)
  // Desktop: left sidebar + GraphController tier control.
  // Mobile:  data pre-loaded; shown inside split-view when bell is tapped.
  // ------------------------------
  if (!window.__IE_DESKTOP_DASHBOARD_INIT__ && profile?.id && user?.id) {
    window.__IE_DESKTOP_DASHBOARD_INIT__ = true;
    const _isDesktop = window.matchMedia('(min-width: 1024px)').matches;

    if (_isDesktop) {
      log.debug("🖥️ Initializing Command Dashboard (desktop)...");
      // GraphController applies Tier 1 opacity once synapseCore is ready
      if (window.GraphController) {
        window.GraphController.initialize(profile.id);
        log.info("✅ GraphController initialized (community id:", profile.id, ")");
      } else {
        log.warn("⚠️ GraphController not loaded — desktop tier control unavailable");
      }
    } else {
      log.debug("📱 Initializing Command Dashboard (mobile data mode)...");
    }

    // CommandDashboard runs on both desktop and mobile.
    // On mobile the element is hidden until the user opens the split view.
    if (window.CommandDashboard) {
      window.CommandDashboard.initialize({
        userId: profile.id,     // community.id — used for graph node lookups
        authUserId: user.id,    // auth.users.id — used for generateDailyBrief()
        profile,                // full profile for identity layer rendering
      }).catch(err => {
        window.__IE_DESKTOP_DASHBOARD_INIT__ = false;
        log.error("❌ CommandDashboard initialization failed:", err);
      });
      log.info("✅ CommandDashboard initialized (" + (_isDesktop ? "desktop" : "mobile") + ")");
    } else {
      log.warn("⚠️ CommandDashboard not loaded — dashboard content unavailable");
    }
  }

  // ------------------------------
  // Admin controls script load (single-flight, only after auth)
  // ------------------------------
  if (!window.__IE_ADMIN_LOADED__ && user) {
    window.__IE_ADMIN_LOADED__ = true;

    try {
      log.debug("🎛️ Loading admin controls (deferred)...");
      const script = document.createElement("script");
      script.src = "assets/js/unified-network-admin.js?v=1";
      script.async = true;
      script.onload = () => log.debug("✅ Admin controls loaded");
      script.onerror = () => {
        window.__IE_ADMIN_LOADED__ = false;
        log.warn("⚠️ Admin controls failed to load");
      };
      document.body.appendChild(script);
    } catch (e2) {
      window.__IE_ADMIN_LOADED__ = false;
      log.warn("⚠️ Admin controls injection failed:", e2);
    }
  }
}

// Attach the profile-loaded handler once, immediately
if (!window.__IE_PROFILE_HANDLER_ATTACHED__) {
  window.__IE_PROFILE_HANDLER_ATTACHED__ = true;
  window.addEventListener("profile-loaded", onProfileLoaded);
}

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener("DOMContentLoaded", async () => {
  // One-time init guard - prevents double-binding and ghost listeners
  if (window.__IE_MAIN_INIT_DONE__) {
    // If log.once exists (real logger), use it; otherwise no-op
    (log.once ? log.once("main-already-init", "⚠️ Main already initialized, skipping...") : log.warn("⚠️ Main already initialized, skipping..."));
    return;
  }
  window.__IE_MAIN_INIT_DONE__ = true;

  log.debug("🎨 DOM ready, initializing systems...");

  // Wait for required globals from other scripts
  await waitForGlobals();

  // 1) Setup login DOM elements (safe to call more than once)
  try {
    window.setupLoginDOM?.();
  } catch (e) {
    log.error("❌ setupLoginDOM failed:", e);
  }

  // 2) Initialize login system (idempotent in rewritten auth.js)
  try {
    await window.initLoginSystem?.();
  } catch (e) {
    log.error("❌ initLoginSystem failed:", e);
  }

  // If profile-loaded fired before DOMContentLoaded, replay the cached event once
  if (window.__IE_LAST_PROFILE_EVENT__) {
    try {
      await onProfileLoaded(window.__IE_LAST_PROFILE_EVENT__);
    } catch (e) {
      log.error("❌ Replaying cached profile-loaded event failed:", e);
    }
  }

  log.info("✅ System ready!");
});
