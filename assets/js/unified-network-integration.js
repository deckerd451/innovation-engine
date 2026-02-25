/**
 * Unified Network Discovery - Dashboard Integration
 *
 * This module integrates the Unified Network Discovery system with the existing dashboard.
 *
 * Key properties of this integration file:
 * - SAFE/IDEMPOTENT: It can be loaded multiple times without duplicating listeners/UI.
 * - FEATURE-FLAGGED: Unified network can be enabled via localStorage.
 * - GRACEFUL FALLBACK: Errors fall back to legacy synapse.
 */

import { unifiedNetworkApi } from './unified-network/api.js';
import { logger } from './logger.js';
import { initializeErrorHandling } from './unified-network/error-integration.js';
import { installUnifiedTierProbe } from './unified-tier-probe.js';

// ------------------------------------------------------------------
// Feature flags (read dynamically so changes apply without redeploy)
// ------------------------------------------------------------------
function getFeatureFlags() {
  return {
    // Unified network is always enabled for all users
    ENABLE_UNIFIED_NETWORK: true,
    DEBUG_MODE: localStorage.getItem('unified-network-debug') === 'true'
  };
}

// ------------------------------------------------------------------
// Integration state (kept in module scope)
// ------------------------------------------------------------------
let integrationState = {
  initialized: false,
  initializing: false,
  usingUnifiedNetwork: false,
  fallbackToLegacy: false,
  error: null,
  userId: null,
  containerId: null
};

// ------------------------------------------------------------------
// Idempotent guards (protect against duplicate script/module loads)
// ------------------------------------------------------------------
const GUARDS = {
  styleInjected: false,
  bridgesWired: false,
  uiWired: false,
  shortcutsWired: false,
  searchWired: false,
  perfIntervalId: null
};

const INTEGRATION_NS = 'UnifiedNetworkIntegration';

/**
 * Initialize the unified network system (idempotent).
 *
 * Returns:
 *  - true  => unified network is active
 *  - false => feature disabled OR fallback to legacy
 */
export async function initUnifiedNetwork(_userIdIgnored, containerId = 'synapse-svg') {
  const FLAGS = getFeatureFlags();

  // Resolve the ONLY id that should drive unified network: community profile id
  const communityId =
    window.bootstrapSession?.communityUser?.id ||
    window.communityUser?.id ||
    window.currentUserProfile?.id ||
    null;

  // If profile isn't ready yet, wait for it (common on cold load / async bootstrap)
  if (!communityId) {
    logger.debug(INTEGRATION_NS, 'Community profile not ready — waiting for profile-loaded...');
    await new Promise((resolve) => {
      const onLoaded = () => {
        window.removeEventListener('profile-loaded', onLoaded);
        resolve();
      };
      window.addEventListener('profile-loaded', onLoaded, { once: true });
    });

    // Try again after event
    const communityId2 =
      window.bootstrapSession?.communityUser?.id ||
      window.communityUser?.id ||
      window.currentUserProfile?.id ||
      null;

    if (!communityId2) {
      logger.error(INTEGRATION_NS, 'profile-loaded fired but communityId is still missing — falling back');
      return false;
    }

    return initUnifiedNetwork(null, containerId); // recurse once with resolved profile
  }

  // If already initialized for same community/container, short-circuit.
  if (
    integrationState.initialized &&
    integrationState.usingUnifiedNetwork &&
    integrationState.userId === communityId &&
    integrationState.containerId === containerId
  ) {
    logger.debug(INTEGRATION_NS, 'Already initialized (same communityId/container) — skipping.');
    return true;
  }

  // If a prior init is in-flight, wait for it.
  if (integrationState.initializing) {
    logger.debug(INTEGRATION_NS, 'Initialization already in progress — awaiting...');
    await waitForInitToSettle();
    return integrationState.usingUnifiedNetwork && integrationState.initialized;
  }

  logger.info(INTEGRATION_NS, 'Initializing unified network discovery', { communityId, containerId });

  integrationState.initializing = true;
  integrationState.error = null;
  integrationState.fallbackToLegacy = false;
  integrationState.userId = communityId;        // IMPORTANT: store communityId here
  integrationState.containerId = containerId;

  try {
    // Validate container before boot
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Unified network container not found: #${containerId}`);
    }

    // Initialize error handling FIRST
    initializeErrorHandling(unifiedNetworkApi);

    // ✅ Initialize the unified network API with COMMUNITY ID (not auth uid)
    await unifiedNetworkApi.initialize(containerId, communityId);

    // Setup event bridges (idempotent)
    setupEventBridges();

    // Setup UI integrations (idempotent)
    setupUIIntegrations();

    // Inject CSS animations once
    injectStylesOnce();

    integrationState.initialized = true;
    integrationState.usingUnifiedNetwork = true;

    // Set body attribute for mobile CSS scoping
    document.body.setAttribute('data-unified-network', 'on');

    logger.info(INTEGRATION_NS, '✅ Unified network initialized successfully', { communityId });

// Install tier probe for mobile debugging (idempotent)
try {
  installUnifiedTierProbe(unifiedNetworkApi);
  console.log("📱 Unified Tier Probe installed");
} catch (probeError) {
  console.warn("📱 Unified Tier Probe installation failed:", probeError);
  // Non-fatal, continue
}

// Emit custom event for other systems

    window.dispatchEvent(
      new CustomEvent('unified-network-ready', {
        detail: { userId: communityId, containerId }
      })
    );

    return true;
  } catch (error) {
    logger.error(INTEGRATION_NS, 'Failed to initialize unified network', error);

    integrationState.error = error;
    integrationState.fallbackToLegacy = true;
    integrationState.usingUnifiedNetwork = false;
    integrationState.initialized = false;

    // Remove body attribute on error
    document.body.removeAttribute('data-unified-network');

    safelyStopPerfInterval();
    showErrorNotification('Network visualization failed to load. Using fallback mode.');
    return false;
  } finally {
    integrationState.initializing = false;
  }
}


