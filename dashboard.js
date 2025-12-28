// ================================================================
// DASHBOARD SYSTEM
// ================================================================
// Handles community stats, connections, discovery, and all dashboard features

console.log("%c🎯 Dashboard Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

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
  try {
    if (!currentUserProfile) {
      console.log('No profile, skipping stats');
      return;
    }
    
    // 1. Unread Messages Count
    const { data: userConversations } = await window.supabase
      .from('conversations')
      .select('id')
      .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`);
    
    const convIds = (userConversations || []).map(c => c.id);
    
    let unreadCount = 0;
    if (convIds.length > 0) {
      const { count } = await window.supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', currentUserProfile.id)
        .eq('read', false);
      
      unreadCount = count || 0;
    }
    
    const unreadEl = document.getElementById('unread-messages');
    if (unreadEl) unreadEl.textContent = unreadCount;
    
    const messagesTrendEl = document.getElementById('messages-trend');
    if (messagesTrendEl && unreadCount > 0) {
      messagesTrendEl.textContent = `${unreadCount} new`;
    } else if (messagesTrendEl) {
      messagesTrendEl.textContent = 'All caught up';
    }
    
    // 2. Active Projects Count
    const { count: activeProjects } = await window.supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', currentUserProfile.id)
      .eq('status', 'in-progress');
    
    const projectsEl = document.getElementById('active-projects');
    if (projectsEl) projectsEl.textContent = activeProjects || 0;
    
    const projectsTrendEl = document.getElementById('projects-trend');
    if (projectsTrendEl && activeProjects > 0) {
      projectsTrendEl.textContent = `${activeProjects} in progress`;
    } else if (projectsTrendEl) {
      projectsTrendEl.textContent = 'Start a project';
    }
    
    // 3. Total Endorsements Received
    const { count: endorsementsCount } = await window.supabase
      .from('endorsements')
      .select('*', { count: 'exact', head: true })
      .eq('endorsed_community_id', currentUserProfile.id);
    
    const endorsementsEl = document.getElementById('total-endorsements');
    if (endorsementsEl) endorsementsEl.textContent = endorsementsCount || 0;
    
    // Get endorsements from this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { count: weeklyEndorsements } = await window.supabase
      .from('endorsements')
      .select('*', { count: 'exact', head: true })
      .eq('endorsed_community_id', currentUserProfile.id)
      .gte('created_at', weekAgo.toISOString());
    
    const endorsementsTrendEl = document.getElementById('endorsements-trend');
    if (endorsementsTrendEl && weeklyEndorsements > 0) {
      endorsementsTrendEl.textContent = `+${weeklyEndorsements} this week`;
    } else if (endorsementsTrendEl) {
      endorsementsTrendEl.textContent = 'Get endorsed';
    }
    
    // 4. Network Size (Total Connections)
    const { count: networkSize } = await window.supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
    
    const networkEl = document.getElementById('network-size');
    if (networkEl) networkEl.textContent = networkSize || 0;
    
    // Get connections from this month
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const { count: monthlyConnections } = await window.supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .gte('created_at', monthAgo.toISOString());
    
    const networkTrendEl = document.getElementById('network-trend');
    if (networkTrendEl && monthlyConnections > 0) {
      networkTrendEl.textContent = `+${monthlyConnections} this month`;
    } else if (networkTrendEl) {
      networkTrendEl.textContent = 'Start networking';
    }
    
  } catch (err) {
    console.error('Error loading stats:', err);
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
    
    container.innerHTML = '';
    connections.forEach(conn => {
      const otherUser = conn.from_user_id === currentUserProfile.id ? conn.to_user : conn.from_user;
      const timeAgo = getTimeAgo(new Date(conn.created_at));
      
      const initials = getInitials(otherUser.name);
      const avatarHtml = otherUser.image_url 
        ? `<img src="${otherUser.image_url}" alt="${otherUser.name}">`
        : initials;
      
      container.innerHTML += `
        <div class="connection-item" onclick="viewProfile('${otherUser.id}')">
          <div class="connection-avatar">${avatarHtml}</div>
          <div class="connection-info">
            <div class="connection-name">${otherUser.name || 'Anonymous'}</div>
            <div class="connection-time">${timeAgo}</div>
          </div>
        </div>
      `;
    });
    
  } catch (err) {
    console.error('Error loading connections:', err);
    container.innerHTML = '<div class="empty-state"><p>Unable to load connections</p></div>';
    updateNetworkStats(0);
  }
}

function updateNetworkStats(connectionCount) {
  if (!currentUserProfile) return;
  
  const skills = parseSkills(currentUserProfile.skills);
  const networkStatsEl = document.getElementById('network-stats-hero');
  if (networkStatsEl) {
    networkStatsEl.textContent = 
      `${connectionCount} connection${connectionCount !== 1 ? 's' : ''} • ${skills.length} skill${skills.length !== 1 ? 's' : ''}`;
  }
  
  const synapseLabel = document.getElementById('mini-synapse-label');
  if (synapseLabel) {
    synapseLabel.textContent = 
      `Interactive visualization of your ${connectionCount} connection${connectionCount !== 1 ? 's' : ''}`;
  }
}

async function loadPendingRequests() {
  const container = document.getElementById('pending-requests');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>Create your profile first</p></div>';
      const pendingCountHero = document.getElementById('pending-count-hero');
      if (pendingCountHero) pendingCountHero.textContent = 'Create profile to connect';
      return;
    }
    
    const { data: requests } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(*)
      `)
      .eq('to_user_id', currentUserProfile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (!requests || requests.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All Clear!</h3><p>No pending requests</p></div>';
      const badge = document.getElementById('pending-count-badge');
      if (badge) badge.classList.add('hidden');
      const notif = document.getElementById('notif-count');
      if (notif) notif.classList.add('hidden');
      const hero = document.getElementById('pending-count-hero');
      if (hero) hero.textContent = 'No pending requests';
      return;
    }
    
    // Update badges
    const badge = document.getElementById('pending-count-badge');
    if (badge) {
      badge.textContent = requests.length;
      badge.classList.remove('hidden');
    }
    const notif = document.getElementById('notif-count');
    if (notif) {
      notif.textContent = requests.length;
      notif.classList.remove('hidden');
    }
    const hero = document.getElementById('pending-count-hero');
    if (hero) hero.textContent = `${requests.length} pending request${requests.length > 1 ? 's' : ''}`;
    
    container.innerHTML = '';
    requests.forEach(req => {
      const user = req.from_user;
      const skills = parseSkills(user.skills).slice(0, 3);
      const initials = getInitials(user.name);
      const avatarHtml = user.image_url 
        ? `<img src="${user.image_url}" alt="${user.name}">`
        : initials;
      
      const skillsHtml = skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
      
      container.innerHTML += `
        <div class="request-card">
          <div class="request-header">
            <div class="request-avatar">${avatarHtml}</div>
            <div class="request-info">
              <h4>${user.name || 'Anonymous'}</h4>
              <small style="color: #666;">${getTimeAgo(new Date(req.created_at))}</small>
            </div>
          </div>
          <div class="request-skills">${skillsHtml || '<span style="color:#666;">No skills listed</span>'}</div>
          <div class="request-actions">
            <button class="btn btn-accept" onclick="acceptRequest('${req.id}')">
              <i class="fas fa-check"></i> Accept
            </button>
            <button class="btn btn-decline" onclick="declineRequest('${req.id}')">
              <i class="fas fa-times"></i> Decline
            </button>
          </div>
        </div>
      `;
    });
    
  } catch (err) {
    console.error('Error loading requests:', err);
    container.innerHTML = '<div class="empty-state"><p>Error loading requests</p></div>';
  }
}

