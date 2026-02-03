// ================================================================
// DAILY SUGGESTIONS - START UI INTEGRATION
// ================================================================
// Integrates the Daily Suggestions Engine with the existing START UI
// Replaces/enhances the current recommendation logic
// ================================================================

console.log('%c🔗 Daily Suggestions START Integration - Loading', 'color:#0f8; font-weight:bold;');

// Guard to prevent double initialization
let isEnhanced = false;

/**
 * Enhance the START Daily Digest with personalized suggestions
 */
async function enhanceStartDailyDigest() {
  // Prevent double initialization
  if (isEnhanced) {
    console.log('🔗 START Daily Digest already enhanced, skipping...');
    return;
  }
  
  // Wait for Daily Suggestions Engine to be ready
  if (!window.DailySuggestionsUI) {
    console.warn('⚠️ Daily Suggestions Engine not ready yet');
    return;
  }
  
  // Wait for StartDailyDigest to be ready
  if (!window.StartDailyDigest) {
    console.warn('⚠️ StartDailyDigest not ready yet');
    return;
  }
  
  console.log('🔗 Enhancing START Daily Digest with personalized suggestions...');
  
  // Mark as enhanced
  isEnhanced = true;
  
  // Store original render method
  const originalRender = window.StartDailyDigest.render.bind(window.StartDailyDigest);
  
  // Override render method to include suggestions
  window.StartDailyDigest.render = async function(data) {
    // Call original render
    let html = await originalRender(data);
    
    // Get personalized suggestions
    try {
      const suggestions = await window.DailySuggestionsUI.getSuggestionsForStartUI();
      
      if (suggestions && suggestions.length > 0) {
        // Initialize navigation system with suggestions
        if (window.initSuggestionNavigation && typeof window.initSuggestionNavigation === 'function') {
          window.initSuggestionNavigation(suggestions);
        }
        
        // Wrap the original content and add suggestions after
        const suggestionsHTML = renderSuggestionsSection(suggestions);
        
        // Simply append suggestions at the end
        html = `
          <div class="daily-digest-wrapper">
            ${html}
            ${suggestionsHTML}
          </div>
        `;
      }
    } catch (err) {
      console.error('❌ Failed to add suggestions to START UI:', err);
    }
    
    return html;
  };
  
  console.log('✅ START Daily Digest enhanced with personalized suggestions');
}

/**
 * Render suggestions section for START UI
 */