// Wait for init to complete (used when init called twice quickly)
function waitForInitToSettle(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (!integrationState.initializing) return resolve();
      if (Date.now() - start > timeoutMs) return resolve();
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Setup event bridges between unified network and dashboard (idempotent).
 */
function setupEventBridges() {
  if (GUARDS.bridgesWired) return;
  GUARDS.bridgesWired = true;

  // Discovery triggered
  unifiedNetworkApi.on('discovery-triggered', ({ reasons }) => {
    logger.debug(INTEGRATION_NS, 'Discovery triggered', { reasons });
    const FLAGS = getFeatureFlags();
    if (FLAGS.DEBUG_MODE) console.log('🔍 Discovery activated:', (reasons || []).join(', '));
  });

  // Action completed
  unifiedNetworkApi.on('action-completed', ({ nodeId, actionType }) => {
    logger.info(INTEGRATION_NS, 'Action completed', { nodeId, actionType });

    // Refresh dashboard stats
    if (typeof window.loadCommunityStats === 'function') {
      window.loadCommunityStats();
    }

    const messages = {
      connect: 'Connection established!',
      'join-project': 'Joined project successfully!',
      'explore-theme': 'Theme added to your interests!'
    };

    showSuccessNotification(messages[actionType] || 'Action completed!');
  });

  // Action failed
  unifiedNetworkApi.on('action-failed', ({ nodeId, actionType, error }) => {
    logger.error(INTEGRATION_NS, 'Action failed', { nodeId, actionType, error });
    showErrorNotification('Action failed. Please try again.');
  });

  // Node focused (kept for future)
  unifiedNetworkApi.on('node-focused', ({ nodeId }) => {
    logger.debug(INTEGRATION_NS, 'Node focused', { nodeId });
  });

  // Background paused/resumed
  unifiedNetworkApi.on('background-paused', () => {
    logger.debug(INTEGRATION_NS, 'App backgrounded - physics paused');
  });

  unifiedNetworkApi.on('background-resumed', () => {
    logger.debug(INTEGRATION_NS, 'App foregrounded - physics resumed');
  });

  // Performance monitoring (debug)
  maybeStartPerfLogging();
}

function maybeStartPerfLogging() {
  const FLAGS = getFeatureFlags();
  if (!FLAGS.DEBUG_MODE) {
    safelyStopPerfInterval();
    return;
  }
  if (GUARDS.perfIntervalId) return;

  GUARDS.perfIntervalId = setInterval(() => {
    try {
      const metrics = unifiedNetworkApi.getPerformanceMetrics?.();
      if (!metrics) return;
      logger.debug(INTEGRATION_NS, 'Performance', {
        fps: metrics.fps,
        memory: typeof metrics.memoryUsage === 'number'
          ? `${(metrics.memoryUsage / (1024 * 1024)).toFixed(2)}MB`
          : 'n/a'
      });
    } catch (_) {
      // no-op
    }
  }, 30000);
}

function safelyStopPerfInterval() {
  if (GUARDS.perfIntervalId) {
    clearInterval(GUARDS.perfIntervalId);
    GUARDS.perfIntervalId = null;
  }
}

/**
 * Setup UI integrations (idempotent).
 */
function setupUIIntegrations() {
  if (GUARDS.uiWired) return;
  GUARDS.uiWired = true;

  addPreferencesButton();
  setupSearchIntegration();
  setupKeyboardShortcuts();
}

/**
 * Add discovery preferences button to dashboard (idempotent).
 */
function addPreferencesButton() {
  // Avoid duplicates
  if (document.querySelector('.unified-network-preferences-btn')) return;

  const header =
    document.querySelector('.dashboard-header') ||
    document.querySelector('header') ||
    document.querySelector('.top-bar');

  if (!header) {
    logger.debug(INTEGRATION_NS, 'No header found for preferences button - skipping UI integration');
    return;
  }

  const button = document.createElement('button');
  button.className = 'unified-network-preferences-btn';
  button.type = 'button';
  button.innerHTML = '<i class="fas fa-cog"></i> Discovery';
  button.title = 'Discovery Preferences';

  // Keep styling inline to avoid touching global CSS
  button.style.cssText = `
    background: rgba(68, 136, 255, 0.2);
    border: 1px solid rgba(68, 136, 255, 0.5);
    color: #4488ff;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    margin-left: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  `;

  button.addEventListener('click', () => {
    try {
      unifiedNetworkApi.showPreferencesPanel?.();
    } catch (e) {
      logger.error(INTEGRATION_NS, 'Failed to open preferences panel', e);
    }
  });

  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(68, 136, 255, 0.3)';
    button.style.borderColor = 'rgba(68, 136, 255, 0.8)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(68, 136, 255, 0.2)';
    button.style.borderColor = 'rgba(68, 136, 255, 0.5)';
  });

  header.appendChild(button);

  logger.debug(INTEGRATION_NS, 'Preferences button added');
}

