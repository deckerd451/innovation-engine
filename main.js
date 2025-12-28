// ================================================================
// MAIN ENTRY POINT
// ================================================================
// This file coordinates auth.js, profile.js, and dashboard.js

import { setupLoginDOM, initLoginSystem } from './auth.js';
import './profile.js';  // Profile module listens for events
import './dashboard.js';  // Dashboard module listens for events

console.log('🚀 CharlestonHacks Innovation Engine starting...');

// ================================================================
// INITIALIZE ON DOM READY
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎨 DOM ready, initializing systems...');
  
  // 1. Setup login DOM elements
  setupLoginDOM();
  
  // 2. Initialize login system (handles auth, fires events)
  await initLoginSystem();
  
  // 3. Profile and dashboard modules are already listening for events
  // They will respond to: 'profile-loaded', 'profile-new', 'user-logged-out'
  
  console.log('✅ System ready!');
});
