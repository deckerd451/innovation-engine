// ================================================================
// DAILY SUGGESTIONS - START UI INTEGRATION
// ================================================================
// Integrates the Daily Suggestions Engine with the existing START UI
// Replaces/enhances the current recommendation logic
// ================================================================

console.log('%c🔗 Daily Suggestions START Integration - Loading', 'color:#0f8; font-weight:bold;');

/**
 * Enhance the START Daily Digest with personalized suggestions
 */
async function enhanceStartDailyDigest() {
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
      <h3 style="
        color: #00ff88;
        margin: 0 0 1rem 0;
        font-size: 1.1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      ">
        <i class="fas fa-magic"></i> Personalized for You
      </h3>
      
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
 * Handle suggestion card click
 */
window.handleSuggestionClick = function(handler, element) {
  const dataAttr = element.getAttribute('data-suggestion-data');
  const data = dataAttr ? JSON.parse(dataAttr) : {};
  
  // Close START modal
  if (window.EnhancedStartUI && window.EnhancedStartUI.close) {
    window.EnhancedStartUI.close();
  }
  
  // Execute handler after modal closes
  setTimeout(() => {
    if (window.DailySuggestionsUI) {
      window.DailySuggestionsUI.handleSuggestionAction(handler, data);
    }
  }, 300);
};

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
