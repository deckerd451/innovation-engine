// ================================================================
// Quiet Mode Auto-Disable
// ================================================================
// Automatically disables quiet mode when user interacts with:
// - Filter buttons (All, People, Organizations, Projects, Themes)
// - Search bar
// ================================================================

console.log('%c🔇 Quiet Mode Auto-Disable Loading...', 'color:#0ff; font-weight: bold; font-size: 16px');

let quietModeEnabled = true;
let synapseCore = null;

/**
 * Initialize auto-disable functionality
 * @param {Object} core - Synapse core instance
 */
export function initQuietModeAutoDisable(core) {
  synapseCore = core;
  
  console.log('🔇 Setting up quiet mode auto-disable listeners');
  
  // Listen for filter button clicks
  setupFilterButtonListeners();
  
  // Listen for search bar usage
  setupSearchBarListeners();
  
  // Listen for network filter changes
  setupNetworkFilterListeners();
  
  console.log('✅ Quiet mode auto-disable ready');
}

/**
 * Setup listeners for filter buttons (All, People, Organizations, Projects, Themes)
 */
function setupFilterButtonListeners() {
  // Wait for DOM to be ready
  const checkForButtons = () => {
    // Look for common filter button selectors
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
    
    let foundButtons = false;
    
    filterSelectors.forEach(selector => {
      const buttons = document.querySelectorAll(selector);
      if (buttons.length > 0) {
        foundButtons = true;
        buttons.forEach(button => {
          // Avoid duplicate listeners
          if (!button.dataset.quietModeListener) {
            button.dataset.quietModeListener = 'true';
            button.addEventListener('click', handleFilterButtonClick);
            console.log(`🔇 Added listener to filter button: ${selector}`);
          }
        });
      }
    });
    
    // If no buttons found yet, try again in a moment
    if (!foundButtons) {
      setTimeout(checkForButtons, 500);
    }
  };
  
  // Start checking
  checkForButtons();
  
  // Also listen for dynamically added buttons
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check if the added node or its children are filter buttons
            const buttons = node.querySelectorAll ? 
              node.querySelectorAll('.filter-btn, .category-toggle, .view-toggle') : 
              [];
            
            buttons.forEach(button => {
              if (!button.dataset.quietModeListener) {
                button.dataset.quietModeListener = 'true';
                button.addEventListener('click', handleFilterButtonClick);
                console.log('🔇 Added listener to dynamically added filter button');
              }
            });
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

/**
 * Setup listeners for search bar
 */
function setupSearchBarListeners() {
  // Wait for search bar to be ready
  const checkForSearchBar = () => {
    const searchSelectors = [
      '#synapse-search',
      '#search-everything',
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      '.search-input',
      '#quiet-search-input'
    ];
    
    let foundSearch = false;
    
    searchSelectors.forEach(selector => {
      const searchInputs = document.querySelectorAll(selector);
      if (searchInputs.length > 0) {
        foundSearch = true;
        searchInputs.forEach(input => {
          // Avoid duplicate listeners
          if (!input.dataset.quietModeListener) {
            input.dataset.quietModeListener = 'true';
            
            // Listen for input (typing)
            input.addEventListener('input', handleSearchInput);
            
            // Listen for focus (clicking into search)
            input.addEventListener('focus', handleSearchFocus);
            
            console.log(`🔇 Added listeners to search input: ${selector}`);
          }
        });
      }
    });
    
    // If no search bar found yet, try again
    if (!foundSearch) {
      setTimeout(checkForSearchBar, 500);
    }
  };
  
  // Start checking
  checkForSearchBar();
}

/**
 * Setup listeners for network filter events
 */
function setupNetworkFilterListeners() {
  // Listen for custom network filter events
  window.addEventListener('network-filters-changed', handleNetworkFilterChange);
  window.addEventListener('synapse-filter-changed', handleNetworkFilterChange);
  window.addEventListener('skills-filter-applied', handleSkillsFilterApplied);
  
  console.log('🔇 Listening for network filter events');
}

/**
 * Handle filter button click
 */
function handleFilterButtonClick(event) {
  console.log('🔇 Filter button clicked - disabling quiet mode');
  disableQuietMode('filter_button');
}

/**
 * Handle search input
 */
function handleSearchInput(event) {
  const query = event.target.value.trim();
  
  // Only disable if user has typed something
  if (query.length > 0) {
    console.log('🔇 Search input detected - disabling quiet mode');
    disableQuietMode('search_input');
  }
}

/**
 * Handle search focus
 */
function handleSearchFocus(event) {
  console.log('🔇 Search focused - disabling quiet mode');
  disableQuietMode('search_focus');
}

/**
 * Handle network filter change
 */
function handleNetworkFilterChange(event) {
  console.log('🔇 Network filter changed - disabling quiet mode');
  disableQuietMode('network_filter');
}

/**
 * Handle skills filter applied
 */
function handleSkillsFilterApplied(event) {
  const detail = event.detail || {};
  
  // Only disable if skills are actually selected
  if (detail.active && detail.skills && detail.skills.length > 0) {
    console.log('🔇 Skills filter applied - disabling quiet mode');
    disableQuietMode('skills_filter');
  }
}

/**
 * Disable quiet mode and restore full visualization
 * @param {string} reason - Why quiet mode was disabled
 */
function disableQuietMode(reason) {
  if (!quietModeEnabled) {
    console.log('🔇 Quiet mode already disabled');
    return;
  }
  
  quietModeEnabled = false;
  
  console.log(`🔇 Disabling quiet mode (reason: ${reason})`);
  
  // Show notification
  if (typeof window.showSynapseNotification === 'function') {
    window.showSynapseNotification(
      'Quiet mode disabled - showing full network',
      'info'
    );
  }
  
  // Restore full visualization
  restoreFullVisualization();
  
  // Emit event for other systems
  window.dispatchEvent(new CustomEvent('quiet-mode-disabled', {
    detail: { reason }
  }));
}

/**
 * Restore full network visualization
 */
function restoreFullVisualization() {
  if (!synapseCore) {
    console.warn('🔇 Synapse core not available');
    return;
  }
  
  const { nodeEls, linkEls } = synapseCore;
  
  if (!nodeEls) {
    console.warn('🔇 No nodes to restore');
    return;
  }
  
  console.log('🔇 Restoring full network visualization');
  
  // Show all nodes
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    
    node
      .style('display', 'block')
      .transition()
      .duration(300)
      .style('opacity', 1);
    
    // Show labels
    node.select('text')
      .transition()
      .duration(300)
      .attr('opacity', 1);
  });
  
  // Show all links
  if (linkEls) {
    linkEls.each(function(d) {
      const link = window.d3.select(this);
      
      link
        .style('display', 'block')
        .transition()
        .duration(300)
        .attr('opacity', 0.6);
    });
  }
  
  // Show previously hidden UI elements
  showHiddenUI();
  
  console.log('✅ Full visualization restored');
}

