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
  navigationOverlay.className = 'suggestion-nav-draggable';
  
  // Position contextually based on viewport size
  const isMobile = window.innerWidth < 768;
  const defaultPosition = isMobile 
    ? { bottom: '1rem', left: '50%', transform: 'translateX(-50%)' }
    : { bottom: '2rem', right: '2rem' };
  
  navigationOverlay.style.cssText = `
    position: fixed;
    ${defaultPosition.bottom ? `bottom: ${defaultPosition.bottom};` : ''}
    ${defaultPosition.right ? `right: ${defaultPosition.right};` : ''}
    ${defaultPosition.left ? `left: ${defaultPosition.left};` : ''}
    ${defaultPosition.transform ? `transform: ${defaultPosition.transform};` : ''}
    background: linear-gradient(135deg, rgba(10,14,39,0.65), rgba(16,20,39,0.65));
    border: 2px solid rgba(0,224,255,0.25);
    border-radius: 16px;
    padding: 1.25rem;
    z-index: 10000;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
    min-width: ${isMobile ? '90vw' : '280px'};
    max-width: ${isMobile ? '90vw' : '350px'};
    animation: slideInUp 0.3s ease-out;
    cursor: move;
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
      
      .suggestion-nav-draggable {
        user-select: none;
        -webkit-user-select: none;
      }
      
      .nav-drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: move;
        padding: 0.5rem;
      }
      
      .nav-drag-handle:hover {
        background: rgba(255,255,255,0.03);
      }
      
      .nav-drag-indicator {
        width: 32px;
        height: 3px;
        background: rgba(255,255,255,0.2);
        border-radius: 2px;
      }
      
      .nav-button {
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: #000;
        padding: 0.6rem 1.25rem;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        justify-content: center;
        min-height: 44px;
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
        background: rgba(255,255,255,0.08);
        color: #fff;
      }
      
      .nav-button-secondary:hover {
        background: rgba(255,255,255,0.15);
        box-shadow: 0 5px 20px rgba(255,255,255,0.15);
      }
      
      @media (max-width: 768px) {
        .nav-button {
          font-size: 0.85rem;
          padding: 0.5rem 1rem;
        }
      }
    </style>
    
    <!-- Drag Handle -->
    <div class="nav-drag-handle">
      <div class="nav-drag-indicator"></div>
    </div>
    
    <div style="text-align: center; margin-bottom: 1rem; margin-top: 1.5rem;">
      <div style="color: #00e0ff; font-size: clamp(0.85rem, 3vw, 0.9rem); font-weight: 600; margin-bottom: 0.5rem;">
        Your Focus Today
      </div>
      <div style="color: rgba(255,255,255,0.6); font-size: clamp(0.75rem, 2.5vw, 0.85rem);">
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
        style="font-size: clamp(0.75rem, 2.5vw, 0.85rem); padding: 0.5rem 1rem;">
        <i class="fas fa-th-large"></i>
        View All
      </button>
      
      <button 
        class="nav-button nav-button-secondary" 
        onclick="window.hideNavigationOverlay()"
        style="font-size: clamp(0.75rem, 2.5vw, 0.85rem); padding: 0.5rem 1rem;">
        <i class="fas fa-times"></i>
        Close
      </button>
    </div>
    
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08);">
      <div style="color: rgba(255,255,255,0.4); font-size: clamp(0.7rem, 2vw, 0.75rem); text-align: center;">
        Complete this action, then click Next
      </div>
    </div>
  `;
  
  document.body.appendChild(navigationOverlay);
  
  // Initialize drag functionality
  initNavigationDrag(navigationOverlay);
  
  // Restore saved position if exists
  const savedPosition = loadNavigationPosition();
  if (savedPosition) {
    applyNavigationPosition(navigationOverlay, savedPosition);
  }
  
  console.log(`🎯 Navigation overlay shown (${current}/${total})`);
}

/**
 * Initialize drag functionality for navigation overlay
 */
function initNavigationDrag(overlay) {
  const dragHandle = overlay.querySelector('.nav-drag-handle');
  if (!dragHandle) return;

  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  // Mouse events
  dragHandle.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Touch events
  dragHandle.addEventListener('touchstart', dragStart, { passive: false });
  document.addEventListener('touchmove', drag, { passive: false });
  document.addEventListener('touchend', dragEnd);

  function dragStart(e) {
    if (e.type === 'touchstart') {
      initialX = e.touches[0].clientX - xOffset;
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
    }

    isDragging = true;
    overlay.style.transition = 'none';
    dragHandle.style.cursor = 'grabbing';
  }

  function drag(e) {
    if (!isDragging) return;

    e.preventDefault();

    if (e.type === 'touchmove') {
      currentX = e.touches[0].clientX - initialX;
      currentY = e.touches[0].clientY - initialY;
    } else {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
    }

    xOffset = currentX;
    yOffset = currentY;

    // Keep overlay within viewport bounds
    const rect = overlay.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    // Constrain to viewport
    xOffset = Math.max(0, Math.min(xOffset, maxX));
    yOffset = Math.max(0, Math.min(yOffset, maxY));

    setNavigationTranslate(xOffset, yOffset, overlay);
  }

  function dragEnd(e) {
    if (!isDragging) return;

    initialX = currentX;
    initialY = currentY;

    isDragging = false;
    dragHandle.style.cursor = 'move';
    
    // Save position to localStorage
    saveNavigationPosition(xOffset, yOffset);
  }

  function setNavigationTranslate(xPos, yPos, el) {
    el.style.left = `${xPos}px`;
    el.style.top = `${yPos}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  }
}

/**
 * Save navigation overlay position
 */
function saveNavigationPosition(x, y) {
  try {
    localStorage.setItem('suggestion_nav_position', JSON.stringify({ x, y }));
  } catch (e) {
    console.warn('Could not save navigation position:', e);
  }
}

/**
 * Load navigation overlay position
 */
function loadNavigationPosition() {
  try {
    const saved = localStorage.getItem('suggestion_nav_position');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.warn('Could not load navigation position:', e);
    return null;
  }
}

/**
 * Apply saved position to overlay
 */
function applyNavigationPosition(overlay, position) {
  overlay.style.left = `${position.x}px`;
  overlay.style.top = `${position.y}px`;
  overlay.style.right = 'auto';
  overlay.style.bottom = 'auto';
  overlay.style.transform = 'none';
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
