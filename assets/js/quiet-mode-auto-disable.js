// ================================================================
// Quiet Mode Auto-Disable (Unified-safe)
// ================================================================
// Automatically disables Quiet Mode when user interacts with:
// - Filter buttons (All, People, Organizations, Projects, Themes)
// - Search bar (focus + typing)
// - Network filter events
//
// Key goals:
// 1) Do NOT assume Quiet Mode is enabled by default
// 2) Keep state in sync with the EXISTING persisted preference key
// 3) Avoid touching legacy D3 handles unless they exist
// 4) When legacy handles are missing (unified renderer), emit an event only
// ================================================================

console.log('%c🔇 Quiet Mode Auto-Disable Loading...', 'color:#0ff; font-weight: bold; font-size: 16px');

let synapseCore = null;
let initialized = false;

// ✅ Use the key you actually have in localStorage
// localStorage["quiet-mode-enabled"] = "true" | "false"
const QUIET_MODE_KEY = 'quiet-mode-enabled';

function readQuietPref() {
  try {
    return localStorage.getItem(QUIET_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeQuietPref(enabled) {
  try {
    localStorage.setItem(QUIET_MODE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

// Internal state mirrors persisted preference (never defaults to true)
let quietModeEnabled = readQuietPref();

function log(...args) {
  console.log('🔇', ...args);
}

function warn(...args) {
  console.warn('🔇', ...args);
}

/**
 * Initialize auto-disable functionality
 * @param {Object} core - Synapse core instance (may be legacy D3 core or unified core)
 */
export function initQuietModeAutoDisable(core) {
  synapseCore = core || null;

  if (initialized) {
    log('Quiet Mode Auto-Disable already initialized, skipping');
    return;
  }
  initialized = true;

  // Sync internal state to persisted preference on init
  quietModeEnabled = readQuietPref();
  log('Persisted quiet mode state:', quietModeEnabled);

  log('Setting up quiet mode auto-disable listeners');

  setupFilterButtonListeners();
  setupSearchBarListeners();
  setupNetworkFilterListeners();

  log('✅ Quiet mode auto-disable ready');
}

/**
 * Setup listeners for filter buttons
 */
function setupFilterButtonListeners() {
  const filterSelectors = [
    '[data-filter="all"]',
    '[data-filter="people"]',
    '[data-filter="organizations"]',
    '[data-filter="projects"]',
    '[data-filter="themes"]',
    '.filter-btn',
    '.category-toggle',
    '.view-toggle',
    '#filter-all',
    '#filter-people',
    '#filter-organizations',
    '#filter-projects',
    '#filter-themes'
  ];

  const attachListeners = (root = document) => {
    let attached = 0;

    filterSelectors.forEach((selector) => {
      const buttons = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      buttons.forEach((button) => {
        if (!button || !button.dataset) return;
        if (button.dataset.quietModeListener) return;

        button.dataset.quietModeListener = 'true';
        button.addEventListener('click', handleFilterButtonClick, { passive: true });
        attached += 1;
      });
    });

    if (attached > 0) log(`Attached ${attached} filter listeners`);
    return attached;
  };

  // Initial attach + retry loop until buttons appear
  const checkForButtons = () => {
    const count = attachListeners(document);
    if (count === 0) setTimeout(checkForButtons, 500);
  };
  checkForButtons();

  // Observe DOM for dynamically added buttons
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node && node.nodeType === 1) attachListeners(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

/**
 * Setup listeners for search bar usage
 */
function setupSearchBarListeners() {
  const searchSelectors = [
    '#synapse-search',
    '#search-everything',
    'input[placeholder*="Search"]',
    'input[placeholder*="search"]',
    '.search-input',
    '#quiet-search-input'
  ];

  const attachListeners = () => {
    let found = 0;

    searchSelectors.forEach((selector) => {
      const inputs = document.querySelectorAll(selector);
      if (!inputs || inputs.length === 0) return;

      inputs.forEach((input) => {
        if (!input || !input.dataset) return;
        if (input.dataset.quietModeListener) return;

        input.dataset.quietModeListener = 'true';
        input.addEventListener('input', handleSearchInput, { passive: true });
        input.addEventListener('focus', handleSearchFocus, { passive: true });

        found += 1;
      });
    });

    if (found > 0) log(`Attached ${found} search listeners`);
    return found;
  };

  const checkForSearch = () => {
    const found = attachListeners();
    if (found === 0) setTimeout(checkForSearch, 500);
  };

  checkForSearch();
}

/**
 * Setup listeners for network filter events
 */
function setupNetworkFilterListeners() {
  window.addEventListener('network-filters-changed', handleNetworkFilterChange);
  window.addEventListener('synapse-filter-changed', handleNetworkFilterChange);
  log('Listening for network filter events');
}

/**
 * Event handlers
 */
function handleFilterButtonClick() {
  log('Filter button clicked - disabling quiet mode');
  disableQuietMode('filter_button');
}

function handleSearchInput(event) {
  const query = (event?.target?.value || '').trim();
  if (query.length > 0) {
    log('Search input detected - disabling quiet mode');
    disableQuietMode('search_input');
  }
}

function handleSearchFocus() {
  log('Search focused - disabling quiet mode');
  disableQuietMode('search_focus');
}

function handleNetworkFilterChange() {
  log('Network filter changed - disabling quiet mode');
  disableQuietMode('network_filter');
}

/**
 * Disable quiet mode and restore full visualization
 */
function disableQuietMode(reason) {
  // Always re-sync from persisted preference to avoid drift
  quietModeEnabled = readQuietPref();

  if (!quietModeEnabled) {
    log('Quiet mode already disabled');
    return;
  }

  quietModeEnabled = false;
  writeQuietPref(false);

  log(`Disabling quiet mode (reason: ${reason})`);

  // Show notification (if available)
  if (typeof window.showSynapseNotification === 'function') {
    window.showSynapseNotification('Quiet mode disabled - showing full network', 'info');
  }

  // Restore full visualization (legacy) OR emit unified-safe event
  restoreFullVisualization(reason);

  // Emit events for other systems
  window.dispatchEvent(new CustomEvent('quiet-mode-disabled', { detail: { reason } }));
  window.dispatchEvent(new CustomEvent('quiet-mode-change', { detail: { enabled: false, reason } }));
}

/**
 * Restore full network visualization
 * - If legacy D3 handles exist: restore via nodeEls/linkEls
 * - Otherwise: avoid DOM manipulation and rely on listeners reacting to quiet-mode-change
 */
function restoreFullVisualization(reason) {
  if (!synapseCore) {
    warn('Synapse core not available; cannot restore via legacy core. Emitting quiet-mode-change only.');
    return;
  }

  const nodeEls = synapseCore.nodeEls;
  const linkEls = synapseCore.linkEls;

  // Unified mode: legacy handles absent -> do not attempt D3 operations
  if (!nodeEls || typeof window.d3 === 'undefined') {
    warn('Legacy D3 handles not available (unified renderer likely). Skipping DOM restore.');
    return;
  }

  log('Restoring full network visualization (legacy D3)');

  // Show all nodes
  nodeEls.each(function () {
    const node = window.d3.select(this);
    node
      .style('display', 'block')
      .transition()
      .duration(300)
      .style('opacity', 1);

    node
      .select('text')
      .transition()
      .duration(300)
      .attr('opacity', 1);
  });

  // Show all links
  if (linkEls) {
    linkEls.each(function () {
      const link = window.d3.select(this);
      link
        .style('display', 'block')
        .transition()
        .duration(300)
        .attr('opacity', 0.6);
    });
  }

  showHiddenUI();

  log('✅ Full visualization restored (legacy D3)');
}

/**
 * Show UI elements that were hidden by quiet mode
 */
function showHiddenUI() {
  const modeSwitcher = document.getElementById('synapse-mode-switcher');
  if (modeSwitcher) modeSwitcher.style.display = '';

  const categoryToggles = document.querySelectorAll('.category-toggle, .filter-button, .view-toggle');
  categoryToggles.forEach((el) => (el.style.display = ''));

  const panels = document.querySelectorAll('.floating-panel, .sidebar');
  panels.forEach((el) => {
    if (!el.classList.contains('hidden')) el.style.display = '';
  });

  log('Hidden UI elements restored');
}

/**
 * Enable quiet mode (manual control)
 * Note: This does NOT apply quiet mode itself. It persists preference + emits event.
 */
export function enableQuietMode() {
  quietModeEnabled = true;
  writeQuietPref(true);

  log('Quiet mode enabled (persisted)');

  window.dispatchEvent(
    new CustomEvent('quiet-mode-change', {
      detail: { enabled: true, reason: 'manual_enable' }
    })
  );
}

/**
 * Check if quiet mode is currently enabled
 */
export function isQuietModeEnabled() {
  quietModeEnabled = readQuietPref();
  return quietModeEnabled;
}

// Global access (debug/admin)
window.QuietModeAutoDisable = {
  init: initQuietModeAutoDisable,
  enable: enableQuietMode,
  disable: () => disableQuietMode('manual'),
  isEnabled: isQuietModeEnabled
};

export default {
  init: initQuietModeAutoDisable,
  enable: enableQuietMode,
  disable: () => disableQuietMode('manual'),
  isEnabled: isQuietModeEnabled
};
