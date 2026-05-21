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




function isDebugModeEnabled() {
  try {
    if (window.__IE?.debugAuthRecovery === true) return true;
    if (localStorage.getItem('ie_debug_mode') === 'true') return true;
    if (sessionStorage.getItem('ie_debug_mode') === 'true') return true;
  } catch (_) {}
  return /[?&](debug|ie_debug)=1/.test(window.location.search);
}

function clearAuthCaches() {
  const authLike = /supabase|sb-|auth|token|session|onboarding_/i;
  const clearStore = (store) => {
    if (!store) return;
    const toDelete = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && authLike.test(key)) toDelete.push(key);
    }
    toDelete.forEach((k) => store.removeItem(k));
  };

  try { clearStore(localStorage); } catch (e) { log.warn('[AuthUtility] Failed localStorage clear', e); }
  try { clearStore(sessionStorage); } catch (e) { log.warn('[AuthUtility] Failed sessionStorage clear', e); }
}

function ensurePersistentAuthUtility() {
  if (!document.body) return;

  let panel = document.getElementById('ie-persistent-auth-utility');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ie-persistent-auth-utility';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Account controls');
    panel.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px',
      'z-index:2147483647', 'display:flex', 'gap:8px',
      'align-items:center', 'pointer-events:auto'
    ].join(';');

    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'ie-persistent-logout-btn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Sign Out';
    logoutBtn.setAttribute('aria-label', 'Sign out');
    logoutBtn.style.cssText = 'padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:#0f172a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35)';
    logoutBtn.addEventListener('click', async () => {
      if (typeof window.handleLogout === 'function') await window.handleLogout();
      else window.location.href = '/index.html';
    });

    const resetBtn = document.createElement('button');
    resetBtn.id = 'ie-persistent-reset-session-btn';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset Session';
    resetBtn.setAttribute('aria-label', 'Reset session and sign out');
    resetBtn.style.cssText = 'padding:8px 12px;border-radius:999px;border:1px solid rgba(255,128,128,.7);background:#3b0a0a;color:#ffd6d6;font-size:12px;font-weight:600;cursor:pointer;display:none';
    resetBtn.addEventListener('click', async () => {
      clearAuthCaches();
      if (typeof window.handleLogout === 'function') await window.handleLogout();
      else window.location.href = '/index.html';
    });

    panel.append(logoutBtn, resetBtn);
    document.body.appendChild(panel);
  }

  const resetBtn = document.getElementById('ie-persistent-reset-session-btn');
  if (resetBtn) resetBtn.style.display = isDebugModeEnabled() ? 'inline-flex' : 'none';
}

