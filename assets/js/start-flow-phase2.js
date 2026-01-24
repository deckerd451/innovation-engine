// ================================================================
// START Flow - Phase 2 Enhancements
// ================================================================
// Implements:
// - Commitment model (session focus)
// - Trust lever (why this?)
// - Contextual actions
// - Escape hatch
// - Session memory
// - Success signals
// ================================================================

console.log("%c🚀 START Flow Phase 2 Loading", "color:#0f8; font-weight:bold;");

// ================================================================
// SESSION FOCUS MANAGEMENT
// ================================================================

const sessionFocus = {
  active: false,
  type: null, // 'focus', 'projects', 'people'
  data: null,
  startTime: null,
  actions: []
};

/**
 * Lock in the user's choice for this session
 */
function setSessionFocus(focusType, focusData) {
  sessionFocus.active = true;
  sessionFocus.type = focusType;
  sessionFocus.data = focusData;
  sessionFocus.startTime = Date.now();
  sessionFocus.actions = [];

  console.log('🎯 Session focus set:', focusType);

  // Save to sessionStorage
  sessionStorage.setItem('session_focus', JSON.stringify({
    type: focusType,
    startTime: sessionFocus.startTime
  }));

  // Update UI
  updateUIForSessionFocus();
  contextualizeQuickActions();
  
  // Animate network
  if (typeof window.animateNetworkForChoice === 'function') {
    window.animateNetworkForChoice(focusType, focusData);
  }

  // Close START modal
  closeStartModal();

  // Show confirmation
  showFocusConfirmation(focusType);
}

/**
 * Update UI to reflect session focus
 */
function updateUIForSessionFocus() {
  // Update START button text
  const startBtn = document.getElementById('btn-start');
  if (startBtn && sessionFocus.active) {
    const label = startBtn.querySelector('.label');
    if (label) {
      label.textContent = "Today's Focus";
    }
  }

  // Add visual indicator to bottom bar
  addFocusIndicator();
}

/**
 * Add visual indicator showing active focus
 */
function addFocusIndicator() {
  const existingIndicator = document.getElementById('focus-indicator');
  if (existingIndicator) existingIndicator.remove();

  const bottomBar = document.getElementById('bottom-stats-bar');
  if (!bottomBar || !sessionFocus.active) return;

  const indicator = document.createElement('div');
  indicator.id = 'focus-indicator';
  indicator.style.cssText = `
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,224,255,0.2));
    border: 1px solid rgba(0,255,136,0.5);
    border-radius: 20px;
    padding: 0.4rem 1rem;
    font-size: 0.75rem;
    color: #00ff88;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    animation: pulse 2s ease-in-out infinite;
  `;

  const focusLabels = {
    focus: '🎯 Focus Mode',
    projects: '🚀 Project Mode',
    people: '👥 Connect Mode'
  };

  indicator.textContent = focusLabels[sessionFocus.type] || '🎯 Active Focus';
  bottomBar.appendChild(indicator);
}

/**
 * Show confirmation when focus is set
 */
function showFocusConfirmation(focusType) {
  const messages = {
    focus: 'Focus locked in. Network adjusted to show relevant connections.',
    projects: 'Project mode active. Showing active projects that need your skills.',
    people: 'Connect mode active. Highlighting people you should meet.'
  };

  if (typeof window.showToastNotification === 'function') {
    window.showToastNotification(messages[focusType] || 'Focus set!', 'success');
  }
}

// ================================================================
// TRUST LEVER - "Why This?" Explanation
// ================================================================

/**
 * Generate explanation for why an option is recommended
 */
