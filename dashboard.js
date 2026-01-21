// ================================================================
// DASHBOARD SYSTEM
// ================================================================
// Handles community stats, connections, discovery, and all dashboard features

console.log("%c🎯 Dashboard Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

// ========================
// EVENT LISTENERS - REGISTERED FIRST TO AVOID RACE CONDITIONS
// ========================
// These MUST be registered before auth fires events!

// Listen for profile loaded (after successful auth)
window.addEventListener('profile-loaded', async (e) => {
  console.log('📋 Dashboard: Profile loaded event received!');
  const { profile, user } = e.detail;
  
  currentUser = user;
  currentUserProfile = profile;
  
  console.log('🔄 Loading dashboard data...');
  
  try {
    // Load all dashboard data
    await Promise.all([
      loadCommunityStats(),
      loadRecentConnections(),
      loadPendingRequests(),
      loadSuggestedConnections(),
      // renderSynapse() removed - synapse is now the main view, initialized separately
      loadInnovationHub()
      // Note: loadMessaging() removed - messaging is initialized via MessagingModule.init()
    ]);
    
    await loadAllConnections();
    
    // Setup discover tabs
    setupDiscoverTabs();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Dashboard loaded successfully');
  } catch (err) {
    console.error('❌ Error loading dashboard:', err);
  }
});

// Listen for logout
window.addEventListener('user-logged-out', () => {
  console.log('👋 Dashboard: User logged out, clearing state');
  currentUser = null;
  currentUserProfile = null;
});

console.log('✅ Dashboard event listeners registered');

// Import connection functions from connections.js
import { 
  acceptConnectionRequest, 
  declineConnectionRequest,
  sendConnectionRequest 
} from './assets/js/connections.js';

// Import Supabase (should already be available via auth.js)
// window.supabase should be set by auth.js

// ========================
// GLOBAL STATE
// ========================
let currentUser = null;
let currentUserProfile = null;
let allUsers = [];
let teamSkills = [];
let teamSize = 4;

// ========================
// COMMUNITY STATS
// ========================
async function loadCommunityStats() {
  console.log('📊 Loading community stats...');
  try {
    if (!currentUserProfile) {
      console.log('⚠️ No profile, skipping stats');
      return;
    }
    
    console.log('✅ Profile found, loading stats for:', currentUserProfile.name);
    
    // 1. Unread Messages Count
    const { data: userConversations, error: convError } = await window.supabase
      .from('conversations')
      .select('id')
      .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`);
    
    if (convError) {
      console.error('❌ Error loading conversations:', convError);
      throw convError;
    }
    
    const convIds = (userConversations || []).map(c => c.id);
    
    let unreadCount = 0;
    if (convIds.length > 0) {
      const { count, error: msgError } = await window.supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', currentUser.id)
        .eq('read', false);
      
      if (msgError) {
        console.error('❌ Error loading unread messages:', msgError);
        throw msgError;
      }
      
      unreadCount = count || 0;
    }
    
    console.log('📧 Unread messages:', unreadCount);
    const unreadEl = document.getElementById('unread-messages');
    if (unreadEl) {
      unreadEl.textContent = unreadCount;
      console.log('✅ Updated unread-messages element');
    } else {
      console.error('❌ Element unread-messages not found');
    }
    
    const messagesTrendEl = document.getElementById('messages-trend');
    if (messagesTrendEl && unreadCount > 0) {
      messagesTrendEl.textContent = `${unreadCount} new`;
    } else if (messagesTrendEl) {
      messagesTrendEl.textContent = 'All caught up';
    }
    
    // 2. Active Projects Count
    const { count: activeProjects, error: projError } = await window.supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', currentUserProfile.id)
      .eq('status', 'in-progress');
    
    if (projError) {
      console.error('❌ Error loading projects:', projError);
      throw projError;
    }
    
    const projectsEl = document.getElementById('active-projects');
    if (projectsEl) projectsEl.textContent = activeProjects || 0;
    
    const projectsTrendEl = document.getElementById('projects-trend');
    if (projectsTrendEl && activeProjects > 0) {
      projectsTrendEl.textContent = `${activeProjects} in progress`;
    } else if (projectsTrendEl) {
      projectsTrendEl.textContent = 'Start a project';
    }
    
    // 3. Total Endorsements Received
    const { count: endorsementsCount, error: endorseError } = await window.supabase
      .from('endorsements')
      .select('*', { count: 'exact', head: true })
      .eq('endorsed_community_id', currentUserProfile.id);
    
    if (endorseError) {
      console.error('❌ Error loading endorsements:', endorseError);
      throw endorseError;
    }
    
    const endorsementsEl = document.getElementById('total-endorsements');
    if (endorsementsEl) endorsementsEl.textContent = endorsementsCount || 0;
    
    // Get endorsements from this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { count: weeklyEndorsements, error: weeklyError } = await window.supabase
      .from('endorsements')
      .select('*', { count: 'exact', head: true })
      .eq('endorsed_community_id', currentUserProfile.id)
      .gte('created_at', weekAgo.toISOString());
    
    if (weeklyError) {
      console.error('❌ Error loading weekly endorsements:', weeklyError);
      throw weeklyError;
    }
    
    const endorsementsTrendEl = document.getElementById('endorsements-trend');
    if (endorsementsTrendEl && weeklyEndorsements > 0) {
      endorsementsTrendEl.textContent = `+${weeklyEndorsements} this week`;
    } else if (endorsementsTrendEl) {
      endorsementsTrendEl.textContent = 'Get endorsed';
    }
    
    // 4. Network Size (Total Connections)
    const { count: networkSize, error: networkError } = await window.supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
    
    if (networkError) {
      console.error('❌ Error loading network size:', networkError);
      throw networkError;
    }
    
    const networkEl = document.getElementById('network-size');
    if (networkEl) networkEl.textContent = networkSize || 0;
    
    // Get connections from this month
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const { count: monthlyConnections, error: monthlyError } = await window.supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .gte('created_at', monthAgo.toISOString());
    
    if (monthlyError) {
      console.error('❌ Error loading monthly connections:', monthlyError);
      throw monthlyError;
    }
    
    const networkTrendEl = document.getElementById('network-trend');
    if (networkTrendEl && monthlyConnections > 0) {
      networkTrendEl.textContent = `+${monthlyConnections} this month`;
    } else if (networkTrendEl) {
      networkTrendEl.textContent = 'Start networking';
    }
    
    console.log('✅ Community stats loaded successfully');
    
  } catch (err) {
    console.error('❌ Error loading stats:', err);
    // Set fallback values
    const safeSet = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    safeSet('unread-messages', '0');
    safeSet('active-projects', '0');
    safeSet('total-endorsements', '0');
    safeSet('network-size', '0');
  }
}

// ========================
// NETWORK SECTION
// ========================
async function loadRecentConnections() {
  const container = document.getElementById('recent-connections');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>Create your profile to see connections</p></div>';
      const label = document.getElementById('mini-synapse-label');
      if (label) label.textContent = 'Create profile to see network';
      updateNetworkStats(0);
      return;
    }
    
    // Get user's connections
    const { data: connections, error } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(id, name, image_url),
        to_user:community!connections_to_user_id_fkey(id, name, image_url)
      `)
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('Error loading recent connections:', error);
      container.innerHTML = '<div class="empty-state"><p>Unable to load connections</p></div>';
      updateNetworkStats(0);
      return;
    }
    
    if (!connections || connections.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No connections yet</p></div>';
      updateNetworkStats(0);
      return;
    }
    
    updateNetworkStats(connections.length);
    
    let html = '<div class="connections-grid">';
    
    connections.forEach(conn => {
      const otherUser = conn.from_user_id === currentUserProfile.id 
        ? conn.to_user 
        : conn.from_user;
      
      if (!otherUser) return;
      
      const initials = getInitials(otherUser.name);
      const imageHTML = otherUser.image_url 
        ? `<img src="${otherUser.image_url}" alt="${otherUser.name}">`
        : `<div class="avatar-placeholder">${initials}</div>`;
      
      html += `
        <div class="connection-card" onclick="viewProfile('${otherUser.id}')">
          <div class="connection-avatar">
            ${imageHTML}
          </div>
          <div class="connection-info">
            <div class="connection-name">${otherUser.name}</div>
            <div class="connection-meta">Connected ${getTimeAgo(new Date(conn.created_at))}</div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (err) {
    console.error('Error in loadRecentConnections:', err);
    container.innerHTML = '<div class="empty-state"><p>Unable to load connections</p></div>';
    updateNetworkStats(0);
  }
}

function updateNetworkStats(count) {
  const statsEl = document.getElementById('network-stats');
  if (statsEl) {
    statsEl.textContent = `${count} connection${count !== 1 ? 's' : ''}`;
  }
}

async function loadPendingRequests() {
  const container = document.getElementById('pending-requests');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>No pending requests</p></div>';
      return;
    }
    
    // Get pending requests received by this user
    const { data: requests, error } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(id, name, image_url, skills)
      `)
      .eq('to_user_id', currentUserProfile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading pending requests:', error);
      container.innerHTML = '<div class="empty-state"><p>Unable to load requests</p></div>';
      return;
    }
    
    if (!requests || requests.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No pending requests</p></div>';
      return;
    }
    
    let html = '<div class="requests-list">';
    
    requests.forEach(req => {
      const user = req.from_user;
      if (!user) return;
      
      const initials = getInitials(user.name);
      const imageHTML = user.image_url 
        ? `<img src="${user.image_url}" alt="${user.name}">`
        : `<div class="avatar-placeholder">${initials}</div>`;
      
      const skills = parseSkills(user.skills);
      const skillsHTML = skills.length > 0
        ? skills.slice(0, 3).map(skill => `<span class="skill-tag">${skill}</span>`).join('')
        : '<span class="skill-tag">No skills listed</span>';
      
      html += `
        <div class="request-card">
          <div class="request-avatar">
            ${imageHTML}
          </div>
          <div class="request-info">
            <div class="request-name">${user.name}</div>
            <div class="request-skills">${skillsHTML}</div>
            <div class="request-time">${getTimeAgo(new Date(req.created_at))}</div>
          </div>
          <div class="request-actions">
            <button class="btn-accept" onclick="acceptRequest('${req.id}')">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn-decline" onclick="declineRequest('${req.id}')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (err) {
    console.error('Error in loadPendingRequests:', err);
    container.innerHTML = '<div class="empty-state"><p>Unable to load requests</p></div>';
  }
}

async function loadSuggestedConnections() {
  const container = document.getElementById('suggested-connections');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading smart suggestions...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>Create your profile to see suggestions</p></div>';
      return;
    }
    
    // Try to use smart suggestions if available
    if (typeof window.getSmartConnectionSuggestions === 'function') {
      console.log('✅ Using smart connection suggestions');
      
      const smartSuggestions = await window.getSmartConnectionSuggestions(4);
      
      if (smartSuggestions.length > 0) {
        let html = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h4 style="color: #00e0ff; margin: 0; font-size: 0.9rem;">
              <i class="fas fa-magic"></i> Smart Suggestions
            </h4>
            <button onclick="openConnectionDiscovery()" style="
              background: rgba(0, 224, 255, 0.1);
              border: 1px solid rgba(0, 224, 255, 0.3);
              color: #00e0ff;
              padding: 0.25rem 0.75rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.8rem;
              font-weight: 600;
            ">
              <i class="fas fa-search"></i> Discover More
            </button>
          </div>
          <div class="suggestions-grid">
        `;
        
        smartSuggestions.forEach(user => {
          const initials = getInitials(user.name);
          const imageHTML = user.image_url 
            ? `<img src="${user.image_url}" alt="${user.name}">`
            : `<div class="avatar-placeholder">${initials}</div>`;
          
          const matchScore = Math.round(user.score * 100);
          const topReason = user.reasons?.[0] || 'Good match';
          
          html += `
            <div class="suggestion-card smart-suggestion">
              <div class="suggestion-avatar">
                ${imageHTML}
              </div>
              <div class="suggestion-info">
                <div class="suggestion-name">${user.name}</div>
                <div class="match-indicator" style="
                  color: #ffd700;
                  font-size: 0.75rem;
                  font-weight: 600;
                  margin: 0.25rem 0;
                ">
                  <i class="fas fa-star"></i> ${matchScore}% match
                </div>
                <div class="suggestion-reason" style="
                  color: rgba(255, 255, 255, 0.7);
                  font-size: 0.75rem;
                  margin-bottom: 0.5rem;
                ">
                  ${topReason}
                </div>
              </div>
              <button class="btn-connect" onclick="sendRequest('${user.id}')">
                <i class="fas fa-user-plus"></i> Connect
              </button>
            </div>
          `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        return;
      }
    }
    
    // Fallback to basic suggestions
    console.log('⚠️ Using basic connection suggestions');
    await loadBasicSuggestions(container);
    
  } catch (err) {
    console.error('Error in loadSuggestedConnections:', err);
    await loadBasicSuggestions(container);
  }
}

// Fallback basic suggestions (original implementation)
async function loadBasicSuggestions(container) {
  try {
    // Get all users except current user
    const { data: users, error } = await window.supabase
      .from('community')
      .select('*')
      .neq('id', currentUserProfile.id)
      .limit(6);
    
    if (error) {
      console.error('Error loading basic suggestions:', error);
      container.innerHTML = '<div class="empty-state"><p>Unable to load suggestions</p></div>';
      return;
    }
    
    // Get existing connections and pending requests
    const { data: connections } = await window.supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
    
    const connectedIds = new Set();
    connections?.forEach(conn => {
      connectedIds.add(conn.from_user_id);
      connectedIds.add(conn.to_user_id);
    });
    
    // Filter out connected users
    const suggestions = users?.filter(user => !connectedIds.has(user.id)) || [];
    
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No new suggestions</p></div>';
      return;
    }
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h4 style="color: #00e0ff; margin: 0; font-size: 0.9rem;">
          <i class="fas fa-users"></i> People You May Know
        </h4>
        <button onclick="openConnectionDiscovery()" style="
          background: rgba(0, 224, 255, 0.1);
          border: 1px solid rgba(0, 224, 255, 0.3);
          color: #00e0ff;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
        ">
          <i class="fas fa-search"></i> Discover More
        </button>
      </div>
      <div class="suggestions-grid">
    `;
    
    suggestions.forEach(user => {
      const initials = getInitials(user.name);
      const imageHTML = user.image_url 
        ? `<img src="${user.image_url}" alt="${user.name}">`
        : `<div class="avatar-placeholder">${initials}</div>`;
      
      const skills = parseSkills(user.skills);
      const skillsHTML = skills.length > 0
        ? skills.slice(0, 2).map(skill => `<span class="skill-tag">${skill}</span>`).join('')
        : '';
      
      html += `
        <div class="suggestion-card">
          <div class="suggestion-avatar">
            ${imageHTML}
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${user.name}</div>
            ${skillsHTML ? `<div class="suggestion-skills">${skillsHTML}</div>` : ''}
          </div>
          <button class="btn-connect" onclick="sendRequest('${user.id}')">
            <i class="fas fa-user-plus"></i> Connect
          </button>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (err) {
    console.error('Error in loadBasicSuggestions:', err);
    container.innerHTML = '<div class="empty-state"><p>Unable to load suggestions</p></div>';
  }
}

async function loadAllConnections() {
  try {
    if (!currentUserProfile) return;
    
    const { data: users } = await window.supabase
      .from('community')
      .select('*');
    
    allUsers = users || [];
    
  } catch (err) {
    console.error('Error loading all users:', err);
  }
}

// ========================
// CONNECTION ACTIONS
// ========================
window.sendRequest = async function(userId) {
  try {
    await sendConnectionRequest(userId);
    
    // Reload suggested connections to remove the one we just sent
    await loadSuggestedConnections();
    
  } catch (err) {
    // Error already shown via toast notification from connections.js
    console.error('Error sending request:', err);
  }
};

window.acceptRequest = async function(requestId) {
  try {
    await acceptConnectionRequest(requestId);
    
    // Reload both pending requests and recent connections
    await Promise.all([
      loadPendingRequests(),
      loadRecentConnections()
    ]);
    
  } catch (err) {
    // Error already shown via toast notification from connections.js
    console.error('Error accepting request:', err);
  }
};

window.declineRequest = async function(requestId) {
  try {
    await declineConnectionRequest(requestId);
    
    // Reload pending requests to remove the declined one
    await loadPendingRequests();
    
  } catch (err) {
    // Error already shown via toast notification from connections.js
    console.error('Error declining request:', err);
  }
};

window.viewProfile = function(userId) {
  // This would open a profile modal - implement as needed
  console.log('View profile:', userId);
  alert('Profile viewing feature - implement modal here');
};

// ========================
// SYNAPSE VISUALIZATION
// ========================
async function renderSynapse() {
  try {
    if (!currentUserProfile) return;
    
    const { data: connections } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(id, name),
        to_user:community!connections_to_user_id_fkey(id, name)
      `)
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq('status', 'accepted');
    
    if (!connections || connections.length === 0) return;
    
    // Build nodes and links
    const nodesMap = new Map();
    const links = [];
    
    nodesMap.set(currentUserProfile.id, {
      id: currentUserProfile.id,
      name: currentUserProfile.name,
      isCenter: true
    });
    
    connections.forEach(conn => {
      const fromUser = conn.from_user;
      const toUser = conn.to_user;
      
      if (fromUser && !nodesMap.has(fromUser.id)) {
        nodesMap.set(fromUser.id, {
          id: fromUser.id,
          name: fromUser.name || 'User',
          isCenter: fromUser.id === currentUserProfile.id
        });
      }
      
      if (toUser && !nodesMap.has(toUser.id)) {
        nodesMap.set(toUser.id, {
          id: toUser.id,
          name: toUser.name || 'User',
          isCenter: toUser.id === currentUserProfile.id
        });
      }
      
      if (fromUser && toUser) {
        links.push({
          source: fromUser.id,
          target: toUser.id
        });
      }
    });
    
    const nodes = Array.from(nodesMap.values());
    
    // Update mini synapse label
    const label = document.getElementById('mini-synapse-label');
    if (label) {
      label.textContent = `${connections.length} connection${connections.length !== 1 ? 's' : ''}`;
    }
    
    console.log('Synapse data ready:', { nodes: nodes.length, links: links.length });
    
  } catch (err) {
    console.error('Synapse error:', err);
  }
}

// ========================
// INNOVATION HUB STUB
// ========================
async function loadInnovationHub() {
  console.log('Innovation Hub module - implement as needed');
  // Innovation hub functionality would go here
}

// ========================
// DISCOVER TABS
// ========================
function setupDiscoverTabs() {
  const tabs = document.querySelectorAll('.discover-tab');
  const panes = document.querySelectorAll('.discover-pane');
  
  if (!tabs.length || !panes.length) return;
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetPane = document.getElementById(target);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

// ========================
// EVENT LISTENERS
// ========================
function setupEventListeners() {
  // Search functionality
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const query = document.getElementById('people-search')?.value || '';
      console.log('Search:', query);
      // Implement search
    });
  }
  
  const peopleSearch = document.getElementById('people-search');
  if (peopleSearch) {
    peopleSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('Search:', e.target.value);
        // Implement search
      }
    });
  }
  
  // Profile toggle
  const profileToggle = document.getElementById('profile-toggle');
  if (profileToggle) {
    profileToggle.addEventListener('click', () => {
      const content = document.getElementById('profile-editor-content');
      if (content) content.classList.toggle('expanded');
    });
  }
  
  // FAB buttons
  const fabSynapse = document.getElementById('fab-synapse');
  if (fabSynapse) {
    fabSynapse.addEventListener('click', () => {
      const container = document.getElementById('synapse-container');
      if (container) container.classList.add('active');
    });
  }
  
  const closeSynapse = document.getElementById('close-synapse');
  if (closeSynapse) {
    closeSynapse.addEventListener('click', () => {
      const container = document.getElementById('synapse-container');
      if (container) container.classList.remove('active');
    });
  }
  
  const miniSynapse = document.getElementById('mini-synapse');
  if (miniSynapse) {
    miniSynapse.addEventListener('click', () => {
      fabSynapse?.click();
    });
  }
  
  console.log('✅ Event listeners setup');
}

// ========================
// UTILITY FUNCTIONS
// ========================
window.scrollToSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  }
};

function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'string') {
    return skills.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} : ago`;
    }
  }
  
  return 'just now';
}

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Dashboard DOM ready');
  // Dashboard will be loaded after authentication via profile-loaded event
});

// ========================
// NO EXPORTS NEEDED
// ========================
// All functions are attached to window object and available globally
// The module communicates via custom events
