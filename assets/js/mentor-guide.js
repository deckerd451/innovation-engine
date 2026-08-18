// ================================================================
// Mentor Guide - Daily Briefing Navigation System
// ================================================================
// A calm, mentor-style guidance layer that helps users understand
// their current focus, active projects, and relevant people
// without forced onboarding or gamification.
// ================================================================

console.log("%c🧭 Mentor Guide Loading", "color:#0ff; font-weight:bold;");

// State management
const mentorState = {
  currentPanel: null,
  viewedPanels: {
    focus: false,
    projects: false,
    people: false
  },
  currentUserProfile: null,
  supabase: null
};

// Helper: Convert skills/interests to array (handles both string and array formats)
function normalizeToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  return [];
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initMentorGuide);

// Initialization guard to prevent double init
let mentorGuideInitialized = false;

function initMentorGuide() {
  if (mentorGuideInitialized) {
    console.log('⚠️ Mentor Guide already initialized, skipping');
    return;
  }
  mentorGuideInitialized = true;
  
  console.log('🧭 Initializing Mentor Guide');

  // Note: Mentor navigation buttons (mentor-btn-focus, mentor-btn-projects, mentor-btn-people) 
  // are not currently in the UI. Panels can be opened programmatically if needed.

  // Initialize drag functionality for all mentor panels
  initializePanelDrag();

  // Load saved state from localStorage
  loadMentorState();

  // Update button highlights based on state
  updateMentorButtonStates();

  // Wait for profile to be loaded (with better data source detection)
  window.addEventListener('profile-loaded', (e) => {
    console.log('🧭 Profile loaded, mentor guide ready');

    // Get profile from event detail first, then fall back to global sources
    mentorState.currentUserProfile = e?.detail?.profile ||
                                      e?.detail ||
                                      window.appState?.communityProfile ||
                                      window.currentUserProfile ||
                                      window.appState?.currentUser;

    // Try multiple sources for supabase client
    mentorState.supabase = window.supabase;

    console.log('🧭 Profile data available:', {
      hasProfile: !!mentorState.currentUserProfile,
      hasSupabase: !!mentorState.supabase,
      profileId: mentorState.currentUserProfile?.id,
      profileName: mentorState.currentUserProfile?.name,
      fromEvent: !!(e?.detail?.profile || e?.detail),
      appState: !!window.appState,
      supabaseClient: !!window.supabase
    });

    // Soft highlight the first unviewed panel
    highlightRecommendedPanel();
  });
}

// ================================================================
// DRAG FUNCTIONALITY
// ================================================================

function initializePanelDrag() {
  const panels = document.querySelectorAll('.mentor-panel-draggable');
  
  panels.forEach(panel => {
    const dragHandle = panel.querySelector('.mentor-panel-drag-handle');
    if (!dragHandle) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Mouse events
    dragHandle.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // Touch events
    dragHandle.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd);

    function dragStart(e) {
      // Only drag if clicking on the handle itself
      if (e.target !== dragHandle && !dragHandle.contains(e.target)) return;

      if (e.type === 'touchstart') {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
      } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
      }

      isDragging = true;
      panel.style.transition = 'none';
      dragHandle.style.cursor = 'grabbing';
    }

    function drag(e) {
      if (!isDragging) return;

      e.preventDefault();

      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }

      xOffset = currentX;
      yOffset = currentY;

      // Keep panel within viewport bounds
      const rect = panel.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      // Constrain to viewport
      xOffset = Math.max(-rect.width / 2, Math.min(xOffset, maxX - rect.width / 2));
      yOffset = Math.max(-rect.height / 2, Math.min(yOffset, maxY - rect.height / 2));

      setTranslate(xOffset, yOffset, panel);
    }

    function dragEnd(e) {
      if (!isDragging) return;

      initialX = currentX;
      initialY = currentY;

      isDragging = false;
      dragHandle.style.cursor = 'move';
      
      // Save position to localStorage
      savePanelPosition(panel.id, xOffset, yOffset);
    }

    function setTranslate(xPos, yPos, el) {
      el.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
    }

    // Restore saved position
    const savedPosition = loadPanelPosition(panel.id);
    if (savedPosition) {
      xOffset = savedPosition.x;
      yOffset = savedPosition.y;
      setTranslate(xOffset, yOffset, panel);
    }
  });
}