function generateWhyThisExplanation(option, currentUser, activityData) {
  const reasons = [];

  if (option.type === 'focus') {
    if (activityData.recentThemeViews > 0) {
      reasons.push(`You viewed ${activityData.recentThemeViews} theme${activityData.recentThemeViews > 1 ? 's' : ''} recently`);
    }
    if (option.data.bestTheme) {
      const theme = option.data.bestTheme;
      if (theme.activity_score > 10) {
        reasons.push(`"${theme.title}" is gaining momentum (${theme.activity_score} engaged)`);
      }
      const userProjectsInTheme = activityData.userProjects?.filter(p => p.theme_id === theme.id) || [];
      if (userProjectsInTheme.length > 0) {
        reasons.push(`You have ${userProjectsInTheme.length} project${userProjectsInTheme.length > 1 ? 's' : ''} in this theme`);
      }
    }
  } else if (option.type === 'projects') {
    if (activityData.recentProjectViews > 0) {
      reasons.push(`You viewed ${activityData.recentProjectViews} project${activityData.recentProjectViews > 1 ? 's' : ''} recently`);
    }
    if (option.data.projects?.length > 5) {
      reasons.push(`${option.data.projects.length} active projects match your interests`);
    }
    const createdProjects = activityData.userProjects?.filter(p => p.creator_id === currentUser.id) || [];
    if (createdProjects.length > 0) {
      reasons.push(`You're actively creating projects`);
    }
  } else if (option.type === 'people') {
    if (activityData.recentConnections > 0) {
      reasons.push(`You made ${activityData.recentConnections} connection${activityData.recentConnections > 1 ? 's' : ''} recently`);
    }
    if (option.data.connections?.length < 5) {
      reasons.push(`Building your network will unlock more opportunities`);
    }
    if (option.data.people?.length > 10) {
      reasons.push(`${option.data.people.length} people share your interests`);
    }
  }

  // Default reason if none found
  if (reasons.length === 0) {
    reasons.push('Based on your profile and activity patterns');
  }

  return reasons;
}

/**
 * Show "Why This?" modal
 */
function showWhyThisModal(option, currentUser, activityData) {
  const reasons = generateWhyThisExplanation(option, currentUser, activityData);

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(4px);
    z-index: 10005;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="color: #00e0ff; margin: 0; font-size: 1.3rem;">
          <i class="fas fa-lightbulb"></i> Why this recommendation?
        </h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1rem;
        ">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div style="color: rgba(255,255,255,0.8); line-height: 1.6;">
        <p style="margin-bottom: 1rem;">We analyzed your activity and found:</p>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${reasons.map(reason => `
            <li style="
              padding: 0.75rem;
              margin-bottom: 0.5rem;
              background: rgba(0,224,255,0.05);
              border-left: 3px solid #00e0ff;
              border-radius: 4px;
            ">
              <i class="fas fa-check-circle" style="color: #00ff88; margin-right: 0.5rem;"></i>
              ${reason}
            </li>
          `).join('')}
        </ul>
        <p style="margin-top: 1.5rem; font-size: 0.9rem; color: rgba(255,255,255,0.6); font-style: italic;">
          This recommendation updates based on your activity and the community's momentum.
        </p>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);
}

// ================================================================
// CONTEXTUAL ACTIONS
// ================================================================

/**
 * Re-label quick actions based on session focus
 */
