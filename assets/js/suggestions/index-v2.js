// ================================================================
// DAILY SUGGESTIONS V2 - INITIALIZATION
// ================================================================
// Initializes the V2 Intelligence Layer with explicit thinking
// ================================================================

import { DailySuggestionsEngineV2 } from './engine-v2.js';
import { DailySuggestionsStore } from './store.js';
import { DailySuggestionsUI } from './ui.js';

// Initialize on profile load
window.addEventListener('profile-loaded', async (e) => {
  try {
    console.log('🚀 Initializing Daily Suggestions V2 (Intelligence Layer)...');
    await window.initDailySuggestionsV2();
  } catch (err) {
    console.error('❌ Failed to initialize Daily Suggestions V2:', err);
  }
});

/**
 * Initialize Daily Suggestions V2 system
 */
window.initDailySuggestionsV2 = async function() {
  // Check if already initialized
  if (window.DailySuggestionsEngineV2) {
    console.log('✅ Daily Suggestions V2 already initialized');
    return;
  }
  
  // Check if user is logged in
  if (!window.currentUserProfile) {
    console.warn('⚠️ No user profile, skipping Daily Suggestions V2 initialization');
    return;
  }
  
  // Initialize components
  const store = new DailySuggestionsStore();
  const engine = new DailySuggestionsEngineV2(store);
  const ui = new DailySuggestionsUI(engine, store);
  
  // Expose globally (V2 names)
  window.DailySuggestionsEngineV2 = engine;
  window.DailySuggestionsStoreV2 = store;
  window.DailySuggestionsUIV2 = ui;
  
  // Also expose V1-compatible names for backward compatibility
  window.DailySuggestionsEngine = engine;
  window.DailySuggestionsStore = store;
  window.DailySuggestionsUI = ui;
  
  // Generate today's suggestions
  await engine.ensureTodaysSuggestions();
  
  // Dispatch ready event for integrations
  window.dispatchEvent(new CustomEvent('daily-suggestions-ready', { detail: { version: 2 } }));
  
  console.log('✅ Daily Suggestions V2 initialized');
};

// Export for module usage
export { DailySuggestionsEngineV2, DailySuggestionsStore, DailySuggestionsUI };