function savePanelPosition(panelId, x, y) {
  try {
    const positions = JSON.parse(localStorage.getItem('mentor_panel_positions') || '{}');
    positions[panelId] = { x, y };
    localStorage.setItem('mentor_panel_positions', JSON.stringify(positions));
  } catch (e) {
    console.warn('Could not save panel position:', e);
  }
}

function loadPanelPosition(panelId) {
  try {
    const positions = JSON.parse(localStorage.getItem('mentor_panel_positions') || '{}');
    return positions[panelId] || null;
  } catch (e) {
    console.warn('Could not load panel position:', e);
    return null;
  }
}

// ================================================================
// PANEL MANAGEMENT
// ================================================================

function openMentorPanel(panelType) {
  // Prevent opening if already opening
  if (mentorState.currentPanel === panelType) {
    console.log(`🧭 Panel ${panelType} already open, skipping`);
    return;
  }

  console.log(`🧭 Opening mentor panel: ${panelType}`);

  // Close any other open panels first
  closeAllMentorPanels();

  // Show backdrop
  const backdrop = document.getElementById('mentor-panel-backdrop');
  if (backdrop) {
    backdrop.style.display = 'block';
  }

  // Show the requested panel
  const panel = document.getElementById(`mentor-panel-${panelType}`);
  if (panel) {
    panel.style.display = 'block';
    mentorState.currentPanel = panelType;

    // Mark as viewed
    mentorState.viewedPanels[panelType] = true;
    saveMentorState();

    // Load content for this panel
    loadPanelContent(panelType);

    // Update button states
    updateMentorButtonStates();

    // Highlight next recommended panel
    setTimeout(highlightRecommendedPanel, 500);
  }
}

function closeMentorPanel(panelType) {
  const panel = document.getElementById(`mentor-panel-${panelType}`);
  if (panel) {
    panel.style.display = 'none';
  }

  const backdrop = document.getElementById('mentor-panel-backdrop');
  if (backdrop) {
    backdrop.style.display = 'none';
  }

  mentorState.currentPanel = null;
}

function closeAllMentorPanels() {
  ['focus', 'projects', 'people'].forEach(type => {
    const panel = document.getElementById(`mentor-panel-${type}`);
    if (panel) {
      panel.style.display = 'none';
    }
  });

  const backdrop = document.getElementById('mentor-panel-backdrop');
  if (backdrop) {
    backdrop.style.display = 'none';
  }

  mentorState.currentPanel = null;
}

// Make functions globally available
window.closeMentorPanel = closeMentorPanel;
window.closeAllMentorPanels = closeAllMentorPanels;

// ================================================================
// CONTENT LOADING
// ================================================================

async function loadPanelContent(panelType) {
  const contentDiv = document.getElementById(`mentor-${panelType}-content`);
  if (!contentDiv) return;

  // Show loading state
  contentDiv.innerHTML = '<div style="text-align:center; padding:3rem; color:rgba(255,255,255,0.5);"><i class="fas fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem;"></i><p>Loading...</p></div>';

  try {
    switch (panelType) {
      case 'focus':
        await loadFocusContent(contentDiv);
        break;
      case 'projects':
        await loadProjectsContent(contentDiv);
        break;
      case 'people':
        await loadPeopleContent(contentDiv);
        break;
    }
  } catch (error) {
    console.error(`Error loading ${panelType} content:`, error);
    contentDiv.innerHTML = `<div style="text-align:center; padding:2rem; color:rgba(255,107,107,0.8);"><i class="fas fa-exclamation-circle" style="font-size:2rem; margin-bottom:1rem;"></i><p>Could not load content. Please try again.</p></div>`;
  }
}

// ================================================================
// PANEL 1: CURRENT FOCUS
// ================================================================