function renderSuggestionsSection(suggestions) {
  // Limit to top 5-8 suggestions for UI
  const displaySuggestions = suggestions.slice(0, 8);
  
  return `
    <div style="margin-top: 2rem; margin-bottom: 2rem; clear: both;">
      <div style="display: flex; flex-direction: column; gap: 1rem; position: relative; z-index: 1;">
        ${displaySuggestions.map(suggestion => renderSuggestionCard(suggestion)).join('')}
      </div>
      
      ${suggestions.length > 8 ? `
        <div style="text-align: center; margin-top: 1rem;">
          <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            +${suggestions.length - 8} more suggestions available
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render a single suggestion card
 */
function renderSuggestionCard(suggestion) {
  const color = suggestion.color || '#00e0ff';
  const icon = suggestion.icon || 'star';
  const message = suggestion.message || 'Check this out';
  const detail = suggestion.detail || '';
  const action = suggestion.action || 'View';
  const handler = suggestion.handler || '';
  const data = suggestion.data || {};
  
  // Encode data for onclick handler
  const dataJson = JSON.stringify(data).replace(/"/g, '&quot;');
  
  return `
    <div class="suggestion-card" 
         data-handler="${handler}" 
         data-suggestion-data='${dataJson}'
         style="
      background: linear-gradient(135deg, ${color}15, rgba(0,0,0,0.1));
      border: 2px solid ${color}40;
      border-radius: 12px;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      isolation: isolate;
      margin-bottom: 0.5rem;
    "
    onclick="handleSuggestionClick('${handler}', this)"
    onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${color}'; this.style.boxShadow='0 8px 25px ${color}30';"
    onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${color}40'; this.style.boxShadow='none';">
      
      <!-- Why button -->
      <button 
        onclick="event.stopPropagation(); showSuggestionWhy(this.closest('.suggestion-card'))"
        style="
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 28px;
          height: 28px;
          background: ${color}20;
          border: 1px solid ${color}40;
          border-radius: 50%;
          color: ${color};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
          font-weight: 700;
          transition: all 0.2s;
          z-index: 2;
        "
        onmouseenter="this.style.background='${color}40'; this.style.borderColor='${color}';"
        onmouseleave="this.style.background='${color}20'; this.style.borderColor='${color}40';"
        title="Why this suggestion?">
        ?
      </button>
      
      <div style="display: flex; align-items: start; gap: 1rem; padding-right: 2rem;">
        <div style="
          width: 48px;
          height: 48px;
          background: ${color}20;
          border: 2px solid ${color}60;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.5rem;"></i>
        </div>
        
        <div style="flex: 1; min-width: 0;">
          <div style="color: #fff; font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem; word-wrap: break-word;">
            ${message}
          </div>
          ${detail ? `
            <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.75rem; word-wrap: break-word;">
              ${detail}
            </div>
          ` : ''}
          <div style="
            display: inline-block;
            background: ${color};
            color: #000;
            padding: 0.4rem 0.9rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
          ">
            ${action} →
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * UUID validation helper
 */
function isUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Handle suggestion CTA click - routes to appropriate Synapse view
 */
async function handleSuggestionCTA(handler, data) {
  console.log('🎯 Suggestion CTA clicked:', { handler, data });
  
  const suggestionType = data.suggestionType || data.type;
  const targetId = data.targetId;
  const source = data.source || 'heuristic';
  const originalType = data.original_type; // Preserved from store.js
  const subtype = data.subtype; // Preserved from store.js
  
  // Validate targetId if present
  if (targetId && !isUUID(targetId) && !targetId.startsWith('theme:')) {
    console.warn('⚠️ Invalid targetId format:', targetId);
  }
  
  // Show navigation overlay after executing action
  // Use setTimeout to show after Synapse opens
  setTimeout(() => {
    if (window.showNavigationOverlay && typeof window.showNavigationOverlay === 'function') {
      window.showNavigationOverlay();
    }
  }, 800);
  
  // Open Synapse view first
  if (window.synapseApi && window.synapseApi.open) {
    window.synapseApi.open();
  } else {
    console.warn('⚠️ synapseApi not available, falling back to showView');
    if (window.showView) {
      window.showView('synapse');
    }
  }
  
  // Wait for Synapse to open, then route based on type
  setTimeout(async () => {
    if (!window.synapseApi) {
      console.warn('⚠️ synapseApi not available after opening Synapse');
      return;
    }
    
    // Check if this is actually a coordination suggestion (mapped to 'theme' in DB)
    const isCoordination = originalType === 'coordination' || source === 'coordination';
    
    // Route by suggestion type
    if (isCoordination) {
      // Coordination suggestions route based on subtype
      console.log('🌐 Routing coordination suggestion:', subtype);
      
      // Special case: "no_signals" means intelligence layer is active but no patterns detected
      // Show pathway animations to help user discover connections
      if (subtype === 'no_signals') {
        console.log('ℹ️ Intelligence Layer Active (no signals) - showing pathway recommendations');
        
        // Show pathway animations (curved yellow pulsating lines)
        if (window.showRecommendationPathways && typeof window.showRecommendationPathways === 'function') {
          console.log('🌟 Triggering pathway animations...');
          await window.showRecommendationPathways(5); // Show top 5 recommendations
        } else if (window.illuminatePathways && typeof window.illuminatePathways === 'function') {
          console.log('🌟 Triggering illuminate pathways...');
          await window.illuminatePathways({ limit: 5, clearFirst: true });
        } else {
          console.warn('⚠️ Pathway animation functions not available');
          // Fallback: just center on user
          window.synapseApi.showActivity();
        }
      } else if (subtype === 'theme_convergence' && targetId) {
        window.synapseApi.focusTheme(targetId);
      } else if (subtype === 'bridge_opportunity' && targetId) {
        window.synapseApi.focusNode(targetId);
      } else if (subtype === 'momentum_shift' && targetId) {
        window.synapseApi.focusNode(targetId);
      } else if (subtype === 'conversation_to_action') {
        window.synapseApi.showActivity();
      } else {
        // Generic coordination - show activity view
        window.synapseApi.showActivity();
      }
      
    } else if (suggestionType === 'person' && targetId) {
      console.log('👤 Routing to person:', targetId);
      
      // Discovery Mode is always on now - no need to toggle
      console.log('🌐 Discovery Mode: Always enabled');
      
      window.synapseApi.focusNode(targetId);
      
    } else if ((suggestionType === 'project' || suggestionType === 'project_join' || suggestionType === 'project_recruit') && targetId) {
      console.log('💡 Routing to project:', targetId);
      window.synapseApi.focusNode(targetId);
      
    } else if (suggestionType === 'theme' && targetId) {
      console.log('🎯 Routing to theme:', targetId);
      window.synapseApi.focusTheme(targetId);
      
    } else if (suggestionType === 'org' && targetId) {
      console.log('🏢 Routing to organization:', targetId);
      window.synapseApi.focusNode(targetId);
      
    } else {
      console.warn('⚠️ Unknown suggestion type or missing targetId:', { suggestionType, targetId, originalType, subtype });
      // Fallback: show activity view
      window.synapseApi.showActivity();
    }
  }, 150); // Short delay to let Synapse view open
}

/**
 * Handle suggestion card click
 */
window.handleSuggestionClick = function(handler, element) {
  const dataAttr = element.getAttribute('data-suggestion-data');
  const data = dataAttr ? JSON.parse(dataAttr) : {};
  
  // Get the index of this suggestion for navigation
  const allCards = document.querySelectorAll('.suggestion-card');
  const index = Array.from(allCards).indexOf(element);
  
  // Set current suggestion index for navigation
  if (window.setCurrentSuggestionIndex && typeof window.setCurrentSuggestionIndex === 'function') {
    window.setCurrentSuggestionIndex(index);
  }
  
  // Close START modal
  if (window.EnhancedStartUI && window.EnhancedStartUI.close) {
    window.EnhancedStartUI.close();
  } else if (window.closeStartModal) {
    window.closeStartModal();
  }
  
  // Execute routing after modal closes (async)
  setTimeout(async () => {
    await handleSuggestionCTA(handler, data);
  }, 300);
};

// Expose handleSuggestionCTA globally for navigation system
window.handleSuggestionCTA = handleSuggestionCTA;

/**
 * Show "why" modal for a suggestion
 */
window.showSuggestionWhy = function(cardElement) {
  const dataAttr = cardElement.getAttribute('data-suggestion-data');
  const data = dataAttr ? JSON.parse(dataAttr) : {};
  
  // Extract "why" from the detail text
  const detailElement = cardElement.querySelector('[style*="rgba(255,255,255,0.6)"]');
  const whyText = detailElement ? detailElement.textContent.trim() : 'Recommended for you';
  
  // Parse reasons (split by bullet)
  const reasons = whyText.split('•').map(r => r.trim()).filter(Boolean);
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98));
    border: 2px solid rgba(0,224,255,0.4);
    border-radius: 16px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    z-index: 10003;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
  `;
  
  const name = data.name || data.title || 'This recommendation';
  
  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.5rem;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">💡</div>
      <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Why this suggestion?</h3>
      <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">${name}</p>
    </div>
    
    <div style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
      <h4 style="color: #00ff88; margin: 0 0 1rem 0; font-size: 1rem;">Reasons:</h4>
      <ul style="margin: 0; padding-left: 1.5rem; color: rgba(255,255,255,0.9);">
        ${reasons.map(reason => `<li style="margin-bottom: 0.5rem;">${reason}</li>`).join('')}
      </ul>
    </div>
    
    <div style="text-align: center;">
      <button onclick="this.closest('div[style*=fixed]').remove(); document.getElementById('why-modal-backdrop').remove();" style="
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: #000;
        padding: 0.75rem 2rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      ">
        Got it!
      </button>
    </div>
  `;
  
  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'why-modal-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    z-index: 10002;
  `;
  backdrop.onclick = () => {
    modal.remove();
    backdrop.remove();
  };
  
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
};

// ================================================================
// AUTO-INITIALIZATION
// ================================================================

// Wait for both Daily Suggestions Engine and START UI to be ready
let initAttempts = 0;
const maxAttempts = 50; // 5 seconds max wait

function tryInitialize() {
  initAttempts++;
  
  if (window.DailySuggestionsUI && window.StartDailyDigest) {
    enhanceStartDailyDigest();
  } else if (initAttempts < maxAttempts) {
    setTimeout(tryInitialize, 100);
  } else {
    console.warn('⚠️ Could not initialize Daily Suggestions START integration (timeout)');
  }
}

// Start trying to initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryInitialize);
} else {
  tryInitialize();
}

// Also listen for the daily-suggestions-ready event
window.addEventListener('daily-suggestions-ready', () => {
  if (window.StartDailyDigest) {
    enhanceStartDailyDigest();
  }
});

console.log('✅ Daily Suggestions START Integration loaded');
