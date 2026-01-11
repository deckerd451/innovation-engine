// ================================================================
// START Flow - Daily engagement system per yellow instructions
// ================================================================
// This module handles:
// 1. Opening/closing START modal
// 2. Hiding bottom bar buttons until START is used
// 3. Showing buttons after START journey is complete
// 4. Wiring up all navigation buttons in START modal
// 5. Daily reset of START state
// ================================================================

console.log("%c🚀 START Flow Loading", "color:#0f8; font-weight:bold;");

// State management
const startState = {
  hasUsedStartToday: false,
  lastStartDate: null,
  isFirstTimeUser: true
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initStartFlow);

function initStartFlow() {
  console.log('🚀 Initializing START Flow');

  // Load saved state
  loadStartState();

  // Check if it's a new day (reset START state)
  checkDailyReset();

  // Wire up START button
  document.getElementById('btn-start')?.addEventListener('click', openStartModal);

  // Wire up START modal navigation buttons (mentor panels)
  document.getElementById('start-btn-focus')?.addEventListener('click', () => {
    openMentorPanel('focus');
  });

  document.getElementById('start-btn-projects')?.addEventListener('click', () => {
    openMentorPanel('projects');
  });

  document.getElementById('start-btn-people')?.addEventListener('click', () => {
    openMentorPanel('people');
  });

  // Wire up START modal action buttons (bottom bar actions)
  document.getElementById('start-action-connect')?.addEventListener('click', () => {
    if (typeof openQuickConnectModal === 'function') {
      openQuickConnectModal();
    }
  });

  document.getElementById('start-action-messages')?.addEventListener('click', () => {
    const messagesModal = document.getElementById('messages-modal');
    if (messagesModal) {
      messagesModal.classList.add('active');
      if (window.MessagingModule && typeof window.MessagingModule.init === 'function') {
        window.MessagingModule.init();
      }
    }
  });

  document.getElementById('start-action-projects')?.addEventListener('click', () => {
    if (typeof openProjectsModal === 'function') {
      openProjectsModal();
    }
  });

  document.getElementById('start-action-endorsements')?.addEventListener('click', () => {
    if (typeof openEndorsementsModal === 'function') {
      openEndorsementsModal();
    }
  });

  document.getElementById('start-action-chat')?.addEventListener('click', () => {
    if (typeof initBBS === 'function') {
      initBBS();
    }
  });

  // Apply initial button visibility state
  updateButtonVisibility();

  console.log('✅ START Flow initialized', {
    hasUsedStartToday: startState.hasUsedStartToday,
    isFirstTimeUser: startState.isFirstTimeUser
  });
}

// ================================================================
// MODAL MANAGEMENT
// ================================================================

function openStartModal() {
  console.log('🚀 Opening START modal');

  const modal = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');

  if (modal && backdrop) {
    modal.style.display = 'block';
    backdrop.style.display = 'block';

    // Animate in
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 10);
  }
}

function closeStartModal() {
  console.log('🚀 Closing START modal');

  const modal = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');

  if (modal && backdrop) {
    // Animate out
    modal.style.opacity = '0';
    modal.style.transform = 'translate(-50%, -50%) scale(0.95)';

    setTimeout(() => {
      modal.style.display = 'none';
      backdrop.style.display = 'none';
    }, 200);
  }

  // Mark START as used today
  markStartAsUsed();

  // Update button visibility (show bottom bar buttons)
  updateButtonVisibility();
}

// Make functions globally available
window.closeStartModal = closeStartModal;
window.openStartModal = openStartModal;

// ================================================================
// BUTTON VISIBILITY MANAGEMENT
// ================================================================

function updateButtonVisibility() {
  const bottomBarButtons = [
    'btn-quickconnect',
    'btn-messages',
    'btn-projects',
    'btn-endorsements',
    'btn-bbs'
  ];

  const startButton = document.getElementById('btn-start');
  const adminButton = document.getElementById('btn-admin');

  if (startState.hasUsedStartToday) {
    // Show bottom bar buttons
    bottomBarButtons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.style.display = 'flex';
      }
    });

    // Minimize START button (make it smaller)
    if (startButton) {
      startButton.style.minWidth = '80px';
      startButton.querySelector('.icon').style.fontSize = '1.2rem';
      startButton.querySelector('.label').style.fontSize = '0.65rem';
    }
  } else {
    // Hide bottom bar buttons (except admin)
    bottomBarButtons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.style.display = 'none';
      }
    });

    // Keep admin button visible if it was already visible
    // (it's managed by isAdminUser() check in dashboard-actions.js)

    // Make START button prominent
    if (startButton) {
      startButton.style.minWidth = '110px';
      // Add pulse animation
      startButton.style.animation = 'pulse 2s infinite';
    }
  }

  console.log('👁️ Button visibility updated:', {
    hasUsedStartToday: startState.hasUsedStartToday,
    buttonsVisible: startState.hasUsedStartToday
  });
}

// ================================================================
// STATE PERSISTENCE
// ================================================================

function loadStartState() {
  try {
    const saved = localStorage.getItem('start_flow_state');
    if (saved) {
      const state = JSON.parse(saved);
      startState.hasUsedStartToday = state.hasUsedStartToday || false;
      startState.lastStartDate = state.lastStartDate || null;
      startState.isFirstTimeUser = state.isFirstTimeUser !== undefined ? state.isFirstTimeUser : true;
      console.log('🚀 Loaded START state:', startState);
    }
  } catch (e) {
    console.warn('Could not load START state:', e);
  }
}

function saveStartState() {
  try {
    localStorage.setItem('start_flow_state', JSON.stringify({
      hasUsedStartToday: startState.hasUsedStartToday,
      lastStartDate: startState.lastStartDate,
      isFirstTimeUser: startState.isFirstTimeUser
    }));
  } catch (e) {
    console.warn('Could not save START state:', e);
  }
}

function markStartAsUsed() {
  startState.hasUsedStartToday = true;
  startState.lastStartDate = new Date().toISOString();
  startState.isFirstTimeUser = false;
  saveStartState();
  console.log('✅ START marked as used today');
}

function checkDailyReset() {
  const today = new Date().toDateString();
  const lastStartDate = startState.lastStartDate ? new Date(startState.lastStartDate).toDateString() : null;

  if (lastStartDate && lastStartDate !== today) {
    // It's a new day - reset START state
    console.log('🌅 New day detected - resetting START state');
    startState.hasUsedStartToday = false;
    saveStartState();
    updateButtonVisibility();
  }
}

// Add CSS for pulse animation
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7);
    }
    50% {
      box-shadow: 0 0 0 10px rgba(0, 255, 136, 0);
    }
  }

  .start-nav-btn:hover,
  .start-action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  .start-nav-btn:active,
  .start-action-btn:active {
    transform: translateY(0);
  }

  #start-modal {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
`;
document.head.appendChild(style);

console.log("✅ START Flow ready");