/**
 * Setup search integration (idempotent).
 */
function setupSearchIntegration() {
  if (GUARDS.searchWired) return;
  GUARDS.searchWired = true;

  window.addEventListener('search-result-selected', (event) => {
    const nodeId = event?.detail?.nodeId;
    if (!nodeId) return;

    if (integrationState.usingUnifiedNetwork && integrationState.initialized) {
      try {
        unifiedNetworkApi.focusNode?.(nodeId, { duration: 750, smooth: true });
      } catch (e) {
        logger.error(INTEGRATION_NS, 'Failed to focus node from search', e);
      }
    }
  });

  logger.debug(INTEGRATION_NS, 'Search integration setup');
}

/**
 * Setup keyboard shortcuts (idempotent).
 * NOTE: These are active ONLY when unified network is active.
 */
function setupKeyboardShortcuts() {
  if (GUARDS.shortcutsWired) return;
  GUARDS.shortcutsWired = true;

  document.addEventListener('keydown', (event) => {
    if (!integrationState.usingUnifiedNetwork || !integrationState.initialized) return;

    // Ctrl/Cmd + D: Trigger discovery
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
      event.preventDefault();
      unifiedNetworkApi.triggerDiscovery?.();
    }

    // Ctrl/Cmd + H: Go to My Network
    if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
      event.preventDefault();
      unifiedNetworkApi.resetToMyNetwork?.();
    }

    // Ctrl/Cmd + P: Show preferences
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
      event.preventDefault();
      unifiedNetworkApi.showPreferencesPanel?.();
    }
  });

  logger.debug(INTEGRATION_NS, 'Keyboard shortcuts setup');
}