/**
 * Show UI elements that were hidden by quiet mode
 */
function showHiddenUI() {
  // Show mode switcher
  const modeSwitcher = document.getElementById('synapse-mode-switcher');
  if (modeSwitcher) {
    modeSwitcher.style.display = '';
  }
  
  // Show category toggles
  const categoryToggles = document.querySelectorAll('.category-toggle, .filter-button, .view-toggle');
  categoryToggles.forEach(el => {
    el.style.display = '';
  });
  
  // Show panels/sidebars (but not all - be selective)
  const panels = document.querySelectorAll('.floating-panel, .sidebar');
  panels.forEach(el => {
    // Only show if it was meant to be visible
    if (!el.classList.contains('hidden')) {
      el.style.display = '';
    }
  });
  
  console.log('🔇 Hidden UI elements restored');
}

/**
 * Re-enable quiet mode (for testing or manual control)
 */
export function enableQuietMode() {
  quietModeEnabled = true;
  console.log('🔇 Quiet mode re-enabled');
  
  // Re-apply quiet mode if synapse core is available
  if (synapseCore && window.QuietMode) {
    window.QuietMode.apply(synapseCore);
  }
}

/**
 * Check if quiet mode is currently enabled
 */
export function isQuietModeEnabled() {
  return quietModeEnabled;
}

// Export for global access
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
