// ================================================================
// MAIN ENTRY POINT
// ================================================================
// This file coordinates auth.js, profile.js, and dashboard.js
// All modules are loaded as scripts and communicate via window object and events

// Import centralized logger
const log = window.log || console;

log.moduleLoad('main.js');
log.info('🚀 CharlestonHacks Innovation Engine starting...');

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener("DOMContentLoaded", async () => {
  // One-time init guard - prevents double-binding and ghost listeners
  if (window.__IE_MAIN_INIT_DONE__) {
    log.once('main-already-init', '⚠️ Main already initialized, skipping...');
    return;
  }
  window.__IE_MAIN_INIT_DONE__ = true;

  log.debug('🎨 DOM ready, initializing systems...');

  // Wait for required globals from other scripts
  await waitForGlobals();

  // 1) Setup login DOM elements (safe to call more than once)
  window.setupLoginDOM?.();

  // 2) Initialize login system (idempotent in rewritten auth.js)
  await window.initLoginSystem?.();

  // 3) Profile + dashboard modules listen for:
  //    - 'profile-loaded'
  //    - 'profile-new'
  //    - 'user-logged-out'
  //    - 'app-ready'
  
  // 4) Initialize Unified Network Discovery (if enabled)
  window.addEventListener('profile-loaded', async (e) => {
    const { user } = e.detail;
    
    if (user && window.unifiedNetworkIntegration) {
      log.debug('🧠 Attempting to initialize Unified Network Discovery...');
      
      try {
        const initialized = await window.unifiedNetworkIntegration.init(user.id, 'synapse-svg');
        
        if (initialized) {
          log.info('✅ Unified Network Discovery active');
        } else {
          log.info('ℹ️ Using legacy synapse visualization');
        }
        
        // Initialize synapse bridge after both systems are loaded
        // This ensures seamless integration between unified network and legacy synapse
        if (window.synapseBridge) {
          log.debug('🌉 Initializing synapse bridge...');
          window.synapseBridge.init();
        }
      } catch (error) {
        log.error('❌ Unified Network initialization failed:', error);
      }
    }
    
    // Load admin panel AFTER authentication
    // This prevents it from showing on the login page
    if (user) {
      log.debug('🎛️ Loading admin panel...');
      const script = document.createElement('script');
      script.src = 'assets/js/unified-network-admin.js?v=1';
      document.body.appendChild(script);
    }
  });
  
  log.info('✅ System ready!');
});

// Helper to wait for required globals to exist
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
        log.warn('⏱️ waitForGlobals timed out — continuing best-effort.');
        return resolve();
      }

      setTimeout(check, 50);
    };

    check();
  });
}
