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

  // Wait for auth.js to attach globals (it auto-boots itself)
  await waitForModules();

  // DO NOT call setupLoginDOM/initLoginSystem here.
  // auth.js already did.

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
