// ================================================================
// MAIN ENTRY POINT
// ================================================================
// This file coordinates auth.js, profile.js, and dashboard.js
// All modules are loaded as scripts and communicate via window object and events

console.log('🚀 CharlestonHacks Innovation Engine starting...');

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎨 DOM ready, initializing systems...');
  
  // Wait for all modules to load
  await waitForModules();
  
  // 1. Setup login DOM elements
  window.setupLoginDOM();
  
  // 2. Initialize login system (handles auth, fires events)
  await window.initLoginSystem();
  
  // 3. Profile and dashboard modules are already listening for events
  // They will respond to: 'profile-loaded', 'profile-new', 'user-logged-out'
  
  console.log('✅ System ready!');
});

// Helper to wait for modules to be available
function waitForModules() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.setupLoginDOM && window.initLoginSystem) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 50);
  });
}