async function loadSuggestedConnections() {
  const container = document.getElementById('suggested-connections');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>Create your profile first</p></div>';
      return;
    }
    
    // Get all users except current user
    const { data: users } = await window.supabase
      .from('community')
      .select('*')
      .neq('id', currentUserProfile.id)
      .limit(20);
    
    if (!users || users.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No suggestions available</p></div>';
      return;
    }
    
    // Get existing connections
    const { data: connections } = await window.supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
    
    const connectedIds = new Set();
    connections?.forEach(conn => {
      if (conn.from_user_id === currentUserProfile.id) {
        connectedIds.add(conn.to_user_id);
      } else {
        connectedIds.add(conn.from_user_id);
      }
    });
    
    // Filter out connected users
    const suggestions = users.filter(u => !connectedIds.has(u.id)).slice(0, 6);
    
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No new suggestions</p></div>';
      return;
    }
    
    container.innerHTML = '<div class="three-col-grid" id="suggestions-grid"></div>';
    const grid = document.getElementById('suggestions-grid');
    
    suggestions.forEach(user => {
      const card = createProfileCard(user);
      grid.appendChild(card);
    });
    
  } catch (err) {
    console.error('Error loading suggestions:', err);
    container.innerHTML = '<div class="empty-state"><p>Error loading suggestions</p></div>';
  }
}