function contextualizeQuickActions() {
  if (!sessionFocus.active) return;

  const actions = {
    focus: {
      connect: { label: 'Connect with 2 relevant people', icon: 'user-plus' },
      projects: { label: 'Join an active project', icon: 'lightbulb' },
      messages: { label: 'Message collaborators', icon: 'envelope' }
    },
    projects: {
      connect: { label: 'Find project teammates', icon: 'users' },
      projects: { label: 'Browse all projects', icon: 'th-large' },
      messages: { label: 'Contact project leads', icon: 'envelope' }
    },
    people: {
      connect: { label: 'Send connection requests', icon: 'user-plus' },
      projects: { label: 'See their projects', icon: 'lightbulb' },
      messages: { label: 'Start conversations', icon: 'comments' }
    }
  };

  const contextActions = actions[sessionFocus.type];
  if (!contextActions) return;

  // Update Connect button
  const connectBtn = document.getElementById('btn-quickconnect');
  if (connectBtn && contextActions.connect) {
    const label = connectBtn.querySelector('.label');
    if (label) label.textContent = contextActions.connect.label;
  }

  // Update Projects button
  const projectsBtn = document.getElementById('btn-projects');
  if (projectsBtn && contextActions.projects) {
    const label = projectsBtn.querySelector('.label');
    if (label) label.textContent = contextActions.projects.label;
  }

  // Update Messages button
  const messagesBtn = document.getElementById('btn-messages');
  if (messagesBtn && contextActions.messages) {
    const label = messagesBtn.querySelector('.label');
    if (label) label.textContent = contextActions.messages.label;
  }

  console.log('✅ Quick actions contextualized for:', sessionFocus.type);
}

// ================================================================
// ESCAPE HATCH
// ================================================================

/**
 * Clear session focus and return to free exploration
 */
function clearSessionFocus() {
  sessionFocus.active = false;
  sessionFocus.type = null;
  sessionFocus.data = null;

  sessionStorage.removeItem('session_focus');

  // Reset UI
  const startBtn = document.getElementById('btn-start');
  if (startBtn) {
    const label = startBtn.querySelector('.label');
    if (label) label.textContent = 'START';
  }

  // Remove focus indicator
  const indicator = document.getElementById('focus-indicator');
  if (indicator) indicator.remove();

  // Reset quick actions to default labels
  resetQuickActionLabels();

  // Reset network visualization
  if (window.d3 && document.getElementById('synapse-svg')) {
    const svg = window.d3.select('#synapse-svg');
    svg.selectAll('.synapse-node, .theme-container')
      .transition()
      .duration(400)
      .style('opacity', 1);
  }

  if (typeof window.showToastNotification === 'function') {
    window.showToastNotification('Explore freely - focus cleared', 'info');
  }

  console.log('🔓 Session focus cleared');
}

function resetQuickActionLabels() {
  const connectBtn = document.getElementById('btn-quickconnect');
  if (connectBtn) {
    const label = connectBtn.querySelector('.label');
    if (label) label.textContent = 'Connect';
  }

  const projectsBtn = document.getElementById('btn-projects');
  if (projectsBtn) {
    const label = projectsBtn.querySelector('.label');
    if (label) label.textContent = 'Projects';
  }

  const messagesBtn = document.getElementById('btn-messages');
  if (messagesBtn) {
    const label = messagesBtn.querySelector('.label');
    if (label) label.textContent = 'Messages';
  }
}

// ================================================================
// SESSION MEMORY
// ================================================================

/**
 * Ask user if they want to start with same focus next time
 */
