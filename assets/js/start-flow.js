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

async function openStartModal() {
  console.log('🚀 Opening START modal');

  const modal = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');

  if (modal && backdrop) {
    modal.style.display = 'block';
    backdrop.style.display = 'block';

    // Load and populate suggestions before showing
    await populateStartModalContent();

    // Animate in
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 10);
  }
}

// ================================================================
// START MODAL CONTENT POPULATION
// ================================================================

async function populateStartModalContent() {
  console.log('📝 Populating START modal content');

  try {
    // Get current user profile
    const currentUser = window.currentUserProfile || window.appState?.communityProfile;
    if (!currentUser) {
      console.warn('No current user profile found');
      return;
    }

    // Get Supabase client
    const supabase = window.supabase;
    if (!supabase) {
      console.warn('Supabase not available');
      return;
    }

    // Load suggestions in parallel
    const [themes, projects, people] = await Promise.all([
      loadSuggestedThemes(supabase, currentUser),
      loadSuggestedProjects(supabase, currentUser),
      loadSuggestedPeople(supabase, currentUser)
    ]);

    // Populate focus panel content
    populateFocusContent(themes, projects, people);

  } catch (error) {
    console.error('Error populating START content:', error);
  }
}

async function loadSuggestedThemes(supabase, currentUser) {
  try {
    // Get all active themes
    const { data: themes, error } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('activity_score', { ascending: false })
      .limit(5);

    if (error) throw error;

    // Get user's current theme participations
    const { data: userThemes } = await supabase
      .from('theme_participants')
      .select('theme_id')
      .eq('community_id', currentUser.id);

    const userThemeIds = (userThemes || []).map(t => t.theme_id);

    // Filter out themes user has already joined
    return (themes || []).filter(t => !userThemeIds.includes(t.id));
  } catch (error) {
    console.error('Error loading suggested themes:', error);
    return [];
  }
}