function renderDiscoveryModeLayout() {
  console.info('[DiscoveryMode] runtime loaded');
  document.body.classList.add('discovery-mode');
  document.body.classList.add('search-only-mode');
  document.body.classList.remove('admin-mode');
  document.body.classList.remove('dashboard-shell-loading');
  ensurePersistentAuthUtility();

  if (!document.getElementById('discovery-onboarding-visibility-guard')) {
    const style = document.createElement('style');
    style.id = 'discovery-onboarding-visibility-guard';
    style.textContent = `
      body.discovery-mode .onboarding-modal,
      body.discovery-mode #onboarding-modal,
      body.discovery-mode #profile-completion-modal {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      body.discovery-mode #ie-persistent-auth-utility,
      body.onboarding-required #ie-persistent-auth-utility {
        z-index: 2147483647 !important;
        pointer-events: auto !important;
      }

      body.discovery-mode .dashboard-sidebar,
      body.discovery-mode .sidebar-loading,
      body.discovery-mode .left-rail-loading,
      body.discovery-mode .dashboard-shell-placeholder {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  log.info('[DiscoveryMode] discovery-mode class applied');
}

window.renderDiscoveryModeLayout = renderDiscoveryModeLayout;

function resetInnovationAccessBodyState() {
  document.body.classList.remove('discovery-mode');
  document.body.classList.remove('search-only-mode');
  document.body.classList.remove('onboarding-required');
}

function initializeSearchOnlyMode() {
  log.info('[InnovationAccess] Non-admin mode: skipping Synapse/D3 initialization');
  document.body.classList.remove('onboarding-required');
  document.body.classList.remove('discovery-mode');
  document.body.classList.remove('admin-mode');
  if (typeof window.applyInnovationAccessControls === 'function') {
    try { window.applyInnovationAccessControls(); } catch (err) {
      log.warn('⚠️ Failed to apply limited-access controls:', err);
    }
  }
  renderDiscoveryModeLayout();
}

function renderDiscoveryModeLayout() {
  const body = document.body;
  const mainContent = document.getElementById('main-content');
  const searchShell = document.getElementById('centered-search-container');
  const searchInput = document.getElementById('global-search');

  if (!body || !mainContent || !searchShell || !searchInput) return;
  if (body.dataset.discoveryModeInitialized === 'true') return;

  body.dataset.discoveryModeInitialized = 'true';
  body.classList.add('ie-discovery-mode');

  // Remove admin/dashboard shell surfaces entirely for non-admin users.
  const hideSelectors = [
    '#command-dashboard',
    '#mobile-notif-container',
    '#synapse-main-view',
    '#btn-network-dashboard-mobile',
    '#btn-admin-top',
    '#cd-admin-btn',
    '#network-command-panel',
    '#view-controls-panel',
    '#nr-modal',
  ];
  hideSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
  });

  // Build a dedicated discovery/search layout, rather than a stripped admin shell.
  mainContent.style.display = 'flex';
  mainContent.style.flexDirection = 'column';
  mainContent.style.alignItems = 'center';
  mainContent.style.justifyContent = 'center';
  mainContent.style.padding = 'min(6vh, 3rem) 1rem';
  mainContent.style.gap = '1rem';

  let discoveryHero = document.getElementById('discovery-mode-hero');
  if (!discoveryHero) {
    discoveryHero = document.createElement('section');
    discoveryHero.id = 'discovery-mode-hero';
    discoveryHero.innerHTML = `
      <div style="font-size:0.75rem; letter-spacing:0.12em; text-transform:uppercase; color:rgba(0,224,255,0.8); margin-bottom:0.5rem;">Nearify Discovery</div>
      <h1 style="margin:0; color:#eaf6ff; font-size:clamp(1.4rem, 3.2vw, 2.3rem); font-weight:700;">Discover people, projects, and opportunities</h1>
      <p style="margin:0.75rem 0 0; color:rgba(223,233,255,0.72); max-width:50ch; line-height:1.45;">
        Search your network in one focused view. No dashboard clutter — just discovery.
      </p>
    `;
    discoveryHero.style.cssText = 'width:min(840px, 100%); text-align:center; padding:1.25rem 1rem;';
    mainContent.insertBefore(discoveryHero, searchShell);
  renderDiscoveryModeLayout();

  const synapseView = document.getElementById('synapse-main-view');
  if (synapseView) {
    synapseView.style.display = 'none';
    synapseView.setAttribute('aria-hidden', 'true');
  }

  searchShell.style.position = 'relative';
  searchShell.style.bottom = 'auto';
  searchShell.style.width = 'min(840px, 100%)';
  searchShell.style.maxWidth = 'min(840px, 100%)';
  searchShell.style.gap = '0.5rem';

  const searchContainer = document.getElementById('search-container');
  if (searchContainer) {
    searchContainer.style.background = 'rgba(8, 13, 31, 0.88)';
    searchContainer.style.border = '1px solid rgba(0,224,255,0.32)';
    searchContainer.style.borderRadius = '16px';
    searchContainer.style.boxShadow = '0 24px 80px rgba(0,0,0,0.45), 0 10px 30px rgba(0,224,255,0.18)';
    searchContainer.style.backdropFilter = 'blur(14px)';
  }

  const dragHandle = document.getElementById('search-drag-handle');
  if (dragHandle) dragHandle.style.display = 'none';

  searchInput.placeholder = 'Search people, projects, skills, and opportunities…';
}


window.initializeSearchOnlyMode = initializeSearchOnlyMode;

function isProfileComplete(profile) {
  if (!profile) return false;

  if (profile._needsOnboarding === true) return false;
  if (profile._legacyComplete === true) return true;

  const hasName = typeof (profile.display_name || profile.name) === "string"
    && (profile.display_name || profile.name).trim().length > 0;
  const hasEmail = typeof profile.email === "string" && profile.email.trim().length > 0;
  const hasRequiredIdentity = hasName && hasEmail;

  if (!hasRequiredIdentity) return false;
  if (profile._profileSource === "newly-created") return false;

  return profile.onboarding_completed === true && profile.profile_completed === true;
}

function showOnboardingGate(profile) {
  if (typeof window.showOnboarding === "function") {
    window.showOnboarding(profile);
    return true;
  }

  if (typeof window.StartOnboarding?.start === "function") {
    window.StartOnboarding.start({ profile });
    return true;
  }

  log.warn("[AuthRoute] onboarding UI unavailable");
  return false;
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

  if (!user?.id) {
    log.info('[AuthRoute] login-required');
    return;
  }

  if (!profile?.id) {
    log.info('[AuthRoute] profile-create-required');
    return;
  }

  if (!isProfileComplete(profile)) {
    log.info('[AuthRoute] onboarding-required');
    document.body.classList.add('onboarding-required');
    ensurePersistentAuthUtility();
    showOnboardingGate(profile);
    return;
  }

  const canUseAdvancedInnovationTools = window.canUseAdvancedInnovationTools === true;
  if (!canUseAdvancedInnovationTools) {
    log.info('[InnovationAccess] discovery-mode');
    initializeSearchOnlyMode();
    return;
  }

  resetInnovationAccessBodyState();
  document.body.classList.remove('discovery-mode');
  document.body.classList.remove('search-only-mode');
  document.body.classList.remove('onboarding-required');
  log.info('[AdminMode] cleared discovery classes');
  document.body.classList.add('admin-mode');
  ensurePersistentAuthUtility();
  const synapseView = document.getElementById('synapse-main-view');
  if (synapseView) {
    synapseView.style.removeProperty('display');
    synapseView.removeAttribute('aria-hidden');
  }

  log.info('[InnovationAccess] admin-full');
  const adminRestoreTargets = [
    '.dashboard-shell',
    '.dashboard-sidebar',
    '.left-sidebar',
    '.network-shell',
    '.command-sidebar',
    '#network-report-modal',
    '#network-status-panel',
    '#cd-explore',
  ];
  adminRestoreTargets.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('opacity');
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('filter');
      el.style.removeProperty('backdrop-filter');
    });
  });
  log.info('[AdminMode] sidebar restored');


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
  const canUseAdvancedTools = window.canUseAdvancedInnovationTools === true;
  if (!canUseAdvancedTools) {
    log.info('🚪 Limited-access mode: skipping GraphController, CommandDashboard, and admin script');
  }

  if (canUseAdvancedTools && !_f.desktopDashInit && profile?.id && user?.id) {
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
  if (canUseAdvancedTools && !_f.adminLoaded && user) {
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
