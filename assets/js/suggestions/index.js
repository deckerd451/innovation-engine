// ================================================================
// DAILY SUGGESTIONS ENGINE - MAIN ENTRY POINT
// ================================================================
// Client-side daily recommendation system for GitHub Pages + Supabase
// Generates 5-10 personalized suggestions per day with explanations
// Non-destructive, respects RLS, integrates with existing START UI
// ================================================================

console.log('%c🎯 Daily Suggestions Engine - Loading', 'color:#0f8; font-weight:bold;');

// Feature flag
window.appFlags = window.appFlags || {};
window.appFlags.dailySuggestions = true;

// ================================================================
// MAIN INITIALIZATION
// ================================================================

/**
 * Initialize the Daily Suggestions Engine
 * Call this after profile load and before START/Daily Digest render
 */
async function initDailySuggestions() {
  console.log('🎯 Initializing Daily Suggestions Engine...');
  
  // Wait for profile to be loaded
  if (!window.currentUserProfile) {
    console.warn('⚠️ No profile loaded yet, waiting for profile-loaded event');
    return;
  }
  
  try {
    // Import modules
    const { DailySuggestionsEngine } = await import('./engine.js');
    const { DailySuggestionsStore } = await import('./store.js');
    const { DailySuggestionsUI } = await import('./ui.js');
    
    // Initialize store
    const store = new DailySuggestionsStore();
    
    // Initialize engine
    const engine = new DailySuggestionsEngine(store);
    
    // Initialize UI
    const ui = new DailySuggestionsUI(engine, store);
    
    // Expose globally for integration
    window.DailySuggestionsEngine = engine;
    window.DailySuggestionsStore = store;
    window.DailySuggestionsUI = ui;
    
    // Generate suggestions for today if needed
    await engine.ensureTodaysSuggestions();
    
    console.log('✅ Daily Suggestions Engine initialized');
    
    // Emit event for other modules
    window.dispatchEvent(new CustomEvent('daily-suggestions-ready', {
      detail: { engine, store, ui }
    }));
    
  } catch (error) {
    console.error('❌ Failed to initialize Daily Suggestions Engine:', error);
  }
}

// ================================================================
// AUTO-INITIALIZATION
// ================================================================

// Listen for profile loaded event
window.addEventListener('profile-loaded', async (e) => {
  console.log('📋 Profile loaded, initializing Daily Suggestions Engine');
  await initDailySuggestions();
});

// If profile already loaded, initialize immediately
if (window.currentUserProfile) {
  initDailySuggestions();
}

// Export for manual initialization
window.initDailySuggestions = initDailySuggestions;

console.log('✅ Daily Suggestions Engine entry point loaded');