async function loadAllConnections() {
  const container = document.getElementById('connections-content');
  if (!container) return;
  
  container.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    if (!currentUserProfile) {
      container.innerHTML = '<div class="empty-state"><p>Create your profile to see connections</p></div>';
      return;
    }
    
    const { data: connections } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(*),
        to_user:community!connections_to_user_id_fkey(*)
      `)
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });
    
    if (!connections || connections.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No Connections Yet</h3><p>Start connecting with the community!</p></div>';
      return;
    }
    
    container.innerHTML = `<div class="three-col-grid" id="all-connections-grid"></div>`;
    const grid = document.getElementById('all-connections-grid');
    
    connections.forEach(conn => {
      const otherUser = conn.from_user_id === currentUserProfile.id ? conn.to_user : conn.from_user;
      const card = createProfileCard(otherUser);
      grid.appendChild(card);
    });
    
  } catch (err) {
    console.error('Error loading all connections:', err);
    container.innerHTML = '<div class="empty-state"><p>Error loading connections</p></div>';
  }
}

// ========================
// PROFILE CARD HELPER
// ========================
function createProfileCard(user) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.onclick = () => viewProfile(user.id);
  
  const skills = parseSkills(user.skills).slice(0, 3);
  const initials = getInitials(user.name);
  const avatarHtml = user.image_url 
    ? `<img src="${user.image_url}" alt="${user.name}">`
    : initials;
  
  card.innerHTML = `
    <div class="profile-card-avatar">${avatarHtml}</div>
    <h3>${user.name || 'Anonymous'}</h3>
    <div class="profile-card-skills">
      ${skills.map(s => `<span class="skill-tag">${s}</span>`).join('') || '<span style="color:#666;">No skills</span>'}
    </div>
    ${user.bio ? `<p class="profile-card-bio">${user.bio.substring(0, 80)}${user.bio.length > 80 ? '...' : ''}</p>` : ''}
  `;
  
  return card;
}

// ========================
// CONNECTION ACTIONS
// ========================
window.acceptRequest = async function(requestId) {
  try {
    const { error } = await window.supabase
      .from('connections')
      .update({ status: 'accepted' })
      .eq('id', requestId);
    
    if (error) throw error;
    
    await Promise.all([
      loadPendingRequests(),
      loadRecentConnections(),
      loadAllConnections()
    ]);
    
  } catch (err) {
    console.error('Error accepting request:', err);
    alert('Failed to accept request');
  }
};

window.declineRequest = async function(requestId) {
  try {
    const { error } = await window.supabase
      .from('connections')
      .delete()
      .eq('id', requestId);
    
    if (error) throw error;
    
    await loadPendingRequests();
    
  } catch (err) {
    console.error('Error declining request:', err);
    alert('Failed to decline request');
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
// MESSAGING STUB
// ========================
async function loadMessaging() {
  console.log('Messaging module - implement as needed');
  // Messaging functionality would go here
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
  if (!name) return '?';
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
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'just now';
}

// ========================
// EVENT LISTENER FOR PROFILE LOADED
// ========================
window.addEventListener('profile-loaded', async (e) => {
  console.log('📋 Dashboard: Profile loaded, loading dashboard data');
  const { profile, user } = e.detail;
  
  currentUser = user;
  currentUserProfile = profile;
  
  // Load all dashboard data (matching working monolith)
  await Promise.all([
    loadCommunityStats(),
    loadRecentConnections(),
    loadPendingRequests(),
    loadSuggestedConnections(),
    renderSynapse(),
    loadInnovationHub(),
    loadMessaging()
  ]);
  
  await loadAllConnections();
  
  // Setup discover tabs
  setupDiscoverTabs();
  
  // Setup event listeners
  setupEventListeners();
  
  console.log('✅ Dashboard loaded');
});

// Listen for logout
window.addEventListener('user-logged-out', () => {
  console.log('👋 Dashboard: User logged out, clearing state');
  currentUser = null;
  currentUserProfile = null;
});

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Dashboard DOM ready');
  // Dashboard will be loaded after authentication via profile-ready event
});

// ========================
// NO EXPORTS NEEDED
// ========================
// All functions are attached to window object and available globally
// The module communicates via custom events
