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

import { unifiedNetworkApi } from './unified-network/api.js?v=center-user-20260318';
import { logger } from './logger.js';
import { initializeErrorHandling } from './unified-network/error-integration.js';
import { installUnifiedTierProbe } from './unified-tier-probe.js';
import { initSynapseFilterUI } from './synapse-filter-ui.js';
import './synapse-context.js';

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

    // ================================================================
    // OPPORTUNITY ENGINE INITIALIZATION
    // ================================================================
    logger.debug(INTEGRATION_NS, 'Initializing Opportunity Engine...');
    try {
      if (window.OpportunityEngine && window.supabase) {
        await window.OpportunityEngine.init(window.supabase, communityId);
        const oppCount = window.OpportunityEngine.getActiveCount();
        logger.debug(INTEGRATION_NS, `Opportunity Engine ready — ${oppCount} opportunities`);

        // Expose API on window.synapseApi
        window.synapseApi = window.synapseApi || {};
        window.synapseApi.opportunities = {
          getAll: () => window.OpportunityEngine?.getOpportunities() || [],
          getCount: () => window.OpportunityEngine?.getActiveCount() || 0,
          getTrending: (limit = 5) => window.OpportunityEngine?.getTrending(limit) || [],
          getTop: () => window.OpportunityEngine?.getTopTrending() || null,
          trackJoin: (oppId, meta) => window.OpportunityEngine?.trackJoin(oppId, meta),
          trackBookmark: (oppId, meta) => window.OpportunityEngine?.trackBookmark(oppId, meta),
          trackClick: (oppId, meta) => window.OpportunityEngine?.trackClick(oppId, meta),
          refresh: () => window.OpportunityEngine?.refresh()
        };

        // Compatibility: provide legacy synapseApi methods via unified network
        window.synapseApi.open = () => {
          const synapseView = document.getElementById('synapse-main-view');
          if (synapseView) {
            synapseView.style.display = 'block';
            synapseView.style.visibility = 'visible';
            synapseView.style.opacity = '1';
            synapseView.style.zIndex = '1';
          }
        };
        window.synapseApi.focusNode = (nodeId, opts) => {
          if (nodeId) unifiedNetworkApi.focusNode(nodeId, opts);
        };
        window.synapseApi.focusSkill = (skillId) => {
          if (themeId) unifiedNetworkApi.focusNode(themeId);
        };
        window.synapseApi.showActivity = () => {
          unifiedNetworkApi.centerOnCurrentUser();
        };

        // Compatibility alias for graph-controller.js
        window.synapseCore = window.synapseCore || window.synapseApi || unifiedNetworkApi;
        logger.debug(INTEGRATION_NS, 'synapseApi + synapseCore aliases ready');
      } else {
        logger.warn(INTEGRATION_NS, 'OpportunityEngine or Supabase not available — skipping');
      }
    } catch (error) {
      logger.error(INTEGRATION_NS, 'Failed to initialize Opportunity Engine:', error);
      // Non-fatal: continue with network initialization
    }

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

    // ================================================================
    // SYNAPSE READY SIGNAL
    // ================================================================
    window.__SYNAPSE_READY__ = true;
    window.dispatchEvent(new CustomEvent('synapse:ready', { detail: { ts: Date.now() } }));
    logger.debug(INTEGRATION_NS, 'synapse:ready signal emitted');

    // Install tier probe for mobile debugging (idempotent, non-fatal)
    try {
      installUnifiedTierProbe(unifiedNetworkApi);
      logger.debug(INTEGRATION_NS, 'Unified Tier Probe installed');
    } catch (probeError) {
      logger.warn(INTEGRATION_NS, 'Unified Tier Probe installation failed:', probeError);
    }

// Emit custom event for other systems

    // Initialize Synapse filter bar (graph lens chips)
    try {
      initSynapseFilterUI(communityId);
    } catch (filterErr) {
      logger.warn(INTEGRATION_NS, 'Synapse filter UI init failed (non-fatal):', filterErr);
    }

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
 * Inject a filter context banner into the node panel after it renders.
 * Shows WHY this node is visible under the current filter.
 */
