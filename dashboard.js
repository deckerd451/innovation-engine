// ================================================================
// MAIN DASHBOARD - Initialization and Setup
// ================================================================

// Import supabase
import { supabase } from "./assets/js/supabaseClient.js";
window.supabase = supabase;

// Import modules
import { setupLoginDOM, initLoginSystem } from './auth.js';
import './dashboard-features.js'; // All the dashboard features

// ================================================================
// NOTIFICATION SYSTEM
// ================================================================
function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Visual notification could be added here
}
window.showNotification = showNotification;

// ================================================================
// EVENT LISTENERS SETUP
// ================================================================
function setupEventListeners() {
  // Global search
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      // Your search implementation
      console.log('Searching:', e.target.value);
    });
  }

  // Floating action buttons
  const fabSynapse = document.getElementById('fab-synapse');
  const fabBBS = document.getElementById('fab-bbs');
  const fabQuickConnect = document.getElementById('fab-quick-connect');

  if (fabSynapse) {
    fabSynapse.addEventListener('click', () => {
      document.getElementById('synapse-container')?.classList.add('active');
    });
  }

  if (fabBBS) {
    fabBBS.addEventListener('click', () => {
      document.getElementById('bbs-modal')?.classList.add('active');
    });
  }

  if (fabQuickConnect) {
    fabQuickConnect.addEventListener('click', () => {
      scrollToSection('discover');
    });
  }

  // Close buttons
  const closeSynapse = document.getElementById('close-synapse');
  if (closeSynapse) {
    closeSynapse.addEventListener('click', () => {
      document.getElementById('synapse-container')?.classList.remove('active');
    });
  }
}

function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.scrollToSection = scrollToSection;

// ================================================================
// INITIALIZE
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 CharlestonHacks Innovation Engine starting...');
  
  // Setup login DOM
  setupLoginDOM();
  
  // Initialize login system
  await initLoginSystem();
  
  // Setup dashboard event listeners
  setupEventListeners();
  
  console.log('✅ System ready!');
});
