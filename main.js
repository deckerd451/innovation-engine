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

// ================================================================
// GLOBAL NAMESPACE
// All boot flags live under window.__IE to avoid polluting the root
// namespace with 12+ separate globals.
//
// window.__IE.register(name, value) — safe way for any module to
// export a function/object to window. Warns in the console when a
// name is already taken so collisions surface immediately.
// ================================================================
window.__IE = window.__IE || {};

// Boot flags — set to true when the system has started; reset to
// false on recoverable failures to allow a retry on next event.
const _f = window.__IE.flags = window.__IE.flags || {
  errorHandlers:          false,
  mainInitDone:           false,
  profileHandlerAttached: false,
  lastProfileEvent:       null,   // most recent profile-loaded event (for replay)
  unifiedInit:            false,
  synapseBridgeInit:      false,
  presenceInit:           false,
  presenceUiInit:         false,
  bleInit:                false,
  realtimeStarted:        false,
  adminLoaded:            false,
  desktopDashInit:        false,
};

/**
 * Register a value on window by name.
 * Emits a console warning if the name is already occupied so accidental
 * collisions are caught early. Pass { override: true } to silence it.
 *
 * @param {string} name        - Property name on window (e.g. 'openProfileModal')
 * @param {*}      value       - The value / function to expose
 * @param {object} [opts]
 * @param {boolean} [opts.override=false] - Suppress collision warning
 * @returns {*} The registered value (for chaining)
 */
window.__IE.register = function register(name, value, { override = false } = {}) {
  if (!override && name in window && window[name] !== undefined) {
    log.warn(
      `[IE] window.${name} already exists (${typeof window[name]}) — ` +
      `possible collision. Pass { override: true } to suppress this warning.`
    );
  }
  window[name] = value;
  return value;
};

