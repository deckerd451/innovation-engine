// ================================================================
// MAIN ENTRY POINT
// ================================================================
// This file coordinates auth.js, profile.js, and dashboard.js
// All modules are loaded as scripts and communicate via window object and events

console.log("🚀 CharlestonHacks Innovation Engine starting...");

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🎨 DOM ready, initializing systems...");

  // Wait for required globals from other scripts
  await waitForGlobals();

  // 1) Setup login DOM elements (safe to call more than once)
  window.setupLoginDOM?.();

  // 2) Initialize login system (idempotent in rewritten auth.js)
  await window.initLoginSystem?.();

  // 3) Profile + dashboard modules listen for:
  //    - 'profile-loaded'
  //    - 'profile-new'
  //    - 'user-logged-out'
  //    - 'app-ready'
  console.log("✅ System ready!");
});

// Helper to wait for required globals to exist
function waitForGlobals() {
  return new Promise((resolve) => {
    const start = Date.now();
    const TIMEOUT_MS = 5000;

    const check = () => {
      const ok =
        !!window.supabase &&
        typeof window.setupLoginDOM === "function" &&
        typeof window.initLoginSystem === "function";

      if (ok) return resolve();

      if (Date.now() - start > TIMEOUT_MS) {
        console.warn("⏱️ waitForGlobals timed out — continuing best-effort.");
        return resolve();
      }

      setTimeout(check, 50);
    };

    check();
  });
}
