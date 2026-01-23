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
  isFirstTimeUser: true,
  currentUserProfile: null,
  supabase: null
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initStartFlow);

function initStartFlow() {
  console.log('🚀 Initializing START Flow');

  // Load saved state
  loadStartState();

  // Check if it's a new day (reset START state)
  checkDailyReset();

  // Listen for profile loaded event
  window.addEventListener('profile-loaded', (e) => {
    console.log('🚀 Profile loaded in START Flow');

    // Get profile from event detail first, then fall back to global sources
    startState.currentUserProfile = e?.detail?.profile ||
                                     e?.detail ||
                                     window.appState?.communityProfile ||
                                     window.currentUserProfile ||
                                     window.appState?.currentUser;

    // Get supabase client
    startState.supabase = window.supabase;

    console.log('🚀 Profile data available for START:', {
      hasProfile: !!startState.currentUserProfile,
      hasSupabase: !!startState.supabase,
      profileId: startState.currentUserProfile?.id,
      profileName: startState.currentUserProfile?.name
    });
  });

  // Wire up START button
  document.getElementById('btn-start')?.addEventListener('click', openStartModal);

  // Wire up START modal navigation buttons (show content inline, don't open separate panels)
  document.getElementById('start-btn-focus')?.addEventListener('click', () => {
    showStartContent('focus');
  });

  document.getElementById('start-btn-projects')?.addEventListener('click', () => {
    showStartContent('projects');
  });

  document.getElementById('start-btn-people')?.addEventListener('click', () => {
    showStartContent('people');
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

    // Ensure button section is visible and content area is hidden
    const buttonSection = document.getElementById('start-button-section');
    const contentArea = document.getElementById('start-dynamic-content');
    if (buttonSection) buttonSection.style.display = 'block';
    if (contentArea) contentArea.style.display = 'none';

    // Animate in (slide from right)
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.style.transform = 'translateX(0)';
      backdrop.style.opacity = '1';
    }, 10);
  }
}

// Show content inline in START modal (don't open separate panels)
async function showStartContent(contentType) {
  console.log(`🚀 Showing ${contentType} content in START modal`);

  const contentArea = document.getElementById('start-dynamic-content');
  const buttonSection = document.getElementById('start-button-section');

  if (!contentArea) return;

  // Show content area, minimize button section
  contentArea.style.display = 'block';
  if (buttonSection) {
    buttonSection.style.display = 'none';
  }

  // Show loading state
  contentArea.innerHTML = '<div style="text-align:center; padding:2rem; color:rgba(255,255,255,0.5);"><i class="fas fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem;"></i><p>Loading...</p></div>';

  // Get current user from startState or fallback to global
  const currentUser = startState.currentUserProfile ||
                      window.currentUserProfile ||
                      window.appState?.communityProfile;
  const supabase = startState.supabase || window.supabase;

  if (!currentUser || !supabase) {
    console.error('🚀 START content load failed - missing profile or supabase:', {
      hasProfile: !!currentUser,
      hasSupabase: !!supabase
    });
    contentArea.innerHTML = '<div style="text-align:center; padding:2rem; color:rgba(255,107,107,0.7);"><p>Unable to load content. Please refresh.</p></div>';
    return;
  }

  try {
    // Load suggestions
    const [themes, projects, people] = await Promise.all([
      loadSuggestedThemes(supabase, currentUser),
      loadSuggestedProjects(supabase, currentUser),
      loadSuggestedPeople(supabase, currentUser)
    ]);

    // Render content based on type
    let html = `
      <div style="padding: 1rem 0; border-bottom: 2px solid rgba(0,224,255,0.2); margin-bottom: 1.5rem;">
        <button onclick="hideStartContent()" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 0.5rem 1rem; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
          <i class="fas fa-arrow-left" style="margin-right: 0.5rem;"></i>Back to menu
        </button>
      </div>
    `;

    if (contentType === 'focus') {
      html += generateFocusHTML(themes, projects, people);
    } else if (contentType === 'projects') {
      html += generateProjectsHTML(projects);
    } else if (contentType === 'people') {
      html += generatePeopleHTML(people);
    }

    contentArea.innerHTML = html;
  } catch (error) {
    console.error('Error loading content:', error);
    contentArea.innerHTML = '<div style="text-align:center; padding:2rem; color:rgba(255,107,107,0.7);"><p>Failed to load content. Please try again.</p></div>';
  }
}