// ================================================================
// GLOBAL ERROR HANDLING
// Catches uncaught errors and unhandled promise rejections app-wide.
// Shows a user-visible toast so failures are never silent.
// ================================================================
(function installGlobalErrorHandlers() {
  if (_f.errorHandlers) return;
  _f.errorHandlers = true;

  function showErrorToast(message) {
    // Defer until body is available
    const attach = () => {
      let container = document.getElementById('__ie-error-toast');
      if (!container) {
        container = document.createElement('div');
        container.id = '__ie-error-toast';
        container.setAttribute('role', 'alert');
        container.setAttribute('aria-live', 'assertive');
        container.style.cssText = [
          'position:fixed', 'bottom:1.25rem', 'left:50%',
          'transform:translateX(-50%)',
          'background:#1a1010', 'border:1px solid #ff4444',
          'color:#ff9999', 'padding:0.75rem 1.5rem',
          'border-radius:8px', 'font-size:0.85rem',
          'z-index:2147483647', 'max-width:90vw',
          'text-align:center', 'box-shadow:0 4px 20px rgba(0,0,0,0.7)',
          'pointer-events:none',
        ].join(';');
        document.body.appendChild(container);
      }
      container.textContent = message;
      container.style.display = 'block';
      clearTimeout(container.__hideTimer);
      container.__hideTimer = setTimeout(() => {
        container.style.display = 'none';
      }, 6000);
    };

    if (document.body) {
      attach();
    } else {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  }

  // Unhandled promise rejections (async functions without try-catch)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // Suppress known non-fatal errors
    if (reason?.name === 'AbortError') return;
    if (reason?.message?.includes('NetworkError')) return;
    if (reason?.message?.includes('Load failed')) return;

    log.error('Unhandled promise rejection:', reason);
    showErrorToast('Something went wrong. Please refresh if the issue persists.');
  });

  // Uncaught synchronous errors
  window.onerror = (message, source, lineno, colno, error) => {
    // Skip opaque cross-origin errors (browser hides details for security)
    if (message === 'Script error.' && !source) return false;
    log.error('Uncaught error:', message, { source, lineno, colno, error });
    showErrorToast('Something went wrong. Please refresh if the issue persists.');
    return false; // Preserve default browser error handling
  };
})();

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
  if (!_f.mainInitDone) {
    // Cache the most recent event so we can replay once main is ready
    _f.lastProfileEvent = e;
    return;
  }

  // Cache for any late subscribers (and for debugging)
  _f.lastProfileEvent = e;

  // ------------------------------
  // Unified Network Discovery init (single-flight)
  // ------------------------------
  if (!_f.unifiedInit && user && window.unifiedNetworkIntegration) {
    _f.unifiedInit = true;
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
      _f.unifiedInit = false;
      log.error("❌ Unified Network initialization failed:", error);
    }
  }

  // ------------------------------
  // Presence tracking init (single-flight)
  // ------------------------------
  if (!_f.presenceInit && profile?.id && window.PresenceRealtime && window.supabase) {
    _f.presenceInit = true;
    log.debug("👋 Initializing presence tracking (Realtime)...");

    try {
      await window.PresenceRealtime.initialize(window.supabase, profile.id);
      log.info("✅ Presence tracking active (Realtime + low-frequency DB)");
    } catch (error) {
      _f.presenceInit = false;
      log.error("❌ Presence tracking initialization failed:", error);
    }
  }

  // ------------------------------
  // Presence UI init (single-flight)
  // ------------------------------
  if (!_f.presenceUiInit && window.PresenceUI && window.supabase) {
    _f.presenceUiInit = true;
    log.debug("👁️ Initializing presence UI...");

    try {
      await window.PresenceUI.init(window.supabase, profile?.id);
      log.info("✅ Presence UI active");
    } catch (error) {
      _f.presenceUiInit = false;
      log.error("❌ Presence UI initialization failed:", error);
    }
  }

  // ------------------------------
  // BLE Passive Networking init (single-flight)
  // ------------------------------
  if (!_f.bleInit && profile?.id && window.BLEPassiveNetworking && window.supabase) {
    _f.bleInit = true;
    log.debug("📡 Initializing BLE Passive Networking...");

    try {
      const initialized = await window.BLEPassiveNetworking.initialize(window.supabase, profile.id);
      if (initialized) {
        log.info("✅ BLE Passive Networking active");
      } else {
        log.info("ℹ️ BLE Passive Networking not available (browser not supported)");
      }
    } catch (error) {
      _f.bleInit = false;
      log.error("❌ BLE Passive Networking initialization failed:", error);
    }
  }

  // ------------------------------
  // Delayed realtime startup (single-flight)
  // ------------------------------
  if (!_f.realtimeStarted && window.realtimeManager && window.bootstrapSession) {
    _f.realtimeStarted = true;
    log.debug("⏱️ Scheduling delayed realtime startup...");

    const startRealtime = async () => {
      try {
        const context = await window.bootstrapSession.getSessionContext();
        if (context) {
          await window.realtimeManager.startRealtime(context);
          log.info("✅ Realtime subscriptions started");
        } else {
          // If context missing, allow retry later
          _f.realtimeStarted = false;
          log.warn("⚠️ No bootstrap session context — realtime not started yet");
        }
      } catch (error) {
        _f.realtimeStarted = false;
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
  if (!_f.desktopDashInit && profile?.id && user?.id) {
    _f.desktopDashInit = true;
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
        _f.desktopDashInit = false;
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
  if (!_f.adminLoaded && user) {
    _f.adminLoaded = true;

    try {
      log.debug("🎛️ Loading admin controls (deferred)...");
      const script = document.createElement("script");
      script.src = "assets/js/unified-network-admin.js?v=1";
      script.async = true;
      script.onload = () => log.debug("✅ Admin controls loaded");
      script.onerror = () => {
        _f.adminLoaded = false;
        log.warn("⚠️ Admin controls failed to load");
      };
      document.body.appendChild(script);
    } catch (e2) {
      _f.adminLoaded = false;
      log.warn("⚠️ Admin controls injection failed:", e2);
    }
  }
}

// Attach the profile-loaded handler once, immediately
if (!_f.profileHandlerAttached) {
  _f.profileHandlerAttached = true;
  window.addEventListener("profile-loaded", onProfileLoaded);
}

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener("DOMContentLoaded", async () => {
  // One-time init guard - prevents double-binding and ghost listeners
  if (_f.mainInitDone) {
    (log.once ? log.once("main-already-init", "⚠️ Main already initialized, skipping...") : log.warn("⚠️ Main already initialized, skipping..."));
    return;
  }
  _f.mainInitDone = true;

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
  if (_f.lastProfileEvent) {
    try {
      await onProfileLoaded(_f.lastProfileEvent);
    } catch (e) {
      log.error("❌ Replaying cached profile-loaded event failed:", e);
    }
  }

  log.info("✅ System ready!");
});