function offerSessionMemory() {
  if (!sessionFocus.active) return;

  // Check if user has taken meaningful action
  if (sessionFocus.actions.length === 0) return;

  // Don't ask if already saved
  const savedFocus = localStorage.getItem('preferred_start_focus');
  if (savedFocus === sessionFocus.type) return;

  // Show prompt
  const prompt = document.createElement('div');
  prompt.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(0,224,255,0.4);
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 350px;
    z-index: 10004;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    animation: slideInRight 0.3s ease-out;
  `;

  prompt.innerHTML = `
    <div style="color: #00e0ff; font-weight: 600; margin-bottom: 0.75rem; font-size: 1rem;">
      <i class="fas fa-bookmark"></i> Remember this focus?
    </div>
    <div style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5;">
      Want to start here next time?
    </div>
    <div style="display: flex; gap: 0.75rem;">
      <button onclick="savePreferredFocus('${sessionFocus.type}')" style="
        flex: 1;
        padding: 0.6rem;
        background: linear-gradient(135deg, #00ff88, #00e0ff);
        border: none;
        border-radius: 8px;
        color: #000;
        font-weight: 600;
        cursor: pointer;
      ">
        Yes
      </button>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="
        flex: 1;
        padding: 0.6rem;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        color: white;
        cursor: pointer;
      ">
        No thanks
      </button>
    </div>
  `;

  document.body.appendChild(prompt);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (prompt.parentElement) prompt.remove();
  }, 10000);
}

window.savePreferredFocus = function(focusType) {
  localStorage.setItem('preferred_start_focus', focusType);
  
  const prompt = document.querySelector('div[style*="Remember this focus"]')?.closest('div[style*=fixed]');
  if (prompt) prompt.remove();

  if (typeof window.showToastNotification === 'function') {
    window.showToastNotification('Preference saved! We\'ll start here next time.', 'success');
  }
};

/**
 * Load preferred focus on startup
 */
function loadPreferredFocus() {
  const preferred = localStorage.getItem('preferred_start_focus');
  if (preferred) {
    console.log('📌 User has preferred focus:', preferred);
    // This will be used by the recommendation engine to boost the score
    return preferred;
  }
  return null;
}

// ================================================================
// SUCCESS SIGNALS
// ================================================================

/**
 * Track meaningful actions and show celebration
 */
function trackAction(actionType) {
  if (!sessionFocus.active) return;

  sessionFocus.actions.push({
    type: actionType,
    timestamp: Date.now()
  });

  // Show success signal on first action
  if (sessionFocus.actions.length === 1) {
    showSuccessSignal(actionType);
    
    // Offer to save preference after first action
    setTimeout(offerSessionMemory, 2000);
  }
}

function showSuccessSignal(actionType) {
  const messages = {
    connection: 'Nice move. This is how networks work.',
    project: 'Great choice. Collaboration starts here.',
    message: 'Perfect. Communication builds trust.',
    theme: 'Smart. You\'re where the momentum is.'
  };

  const message = messages[actionType] || 'Nice move. This is how networks work.';

  const signal = document.createElement('div');
  signal.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, rgba(0,255,136,0.95), rgba(0,224,255,0.95));
    color: #000;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 1rem;
    z-index: 10006;
    box-shadow: 0 10px 40px rgba(0,255,136,0.4);
    animation: successPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  `;

  signal.innerHTML = `
    <i class="fas fa-check-circle" style="margin-right: 0.5rem;"></i>
    ${message}
  `;

  document.body.appendChild(signal);

  setTimeout(() => {
    signal.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => signal.remove(), 300);
  }, 3000);
}

// Add CSS animations
if (!document.getElementById('phase2-animations')) {
  const style = document.createElement('style');
  style.id = 'phase2-animations';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(100px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes successPop {
      0% { opacity: 0; transform: translateX(-50%) scale(0.8); }
      50% { transform: translateX(-50%) scale(1.05); }
      100% { opacity: 1; transform: translateX(-50%) scale(1); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ================================================================
// EXPORT FUNCTIONS
// ================================================================

window.setSessionFocus = setSessionFocus;
window.clearSessionFocus = clearSessionFocus;
window.showWhyThisModal = showWhyThisModal;
window.generateWhyThisExplanation = generateWhyThisExplanation;
window.trackAction = trackAction;
window.loadPreferredFocus = loadPreferredFocus;
window.sessionFocus = sessionFocus;

// Restore session focus if page was refreshed
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('session_focus');
  if (saved) {
    try {
      const { type, startTime } = JSON.parse(saved);
      // Only restore if less than 1 hour old
      if (Date.now() - startTime < 3600000) {
        sessionFocus.active = true;
        sessionFocus.type = type;
        sessionFocus.startTime = startTime;
        updateUIForSessionFocus();
        contextualizeQuickActions();
        console.log('🔄 Session focus restored:', type);
      }
    } catch (e) {
      console.warn('Failed to restore session focus:', e);
    }
  }
});

console.log('✅ START Flow Phase 2 ready');
