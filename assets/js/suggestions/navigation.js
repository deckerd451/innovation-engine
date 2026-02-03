// ================================================================
// SUGGESTION NAVIGATION - Cycle through daily suggestions
// ================================================================
// Provides "Next" button to guide users through their daily suggestions
// ================================================================

console.log('%c🎯 Suggestion Navigation - Loading', 'color:#0f8; font-weight:bold;');

let currentSuggestionIndex = 0;
let allSuggestions = [];
let navigationOverlay = null;

/**
 * Initialize suggestion navigation system
 */
export function initSuggestionNavigation(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    console.warn('⚠️ No suggestions to navigate');
    return;
  }
  
  allSuggestions = suggestions;
  currentSuggestionIndex = 0;
  
  console.log(`🎯 Initialized navigation with ${allSuggestions.length} suggestions`);
}

/**
 * Show navigation overlay with Next button
 */
export function showNavigationOverlay() {
  if (allSuggestions.length === 0) return;
  
  // Remove existing overlay if present
  hideNavigationOverlay();
  
  const current = currentSuggestionIndex + 1;
  const total = allSuggestions.length;
  const hasNext = currentSuggestionIndex < allSuggestions.length - 1;
  const hasPrev = currentSuggestionIndex > 0;
  
  // Create overlay
  navigationOverlay = document.createElement('div');
  navigationOverlay.id = 'suggestion-navigation-overlay';
  navigationOverlay.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(16,20,39,0.95));
    border: 2px solid rgba(0,224,255,0.4);
    border-radius: 16px;
    padding: 1.5rem;
    z-index: 10000;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
    min-width: 280px;
    animation: slideInUp 0.3s ease-out;
  `;
  
  navigationOverlay.innerHTML = `
    <style>
      @keyframes slideInUp {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      .nav-button {
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: #000;
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        justify-content: center;
      }
      
      .nav-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 20px rgba(0,224,255,0.4);
      }
      
      .nav-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }
      
      .nav-button-secondary {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }
      
      .nav-button-secondary:hover {
        background: rgba(255,255,255,0.2);
        box-shadow: 0 5px 20px rgba(255,255,255,0.2);
      }
    </style>
    
    <div style="text-align: center; margin-bottom: 1rem;">
      <div style="color: #00e0ff; font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem;">
        Your Focus Today
      </div>
      <div style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">
        Suggestion ${current} of ${total}
      </div>
    </div>
    
    <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
      <button 
        class="nav-button nav-button-secondary" 
        onclick="window.navigateToPreviousSuggestion()"
        ${!hasPrev ? 'disabled' : ''}
        style="flex: 1;">
        <i class="fas fa-chevron-left"></i>
        Previous
      </button>
      
      <button 
        class="nav-button" 
        onclick="window.navigateToNextSuggestion()"
        ${!hasNext ? 'disabled' : ''}
        style="flex: 1;">
        Next
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    
    <div style="display: flex; gap: 0.5rem; justify-content: center;">
      <button 
        class="nav-button nav-button-secondary" 
        onclick="window.returnToStartPanel()"
        style="font-size: 0.85rem; padding: 0.5rem 1rem;">
        <i class="fas fa-th-large"></i>
        View All
      </button>
      
      <button 
        class="nav-button nav-button-secondary" 
        onclick="window.hideNavigationOverlay()"
        style="font-size: 0.85rem; padding: 0.5rem 1rem;">
        <i class="fas fa-times"></i>
        Close
      </button>
    </div>
    
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="color: rgba(255,255,255,0.5); font-size: 0.75rem; text-align: center;">
        Complete this action, then click Next
      </div>
    </div>
  `;
  
  document.body.appendChild(navigationOverlay);
  console.log(`🎯 Navigation overlay shown (${current}/${total})`);
}

/**
 * Hide navigation overlay
 */
export function hideNavigationOverlay() {
  if (navigationOverlay) {
    navigationOverlay.remove();
    navigationOverlay = null;
  }
  
  // Reset filter to show all nodes when closing navigation
  if (window.filterSynapseByCategory && typeof window.filterSynapseByCategory === 'function') {
    window.filterSynapseByCategory('all');
    console.log('🔄 Reset synapse filter to show all nodes');
  }
}

/**
 * Navigate to next suggestion
 */
export async function navigateToNextSuggestion() {
  if (currentSuggestionIndex >= allSuggestions.length - 1) {
    console.log('🎯 Already at last suggestion');
    return;
  }
  
  currentSuggestionIndex++;
  const nextSuggestion = allSuggestions[currentSuggestionIndex];
  
  console.log(`🎯 Navigating to suggestion ${currentSuggestionIndex + 1}/${allSuggestions.length}:`, nextSuggestion.message);
  
  // Execute the suggestion action
  await executeSuggestionAction(nextSuggestion);
  
  // Update overlay
  showNavigationOverlay();
}

/**
 * Navigate to previous suggestion
 */
export async function navigateToPreviousSuggestion() {
  if (currentSuggestionIndex <= 0) {
    console.log('🎯 Already at first suggestion');
    return;
  }
  
  currentSuggestionIndex--;
  const prevSuggestion = allSuggestions[currentSuggestionIndex];
  
  console.log(`🎯 Navigating to suggestion ${currentSuggestionIndex + 1}/${allSuggestions.length}:`, prevSuggestion.message);
  
  // Execute the suggestion action
  await executeSuggestionAction(prevSuggestion);
  
  // Update overlay
  showNavigationOverlay();
}

/**
 * Execute a suggestion's action
 */
async function executeSuggestionAction(suggestion) {
  const handler = suggestion.handler || '';
  const data = suggestion.data || {};
  
  // Import the handler function from start-integration.js
  if (window.handleSuggestionCTA && typeof window.handleSuggestionCTA === 'function') {
    await window.handleSuggestionCTA(handler, data);
  } else {
    console.warn('⚠️ handleSuggestionCTA not available');
  }
}

/**
 * Return to START panel to view all suggestions
 */
export function returnToStartPanel() {
  hideNavigationOverlay();
  
  // Open START panel
  if (window.EnhancedStartUI && window.EnhancedStartUI.open) {
    window.EnhancedStartUI.open();
  } else if (window.openStartModal) {
    window.openStartModal();
  } else {
    console.warn('⚠️ Cannot open START panel');
  }
}

/**
 * Set current suggestion index (for when user clicks a specific suggestion)
 */
export function setCurrentSuggestionIndex(index) {
  if (index >= 0 && index < allSuggestions.length) {
    currentSuggestionIndex = index;
    console.log(`🎯 Current suggestion set to ${currentSuggestionIndex + 1}/${allSuggestions.length}`);
  }
}

/**
 * Get current suggestion
 */
export function getCurrentSuggestion() {
  return allSuggestions[currentSuggestionIndex] || null;
}

// ================================================================
// GLOBAL EXPORTS
// ================================================================

window.initSuggestionNavigation = initSuggestionNavigation;
window.showNavigationOverlay = showNavigationOverlay;
window.hideNavigationOverlay = hideNavigationOverlay;
window.navigateToNextSuggestion = navigateToNextSuggestion;
window.navigateToPreviousSuggestion = navigateToPreviousSuggestion;
window.returnToStartPanel = returnToStartPanel;
window.setCurrentSuggestionIndex = setCurrentSuggestionIndex;
window.getCurrentSuggestion = getCurrentSuggestion;

console.log('✅ Suggestion Navigation loaded');