async function loadFocusContent(contentDiv) {
  contentDiv.textContent = '';
  if (!mentorState.supabase || !mentorState.currentUserProfile) return;
  const userTags = [
    ...normalizeToArray(mentorState.currentUserProfile.skills),
    ...normalizeToArray(mentorState.currentUserProfile.interests),
  ].map(value => String(value).toLowerCase()).filter(Boolean);
  try {
    const { data: themes } = await mentorState.supabase
      .from('theme_circles')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('activity_score', { ascending: false })
      .limit(10);
    const relevant = (themes || []).map(theme => {
      const tags = normalizeToArray(theme.tags).map(value => String(value).toLowerCase());
      const overlap = userTags.filter(tag => tags.some(candidate => candidate.includes(tag) || tag.includes(candidate)));
      return { theme, overlap };
    }).filter(item => item.overlap.length > 0).sort((a, b) => b.overlap.length - a.overlap.length)[0];
    if (!relevant) return;
    contentDiv.className = 'network-reflection-content network-reflection-focus-card';
    const title = document.createElement('h3');
    title.textContent = relevant.theme.title || 'Current focus';
    const detail = document.createElement('p');
    detail.textContent = `Matches your profile interests: ${relevant.overlap.slice(0, 3).join(', ')}`;
    contentDiv.append(title, detail);
  } catch (error) {
    console.warn('Could not load current focus:', error);
  }
}

// ================================================================
// PANEL 2: RECENTLY ACTIVE PROJECTS
// ================================================================

async function loadProjectsContent(contentDiv) {
  if (!mentorState.supabase) {
    contentDiv.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:rgba(255,170,0,0.6); margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7);">Unable to connect. Please try refreshing the page.</p>
      </div>
    `;
    return;
  }

  let projects = [];

  try {
    // Get active projects with recent activity with timeout
    const projectsPromise = mentorState.supabase
      .from('projects')
      .select('*')
      .in('status', ['active', 'in-progress', 'open'])
      .order('created_at', { ascending: false })
      .limit(5);

    const result = await Promise.race([
      projectsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    projects = result.data || [];
  } catch (error) {
    console.warn('Could not load projects:', error);
    contentDiv.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-exclamation-circle" style="font-size:2rem; color:rgba(255,107,107,0.6); margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:1rem;">Could not load projects right now</p>
        <button onclick="location.reload()" style="padding:0.75rem 1.5rem; background:rgba(0,224,255,0.2); border:1px solid rgba(0,224,255,0.4); border-radius:8px; color:#00e0ff; cursor:pointer; font-weight:600;">
          Refresh Page
        </button>
      </div>
    `;
    return;
  }

  let html = '';

  if (projects && projects.length > 0) {
    projects.forEach(project => {
      const activityHint = project.status === 'active' ? 'Active this week' : 'Seeking collaborators';
      const teamSize = project.team_size || 0;

      html += `
        <div style="margin-bottom:1.5rem; padding:1.5rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.75rem;">
            <h5 style="color:#fff; font-size:1.05rem; font-weight:600; margin:0;">${escapeHtml(project.title)}</h5>
            <span style="font-size:0.75rem; color:rgba(0,255,136,0.8); padding:0.3rem 0.75rem; background:rgba(0,255,136,0.1); border-radius:12px; white-space:nowrap;">${activityHint}</span>
          </div>

          <p style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:1rem; line-height:1.5;">${escapeHtml(project.description || 'No description available')}</p>

          ${teamSize > 0 ? `<p style="color:rgba(255,255,255,0.4); font-size:0.8rem; margin-bottom:1rem;"><i class="fas fa-users" style="margin-right:0.5rem;"></i>${teamSize} ${teamSize === 1 ? 'person' : 'people'} involved</p>` : ''}

          <div style="display:flex; gap:0.5rem;">
            <button onclick="if(typeof openProjectModal === 'function') openProjectModal('${project.id}'); else alert('Project details coming soon');" style="padding:0.6rem 1.25rem; background:rgba(0,224,255,0.15); border:1px solid rgba(0,224,255,0.3); border-radius:6px; color:#00e0ff; font-weight:600; cursor:pointer; font-size:0.85rem; transition:all 0.2s;">
              <i class="fas fa-eye" style="margin-right:0.5rem;"></i>View project
            </button>
            <button onclick="alert('Get involved feature coming soon!');" style="padding:0.6rem 1.25rem; background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.3); border-radius:6px; color:#0f8; font-weight:600; cursor:pointer; font-size:0.85rem; transition:all 0.2s;">
              <i class="fas fa-hand-point-right" style="margin-right:0.5rem;"></i>Get involved
            </button>
          </div>
        </div>
      `;
    });
  } else {
    html = '<p style="color:rgba(255,255,255,0.5); text-align:center; padding:2rem;">No active projects found. Be the first to start one!</p>';
  }

  contentDiv.innerHTML = html;
}