/**
 * Notifications
 */
function showSuccessNotification(message) {
  if (typeof window.showSynapseNotification === 'function') {
    window.showSynapseNotification(message, 'success');
  } else {
    showSimpleNotification(message, 'success');
  }
}

function showErrorNotification(message) {
  if (typeof window.showSynapseNotification === 'function') {
    window.showSynapseNotification(message, 'error');
  } else {
    showSimpleNotification(message, 'error');
  }
}

function showSimpleNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `unified-network-notification ${type}`;
  notification.textContent = message;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4488ff'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: unetSlideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'unetSlideOut 0.3s ease-out';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * Check if unified network is active
 */
export function isUnifiedNetworkActive() {
  return integrationState.usingUnifiedNetwork && integrationState.initialized;
}

/**
 * Get integration state
 */
export function getIntegrationState() {
  return { ...integrationState };
}

/**
 * Enable unified network (for testing/admin)
 */
export function enableUnifiedNetwork() {
  // Remove the key so the default-ON check (!== 'false') takes effect cleanly.
  localStorage.removeItem('enable-unified-network');
  logger.info(INTEGRATION_NS, 'Unified network enabled - reload page to activate');
  showSuccessNotification('Unified Network enabled! Reload the page to activate.');
}

/**
 * Disable unified network
 */
export function disableUnifiedNetwork() {
  localStorage.setItem('enable-unified-network', 'false');
  logger.info(INTEGRATION_NS, 'Unified network disabled - reload page to use legacy');
  showSuccessNotification('Unified Network disabled! Reload the page to use legacy mode.');
}

/**
 * Toggle debug mode
 */
export function toggleDebugMode() {
  const current = localStorage.getItem('unified-network-debug') === 'true';
  localStorage.setItem('unified-network-debug', (!current).toString());
  logger.info(INTEGRATION_NS, `Debug mode ${!current ? 'enabled' : 'disabled'}`);
  showSuccessNotification(`Debug mode ${!current ? 'enabled' : 'disabled'}!`);

  // Apply immediately if already running
  maybeStartPerfLogging();
}

// ------------------------------------------------------------------
// Global export (idempotent) — do not overwrite existing object
// ------------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.unifiedNetworkIntegration = window.unifiedNetworkIntegration || {};
  Object.assign(window.unifiedNetworkIntegration, {
    init: initUnifiedNetwork,
    isActive: isUnifiedNetworkActive,
    getState: getIntegrationState,
    enable: enableUnifiedNetwork,
    disable: disableUnifiedNetwork,
    toggleDebug: toggleDebugMode,
    api: unifiedNetworkApi
  });
}

/**
 * Inject CSS animations once (namespaced to avoid collisions).
 */
function injectStylesOnce() {
  if (GUARDS.styleInjected) return;
  GUARDS.styleInjected = true;

  if (document.getElementById('unified-network-integration-styles')) return;

  const style = document.createElement('style');
  style.id = 'unified-network-integration-styles';
  style.textContent = `
    @keyframes unetSlideIn {
      from { transform: translateX(400px); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    @keyframes unetSlideOut {
      from { transform: translateX(0); opacity: 1; }
      to   { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Clear any stale 'false' flag left by a previous admin toggle or error handler.
// Unified network is always on — this key should never be 'false'.
localStorage.removeItem('enable-unified-network');

logger.info(INTEGRATION_NS, 'Integration module loaded (idempotent)');
window.addEventListener('profile-loaded', () => {
  initUnifiedNetwork(null, 'synapse-svg').catch(() => {});
});