async function loadSuggestedProjects(supabase, currentUser) {
  try {
    // Get active projects
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .in('status', ['open', 'active', 'in-progress'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    // Get user's current projects
    const { data: userProjects } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('community_id', currentUser.id);

    const userProjectIds = (userProjects || []).map(p => p.project_id);

    // Filter out projects user is already in
    return (projects || []).filter(p => !userProjectIds.includes(p.id));
  } catch (error) {
    console.error('Error loading suggested projects:', error);
    return [];
  }
}

async function loadSuggestedPeople(supabase, currentUser) {
  try {
    // Get all community members
    const { data: people, error } = await supabase
      .from('community')
      .select('id, name, email, image_url, skills, interests, bio')
      .neq('id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Get existing connections
    const { data: connections } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`);

    const connectedIds = new Set();
    (connections || []).forEach(conn => {
      if (conn.from_user_id === currentUser.id) connectedIds.add(conn.to_user_id);
      if (conn.to_user_id === currentUser.id) connectedIds.add(conn.from_user_id);
    });

    // Filter out already connected people and score by relevance
    const candidates = (people || [])
      .filter(p => !connectedIds.has(p.id))
      .map(person => {
        // Calculate relevance score based on shared skills/interests
        let score = 0;
        const userSkills = (currentUser.skills || []).map(s => String(s).toLowerCase());
        const personSkills = (person.skills || []).map(s => String(s).toLowerCase());
        const sharedSkills = userSkills.filter(s => personSkills.includes(s));
        score += sharedSkills.length * 2;

        return { ...person, relevanceScore: score };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    return candidates;
  } catch (error) {
    console.error('Error loading suggested people:', error);
    return [];
  }
}

function populateFocusContent(themes, projects, people) {
  const focusContent = document.getElementById('mentor-focus-content');
  if (!focusContent) return;

  let html = '<div style="padding: 1rem;">';

  // Suggested Themes
  if (themes.length > 0) {
    html += `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; font-size: 1.1rem; margin-bottom: 1rem;">
          <i class="fas fa-bullseye"></i> Suggested Themes
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    themes.forEach(theme => {
      const timeLeft = getTimeLeftString(theme.expires_at);
      html += `
        <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(theme.title)}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${timeLeft} remaining</div>
            </div>
            <button onclick="joinTheme('${theme.id}')" style="background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #000; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
              Join
            </button>
          </div>
          ${theme.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.85rem; margin-top: 0.5rem;">${escapeHtml(theme.description)}</div>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  }

  // Suggested Projects
  if (projects.length > 0) {
    html += `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #ff6b6b; font-size: 1.1rem; margin-bottom: 1rem;">
          <i class="fas fa-rocket"></i> Active Projects
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    projects.forEach(project => {
      html += `
        <div style="background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(project.title)}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${project.status || 'Open'}</div>
            </div>
            <button onclick="viewProject('${project.id}')" style="background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
              View
            </button>
          </div>
          ${project.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.85rem; margin-top: 0.5rem;">${escapeHtml(project.description.substring(0, 150))}${project.description.length > 150 ? '...' : ''}</div>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  }

  // Suggested People
  if (people.length > 0) {
    html += `
      <div style="margin-bottom: 1rem;">
        <h3 style="color: #ffd700; font-size: 1.1rem; margin-bottom: 1rem;">
          <i class="fas fa-users"></i> People to Connect With
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    people.forEach(person => {
      const skills = (person.skills || []).slice(0, 3);
      html += `
        <div style="background: rgba(255,215,0,0.05); border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; padding: 1rem; display: flex; gap: 1rem; align-items: center;">
          ${person.image_url ? `<img src="${person.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" />` : `<div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255,215,0,0.2); display: flex; align-items: center; justify-content: center; color: #ffd700; font-weight: 700;">${getInitials(person.name)}</div>`}
          <div style="flex: 1;">
            <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(person.name)}</div>
            ${skills.length > 0 ? `<div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${skills.map(s => escapeHtml(String(s))).join(', ')}</div>` : ''}
          </div>
          <button onclick="connectWithPerson('${person.id}')" style="background: linear-gradient(135deg, #ffd700, #ffed4e); border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #000; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
            Connect
          </button>
        </div>
      `;
    });
    html += '</div></div>';
  }

  html += '</div>';
  focusContent.innerHTML = html;
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function getTimeLeftString(expiresAt) {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const remaining = expires - now;
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 1) return `${days} days`;
  if (hours > 1) return `${hours} hours`;
  return '< 1 hour';
}

// Global interaction functions
window.joinTheme = async function(themeId) {
  const supabase = window.supabase;
  const currentUser = window.currentUserProfile || window.appState?.communityProfile;

  if (!supabase || !currentUser) return;

  try {
    const { error } = await supabase
      .from('theme_participants')
      .insert({
        theme_id: themeId,
        community_id: currentUser.id,
        engagement_level: 'interested'
      });

    if (error) throw error;

    // Refresh the view
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }

    // Show success message
    if (typeof window.showNotification === 'function') {
      window.showNotification('Joined theme successfully!', 'success');
    }

    // Refresh START content
    await populateStartModalContent();
  } catch (error) {
    console.error('Error joining theme:', error);
    alert('Failed to join theme');
  }
};

window.viewProject = function(projectId) {
  if (typeof window.openProjectsModal === 'function') {
    window.openProjectsModal();
    // TODO: Navigate to specific project
  }
};

window.connectWithPerson = async function(personId) {
  const supabase = window.supabase;
  const currentUser = window.currentUserProfile || window.appState?.communityProfile;

  if (!supabase || !currentUser) return;

  try {
    const { error } = await supabase
      .from('connections')
      .insert({
        from_user_id: currentUser.id,
        to_user_id: personId,
        status: 'pending'
      });

    if (error) throw error;

    // Show success message
    if (typeof window.showNotification === 'function') {
      window.showNotification('Connection request sent!', 'success');
    }

    // Refresh START content
    await populateStartModalContent();
  } catch (error) {
    console.error('Error sending connection request:', error);
    alert('Failed to send connection request');
  }
};

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