// Hide dynamic content and show button menu
window.hideStartContent = function() {
  const contentArea = document.getElementById('start-dynamic-content');
  const buttonSection = document.getElementById('start-button-section');

  if (contentArea) contentArea.style.display = 'none';
  if (buttonSection) buttonSection.style.display = 'block';
};

// ================================================================
// START MODAL CONTENT POPULATION
// ================================================================
// NOTE: Content is now loaded on-demand when users click buttons
// in showStartContent() function above. No need for initial population.

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
      .eq('user_id', currentUser.id);

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

        // Parse skills - handle both string and array formats
        const parseSkills = (skills) => {
          if (!skills) return [];
          if (Array.isArray(skills)) return skills.map(s => String(s).toLowerCase().trim());
          if (typeof skills === 'string') return skills.split(',').map(s => s.toLowerCase().trim());
          return [];
        };

        const userSkills = parseSkills(currentUser.skills);
        const personSkills = parseSkills(person.skills);
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

// NOTE: populateFocusContent() removed - content is now generated
// dynamically by generateFocusHTML(), generateProjectsHTML(), and
// generatePeopleHTML() when users click buttons in the START modal

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

// ================================================================
// HTML GENERATION FOR INLINE CONTENT
// ================================================================

function generateFocusHTML(themes, projects, people) {
  let html = '<div style="padding: 0 0.5rem;">';

  // Suggested Themes
  if (themes.length > 0) {
    html += `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; font-size: 1.1rem; margin-bottom: 1rem; font-weight: 600;">
          <i class="fas fa-bullseye"></i> Suggested Themes
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    themes.forEach(theme => {
      const timeLeft = getTimeLeftString(theme.expires_at);
      html += `
        <div style="background: rgba(0,224,255,0.08); border: 1px solid rgba(0,224,255,0.25); border-radius: 10px; padding: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem;">${escapeHtml(theme.title)}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${timeLeft} remaining • ${theme.activity_score || 0} engaged</div>
            </div>
            <button onclick="joinTheme('${theme.id}')" style="background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 8px; padding: 0.6rem 1.25rem; color: #000; font-weight: 700; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; white-space: nowrap;">
              Join
            </button>
          </div>
          ${theme.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.9rem; line-height: 1.5;">${escapeHtml(theme.description)}</div>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  } else {
    html += '<div style="text-align:center; padding: 2rem; color: rgba(255,255,255,0.5);"><p>No new themes to explore right now.</p></div>';
  }

  html += '</div>';
  return html;
}

function generateProjectsHTML(projects) {
  let html = '<div style="padding: 0 0.5rem;">';

  if (projects.length > 0) {
    html += `
      <div style="margin-bottom: 1rem;">
        <h3 style="color: #ff6b6b; font-size: 1.1rem; margin-bottom: 1rem; font-weight: 600;">
          <i class="fas fa-rocket"></i> Active Projects
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    projects.forEach(project => {
      html += `
        <div style="background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); border-radius: 10px; padding: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem;">${escapeHtml(project.title)}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; text-transform: capitalize;">${project.status || 'Open'}</div>
            </div>
            <button onclick="viewProject('${project.id}')" style="background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; padding: 0.6rem 1.25rem; color: #fff; font-weight: 700; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; white-space: nowrap;">
              View
            </button>
          </div>
          ${project.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.9rem; line-height: 1.5;">${escapeHtml(project.description.substring(0, 180))}${project.description.length > 180 ? '...' : ''}</div>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  } else {
    html += '<div style="text-align:center; padding: 2rem; color: rgba(255,255,255,0.5);"><p>No new projects to explore right now.</p></div>';
  }

  html += '</div>';
  return html;
}

function generatePeopleHTML(people) {
  let html = '<div style="padding: 0 0.5rem;">';

  if (people.length > 0) {
    html += `
      <div style="margin-bottom: 1rem;">
        <h3 style="color: #ffd700; font-size: 1.1rem; margin-bottom: 1rem; font-weight: 600;">
          <i class="fas fa-users"></i> People to Connect With
        </h3>
        <div style="display: grid; gap: 1rem;">
    `;
    people.forEach(person => {
      // Parse skills - handle both string and array formats
      let skills = person.skills || [];
      if (typeof skills === 'string') {
        skills = skills.split(',').map(s => s.trim());
      }
      skills = skills.slice(0, 3);

      html += `
        <div style="background: rgba(255,215,0,0.08); border: 1px solid rgba(255,215,0,0.25); border-radius: 10px; padding: 1.25rem; display: flex; gap: 1.25rem; align-items: center;">
          ${person.image_url
            ? `<img src="${person.image_url}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,215,0,0.4);" />`
            : `<div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,215,0,0.2); display: flex; align-items: center; justify-content: center; color: #ffd700; font-weight: 700; font-size: 1.25rem; border: 2px solid rgba(255,215,0,0.4);">${getInitials(person.name)}</div>`
          }
          <div style="flex: 1; min-width: 0;">
            <div style="color: #fff; font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem;">${escapeHtml(person.name)}</div>
            ${skills.length > 0 ? `<div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${skills.map(s => escapeHtml(String(s))).join(', ')}</div>` : ''}
          </div>
          <button onclick="connectWithPerson('${person.id}')" style="background: linear-gradient(135deg, #ffd700, #ffed4e); border: none; border-radius: 8px; padding: 0.6rem 1.25rem; color: #000; font-weight: 700; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; white-space: nowrap; flex-shrink: 0;">
            Connect
          </button>
        </div>
      `;
    });
    html += '</div></div>';
  } else {
    html += '<div style="text-align:center; padding: 2rem; color: rgba(255,255,255,0.5);"><p>No new people to connect with right now.</p></div>';
  }

  html += '</div>';
  return html;
}

// Global interaction functions
window.joinTheme = async function(themeId) {
  const supabase = startState.supabase || window.supabase;
  const currentUser = startState.currentUserProfile ||
                      window.currentUserProfile ||
                      window.appState?.communityProfile;

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

    // Note: Content will auto-refresh when user navigates back to the menu
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
  const supabase = startState.supabase || window.supabase;
  const currentUser = startState.currentUserProfile ||
                      window.currentUserProfile ||
                      window.appState?.communityProfile;

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

    // Note: Content will auto-refresh when user navigates back to the menu
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
    // Animate out (slide to right)
    modal.style.opacity = '0';
    modal.style.transform = 'translateX(100%)';
    backdrop.style.opacity = '0';

    setTimeout(() => {
      modal.style.display = 'none';
      backdrop.style.display = 'none';

      // Reset to button view
      window.hideStartContent();
    }, 300);
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

// Testing/debugging helper to reset START flow state
function resetStartFlow() {
  console.log('🔄 Manually resetting START flow state for testing...');
  startState.hasUsedStartToday = false;
  startState.lastStartDate = null;
  startState.isFirstTimeUser = true;
  saveStartState();
  updateButtonVisibility();
  console.log('✅ START flow reset - reload page to see fresh START experience');
  console.log('💡 The START button should now pulse and bottom buttons should be hidden');
}

// Expose reset function to window for console access
window.resetStartFlow = resetStartFlow;

// Add CSS for pulse animation
if (!document.getElementById('start-flow-pulse-styles')) {
  const style = document.createElement('style');
  style.id = 'start-flow-pulse-styles';
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
    transform: translateX(100%);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }
`;
  document.head.appendChild(style);
}

console.log("✅ START Flow ready");