function _injectFilterContextBanner(node) {
  if (!node || !window.SynapseFilter) return;
  const ctx = window.SynapseFilter.getNodeContext(node.id);
  if (!ctx) return;

  const filterState = window.__synapseFilterState;
  if (!filterState || filterState.mode === 'all') return;

  const color = filterState.visuals?.glowColor || '#00e0ff';

  // Wait for panel to render, then inject banner
  setTimeout(() => {
    const panel = document.getElementById('node-panel');
    if (!panel) return;
    const body = panel.querySelector('.node-panel-body');
    if (!body) return;

    // Remove any existing filter banner
    const existing = body.querySelector('.synapse-filter-context-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'synapse-filter-context-banner';
    banner.style.cssText = `
      margin: 0 1rem 0.5rem; padding: 0.5rem 0.75rem;
      background: ${color}12; border: 1px solid ${color}40;
      border-radius: 8px; font-size: 0.8rem; color: ${color};
      display: flex; align-items: center; gap: 0.5rem;
    `;
    banner.innerHTML = `
      <i class="fas fa-filter" style="opacity:0.7"></i>
      <span><strong>${ctx.reason}</strong>${ctx.detail ? ' — ' + ctx.detail : ''}</span>
    `;

    // Insert after the close button / before the profile header
    const header = body.querySelector('div[style*="text-align: center"]');
    if (header) {
      body.insertBefore(banner, header);
    } else {
      body.prepend(banner);
    }
  }, 400); // Wait for panel async render
}

/**
 * Self-contained fallback panel used when window.openNodePanel is unavailable
 * (e.g. node-panel.js is a stub or failed to evaluate).
 */
async function _openFallbackPanel(node) {
  const supabase = window.supabase;
  if (!supabase) return;

  // Reuse or create the panel element
  let panel = document.getElementById('node-side-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'node-side-panel';
    panel.style.cssText = [
      'position:fixed', 'top:0', 'right:-450px', 'width:420px', 'height:100vh',
      'background:linear-gradient(135deg,rgba(10,14,39,.95),rgba(26,26,46,.95))',
      'border-left:2px solid rgba(0,224,255,.5)', 'backdrop-filter:blur(10px)',
      'z-index:2000', 'overflow-y:auto', 'transition:right .3s ease-out',
      'box-shadow:-5px 0 30px rgba(0,0,0,.5)'
    ].join(';');
    document.body.appendChild(panel);
  }

  // Close helper
  window.closeNodePanel = () => {
    panel.style.right = '-450px';
    document.body.classList.remove('node-panel-open');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  };

  // Slide in
  panel.style.right = '0';
  document.body.classList.add('node-panel-open');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);

  panel.innerHTML = `<div style="padding:2rem;text-align:center;color:#00e0ff">
    <i class="fas fa-spinner fa-spin" style="font-size:2rem"></i>
    <p style="margin-top:1rem">Loading...</p></div>`;

  try {
    const { data: profile, error } = await supabase
      .from('community').select('*').eq('id', node.id).single();
    if (error || !profile) throw error || new Error('Not found');

    const initials = (profile.name || '?').split(' ').map(n => n[0]).join('').toUpperCase();
    const skills = Array.isArray(profile.skills)
      ? profile.skills
      : typeof profile.skills === 'string' && profile.skills.trim()
        ? profile.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    panel.innerHTML = `
      <div style="overflow-y:auto;height:100%">
        <button onclick="window.closeNodePanel()" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:white;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem">
          <i class="fas fa-times"></i></button>
        <div style="text-align:center;padding:2rem 2rem 1rem">
          ${profile.image_url
            ? `<img loading="lazy" src="${profile.image_url}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid #00e0ff">`
            : `<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#00e0ff,#0080ff);display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:bold;color:white;margin:0 auto">${initials}</div>`}
          <h2 style="color:#00e0ff;font-size:1.6rem;margin:.75rem 0 .25rem">${profile.name || 'Unknown'}</h2>
          ${profile.user_role ? `<div style="color:#aaa;font-size:.9rem;margin-bottom:.5rem">${profile.user_role}</div>` : ''}
          ${profile.availability ? `<div style="display:inline-block;background:rgba(0,255,136,.2);color:#00ff88;padding:.2rem .75rem;border-radius:12px;font-size:.85rem">${profile.availability}</div>` : ''}
        </div>
        ${profile.bio ? `<div style="padding:0 1.5rem 1rem"><p style="color:#ddd;line-height:1.6;margin:0">${profile.bio}</p></div>` : ''}
        ${skills.length ? `
        <div style="padding:0 1.5rem 1rem">
          <div style="color:#00e0ff;font-weight:700;font-size:.9rem;margin-bottom:.5rem">SKILLS</div>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem">
            ${skills.map(s => `<span style="background:rgba(0,224,255,.1);color:#00e0ff;padding:.3rem .75rem;border-radius:8px;font-size:.85rem;border:1px solid rgba(0,224,255,.3)">${s}</span>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div style="position:sticky;bottom:0;background:linear-gradient(135deg,rgba(10,14,39,.98),rgba(26,26,46,.98));border-top:2px solid rgba(0,224,255,.3);padding:1rem 1.5rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <button onclick="window.openMessageForUser('${profile.id}')" style="padding:.75rem;background:linear-gradient(135deg,#00e0ff,#0080ff);border:none;border-radius:8px;color:white;font-weight:bold;cursor:pointer">
            <i class="fas fa-comment"></i> Message</button>
          <button data-action="connect" onclick="window.sendConnectionFromPanel('${profile.id}')" style="padding:.75rem;background:rgba(0,224,255,.1);border:1px solid rgba(0,224,255,.3);border-radius:8px;color:#00e0ff;font-weight:bold;cursor:pointer">
            <i class="fas fa-user-plus"></i> Connect</button>
        </div>
      </div>`;
  } catch (err) {
    panel.innerHTML = `<div style="padding:2rem;text-align:center;color:#ff6666">
      <button onclick="window.closeNodePanel()" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:white;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem"><i class="fas fa-times"></i></button>
      <i class="fas fa-exclamation-circle" style="font-size:2rem"></i>
      <p style="margin-top:1rem">Error loading profile</p></div>`;
  }
}

/**
 * Fallback Connect handler — used when node-panel.js hasn't loaded.
 */
window.sendConnectionFromPanel = window.sendConnectionFromPanel || async function(userId) {
  const supabase = window.supabase;
  if (!supabase) { alert('Not ready. Please try again.'); return; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { alert('Please log in first'); return; }
  if (userId === user.id) { alert("You can't connect to yourself"); return; }

  // Resolve current user's community row id
  const { data: me } = await supabase.from('community').select('id').eq('user_id', user.id).single();
  if (!me) { alert('Profile not found'); return; }

  const { data: existing } = await supabase
    .from('connections')
    .select('id, status')
    .or(`and(from_user_id.eq.${me.id},to_user_id.eq.${userId}),and(from_user_id.eq.${userId},to_user_id.eq.${me.id})`)
    .in('status', ['pending', 'accepted'])
    .limit(1);

  if (existing?.length > 0) { alert(`Connection already ${existing[0].status}`); return; }

  const { error } = await supabase.from('connections').insert({
    from_user_id: me.id,
    to_user_id: userId,
    status: 'pending',
    type: 'generic'
  });

  if (error) {
    alert(error.code === '23505' ? 'Connection request already exists' : 'Failed: ' + error.message);
    return;
  }

  // Update button in the open panel
  const btn = document.querySelector('#node-side-panel button[data-action="connect"]');
  if (btn) { btn.textContent = '✓ Request Sent'; btn.disabled = true; }
  console.log('✅ Connection request sent');
};

/**
 * Fallback Message handler — used when node-panel.js hasn't loaded.
 */
window.openMessageForUser = window.openMessageForUser || async function(userId) {
  if (typeof window.sendDirectMessage === 'function') {
    if (window.closeNodePanel) window.closeNodePanel();
    await window.sendDirectMessage(userId, '');
    return;
  }
  if (typeof window.openMessagingInterface === 'function') {
    if (window.closeNodePanel) window.closeNodePanel();
    await window.openMessagingInterface();
    return;
  }
  alert('Messaging is still loading. Please try again in a moment.');
};

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

  // Node tapped → open side panel
  unifiedNetworkApi.on('node-action-requested', ({ node }) => {
    if (!node) return;
    console.log('[NodePanel] node-action-requested — window.openNodePanel type:', typeof window.openNodePanel);
    if (typeof window.openNodePanel === 'function') {
      console.log('[NodePanel] using window.openNodePanel (full panel)');
      window.openNodePanel(node);

      // Inject filter context banner if a filter is active
      _injectFilterContextBanner(node);
    } else {
      console.warn('[NodePanel] window.openNodePanel not available — using fallback panel');
      _openFallbackPanel(node);
    }
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
    api: unifiedNetworkApi,
    openFallbackPanel: _openFallbackPanel,
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

// --- Late-join bootstrap ---
// If this module loads after profile-loaded / app-ready already fired (e.g.
// because the script was deferred), detect the existing state and init now.
// Otherwise, fall back to the event listener.
const _profileAlreadyResolved =
  window.currentUserProfile?.id ||
  window.communityUser?.id ||
  window.bootstrapSession?.communityUser?.id;

if (_profileAlreadyResolved) {
  // Profile is already available — init immediately on next microtask so the
  // rest of the module-level code finishes first.
  logger.info(INTEGRATION_NS, 'Profile already resolved on load — bootstrapping immediately');
  Promise.resolve().then(() => initUnifiedNetwork(null, 'synapse-svg').catch(() => {}));
} else {
  // Normal path: wait for the profile event.
  window.addEventListener('profile-loaded', () => {
    initUnifiedNetwork(null, 'synapse-svg').catch(() => {});
  }, { once: true });
}