// ================================================================
// PANEL 3: PEOPLE WORTH KNOWING
// ================================================================

async function loadPeopleContent(contentDiv) {
  if (!mentorState.supabase || !mentorState.currentUserProfile) {
    contentDiv.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:rgba(255,170,0,0.6); margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7);">Unable to connect. Please try refreshing the page.</p>
      </div>
    `;
    return;
  }

  const userId = mentorState.currentUserProfile.id;
  const userSkills = normalizeToArray(mentorState.currentUserProfile.skills);
  const userInterests = normalizeToArray(mentorState.currentUserProfile.interests);
  const userTags = [...userSkills, ...userInterests].map(t => String(t).toLowerCase());

  let allPeople = [];

  try {
    // Get people with overlapping interests/skills with timeout
    const peoplePromise = mentorState.supabase
      .from('community')
      .select('*')
      .neq('id', userId)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .limit(50);

    const result = await Promise.race([
      peoplePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    allPeople = result.data || [];
  } catch (error) {
    console.warn('Could not load people:', error);
    contentDiv.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-exclamation-circle" style="font-size:2rem; color:rgba(255,107,107,0.6); margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:1rem;">Could not load people right now</p>
        <button onclick="location.reload()" style="padding:0.75rem 1.5rem; background:rgba(0,224,255,0.2); border:1px solid rgba(0,224,255,0.4); border-radius:8px; color:#00e0ff; cursor:pointer; font-weight:600;">
          Refresh Page
        </button>
      </div>
    `;
    return;
  }

  // Calculate relevance
  const peopleWithContext = allPeople.map(person => {
    const personSkills = normalizeToArray(person.skills).map(s => String(s).toLowerCase());
    const personInterests = normalizeToArray(person.interests).map(i => String(i).toLowerCase());
    const personTags = [...personSkills, ...personInterests];
    const sharedTags = userTags.filter(tag => personTags.some(pt => pt.includes(tag) || tag.includes(pt)));

    let context = 'Active in the community';
    if (sharedTags.length > 0) {
      context = `Active across ${sharedTags.slice(0, 2).join(', ')}`;
    }

    return {
      ...person,
      relevance: sharedTags.length,
      context
    };
  }) || [];

  const relevantPeople = peopleWithContext
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  let html = '';

  if (relevantPeople.length > 0) {
    relevantPeople.forEach(person => {
      const role = person.role || 'Member';
      html += `
        <div style="margin-bottom:1.25rem; padding:1.25rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px;">
          <div style="display:flex; align-items:start; gap:1rem; margin-bottom:1rem;">
            <div style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, #00e0ff, #0080ff); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.2rem; flex-shrink:0;">
              ${person.image_url ? `<img src="${person.image_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : getInitials(person.name)}
            </div>
            <div style="flex:1;">
              <h5 style="color:#fff; font-weight:600; font-size:1rem; margin:0 0 0.25rem 0;">${escapeHtml(person.name)}</h5>
              <p style="color:rgba(255,255,255,0.5); font-size:0.85rem; margin:0 0 0.5rem 0;">${escapeHtml(role)}</p>
              <p style="color:rgba(0,224,255,0.7); font-size:0.8rem; margin:0;"><i class="fas fa-link" style="margin-right:0.5rem;"></i>${escapeHtml(person.context)}</p>
            </div>
          </div>

          <div style="display:flex; gap:0.5rem;">
            <button onclick="if(typeof openProfile === 'function') openProfile('${person.id}'); else alert('Profile coming soon');" style="flex:1; padding:0.6rem 1rem; background:rgba(0,224,255,0.1); border:1px solid rgba(0,224,255,0.25); border-radius:6px; color:#00e0ff; font-weight:600; cursor:pointer; font-size:0.85rem; transition:all 0.2s;">
              <i class="fas fa-user" style="margin-right:0.5rem;"></i>View profile
            </button>
            <button onclick="if(typeof sendConnectionRequest === 'function') sendConnectionRequest('${person.id}'); else alert('Connect feature coming soon');" style="flex:1; padding:0.6rem 1rem; background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.25); border-radius:6px; color:#0f8; font-weight:600; cursor:pointer; font-size:0.85rem; transition:all 0.2s;">
              <i class="fas fa-user-plus" style="margin-right:0.5rem;"></i>Connect
            </button>
          </div>
        </div>
      `;
    });
  } else {
    html = '<p style="color:rgba(255,255,255,0.5); text-align:center; padding:2rem;">No people found yet. Complete your profile to get better recommendations!</p>';
  }

  contentDiv.innerHTML = html;
}

// ================================================================
// BUTTON STATE MANAGEMENT
// ================================================================

function updateMentorButtonStates() {
  ['focus', 'projects', 'people'].forEach(type => {
    const btn = document.getElementById(`mentor-btn-${type}`);
    if (!btn) return;

    const viewed = mentorState.viewedPanels[type];

    if (viewed) {
      // Soften the button if already viewed
      btn.style.background = 'rgba(0,224,255,0.05)';
      btn.style.borderColor = 'rgba(0,224,255,0.15)';
      btn.style.color = 'rgba(255,255,255,0.6)';
      btn.querySelector('i').style.color = 'rgba(0,224,255,0.5)';

      // Add checkmark
      const label = btn.querySelector('span');
      if (label && !label.textContent.includes('✓')) {
        label.textContent += ' ✓';
      }
    }
  });
}

function highlightRecommendedPanel() {
  // Find the first unviewed panel in order
  const order = ['focus', 'projects', 'people'];
  const nextPanel = order.find(type => !mentorState.viewedPanels[type]);

  if (!nextPanel) return;

  const btn = document.getElementById(`mentor-btn-${nextPanel}`);
  if (!btn) return;

  // Add soft glow
  btn.classList.add('active-mentor');
  btn.style.background = 'rgba(0,224,255,0.08)';
  btn.style.borderColor = 'rgba(0,224,255,0.2)';
  btn.style.color = 'rgba(255,255,255,0.85)';
  btn.querySelector('i').style.color = '#00e0ff';

  // Remove glow from others
  order.filter(t => t !== nextPanel).forEach(type => {
    const otherBtn = document.getElementById(`mentor-btn-${type}`);
    if (otherBtn) {
      otherBtn.classList.remove('active-mentor');
    }
  });
}

// ================================================================
// STATE PERSISTENCE
// ================================================================

function saveMentorState() {
  try {
    localStorage.setItem('mentor_guide_state', JSON.stringify({
      viewedPanels: mentorState.viewedPanels,
      lastUpdated: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('Could not save mentor state:', e);
  }
}

function loadMentorState() {
  try {
    const saved = localStorage.getItem('mentor_guide_state');
    if (saved) {
      const state = JSON.parse(saved);
      mentorState.viewedPanels = state.viewedPanels || mentorState.viewedPanels;
      console.log('🧭 Loaded mentor state:', mentorState.viewedPanels);
    }
  } catch (e) {
    console.warn('Could not load mentor state:', e);
  }
}

// ================================================================
// UTILITIES
// ================================================================

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ================================================================
// PUBLIC API
// ================================================================
// Expose focus-content loader so the unified Intelligence Brief
// panel can render the evidence-backed Current Focus without a separate modal.

window.MentorGuide = {
  renderFocusInto: async function (el) {
    // Ensure profile + supabase are available (they should be
    // since UnifiedNotifications.init fires after profile-loaded)
    if (!mentorState.currentUserProfile && window.appState?.communityProfile) {
      mentorState.currentUserProfile = window.appState.communityProfile;
    }
    if (!mentorState.supabase && window.supabase) {
      mentorState.supabase = window.supabase;
    }
    await loadFocusContent(el);
  }
};

console.log("✅ Mentor Guide ready");
