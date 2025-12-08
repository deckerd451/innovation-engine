// searchEngine.js - Search functionality with privacy controls
// Features: skill search, name search, connection-aware privacy

import {
  getConnectionStatus,
  canSeeEmail,
  sendConnectionRequest,
  getCurrentUserCommunityId
} from './connections.js';

let supabase = null;
let allMembers = [];
let allSkills = [];

// Initialize search engine
export async function initSearchEngine(supabaseClient) {
  // Use passed client or fall back to window.supabase
  supabase = supabaseClient || window.supabase;
  
  if (!supabase) {
    console.warn('Supabase not available for search engine');
    return;
  }
  
  // Load initial data
  await loadCommunityData();
  await loadSkillsList();
  
  // Setup event listeners
  setupSearchListeners();
  setupAutocomplete();
  
  console.log('%c✓ Search Engine initialized', 'color: #0f0');
}

// Load community members
async function loadCommunityData() {
  console.log('%c🔍 Loading community for search...', 'color: #0ff');
  
  if (!supabase) {
    console.warn('Supabase not available');
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('community')
      .select('id, name, email, image_url, skills, bio, availability, user_id, connection_count')
      .order('name');

    if (error) throw error;
    
    allMembers = (data || []).map(m => ({
      ...m,
      skills: parseSkills(m.skills)
    }));
    
    console.log(`Loaded ${allMembers.length} members`);
  } catch (err) {
    console.error('Error loading community:', err);
  }
}

// Load skills list for autocomplete
async function loadSkillsList() {
  if (!supabase) return;
  
  try {
    // Get unique skills from community
    const skillSet = new Set();
    allMembers.forEach(m => {
      m.skills.forEach(s => skillSet.add(s.toLowerCase()));
    });
    
    // Also fetch from skills table if it exists
    const { data: skillsData } = await supabase
      .from('skills')
      .select('skill');
    
    (skillsData || []).forEach(s => {
      if (s.skill) skillSet.add(s.skill.toLowerCase());
    });
    
    allSkills = Array.from(skillSet).sort();
  } catch (err) {
    console.warn('Could not load skills list:', err);
  }
}

// Parse skills helper
function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// Setup search listeners
function setupSearchListeners() {
  // Skill search
  const findTeamBtn = document.getElementById('find-team-btn');
  const teamSkillsInput = document.getElementById('teamSkillsInput');
  
  if (findTeamBtn) {
    findTeamBtn.addEventListener('click', () => searchBySkills());
  }
  
  if (teamSkillsInput) {
    teamSkillsInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchBySkills();
    });
  }

  // Name search
  const searchNameBtn = document.getElementById('search-name-btn');
  const nameInput = document.getElementById('nameInput');
  
  if (searchNameBtn) {
    searchNameBtn.addEventListener('click', () => searchByName());
  }
  
  if (nameInput) {
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchByName();
    });
  }
}

// Setup autocomplete
function setupAutocomplete() {
  // Skills autocomplete
  const teamSkillsInput = document.getElementById('teamSkillsInput');
  const autocompleteBox = document.getElementById('autocomplete-team-skills');
  
  if (teamSkillsInput && autocompleteBox) {
    setupSkillAutocomplete(teamSkillsInput, autocompleteBox);
  }

  // Name autocomplete
  const nameInput = document.getElementById('nameInput');
  const nameAutocomplete = document.getElementById('autocomplete-names');
  
  if (nameInput && nameAutocomplete) {
    setupNameAutocomplete(nameInput, nameAutocomplete);
  }
}

// Skill autocomplete
function setupSkillAutocomplete(input, dropdown) {
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase().trim();
    dropdown.innerHTML = '';
    
    if (value.length < 2) {
      dropdown.style.display = 'none';
      return;
    }
    
    const matches = allSkills.filter(s => s.includes(value)).slice(0, 8);
    
    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    matches.forEach(skill => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = skill;
      item.addEventListener('click', () => {
        // Add to existing skills
        const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
        if (!current.map(c => c.toLowerCase()).includes(skill)) {
          current.push(skill);
        }
        input.value = current.join(', ');
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
  });
  
  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// Name autocomplete
function setupNameAutocomplete(input, dropdown) {
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase().trim();
    dropdown.innerHTML = '';
    
    if (value.length < 2) {
      dropdown.style.display = 'none';
      return;
    }
    
    const matches = allMembers
      .filter(m => m.name?.toLowerCase().includes(value))
      .slice(0, 8);
    
    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    matches.forEach(member => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <span class="autocomplete-name">${member.name}</span>
        <span class="autocomplete-skills">${member.skills.slice(0, 3).join(', ')}</span>
      `;
      item.addEventListener('click', () => {
        input.value = member.name;
        dropdown.style.display = 'none';
        searchByName();
      });
      dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
  });
  
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// ========================
// SEARCH FUNCTIONS
// ========================

// Search by skills
async function searchBySkills() {
  const input = document.getElementById('teamSkillsInput');
  const container = document.getElementById('cardContainer');
  const notification = document.getElementById('matchNotification');
  const noResults = document.getElementById('noResults');
  
  if (!input || !container) return;
  
  const searchSkills = input.value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  
  if (searchSkills.length === 0) {
    showSearchNotification('Please enter at least one skill to search.', 'info');
    return;
  }
  
  // Find matching members
  const results = allMembers.filter(member => {
    const memberSkills = member.skills.map(s => s.toLowerCase());
    return searchSkills.some(searchSkill => 
      memberSkills.some(ms => ms.includes(searchSkill))
    );
  });
  
  // Sort by number of matching skills
  results.sort((a, b) => {
    const aMatches = a.skills.filter(s => 
      searchSkills.some(ss => s.toLowerCase().includes(ss))
    ).length;
    const bMatches = b.skills.filter(s => 
      searchSkills.some(ss => s.toLowerCase().includes(ss))
    ).length;
    return bMatches - aMatches;
  });
  
  // Render results
  await renderSearchResults(results, container);
  
  // Show notification
  if (results.length > 0) {
    notification?.classList.remove('hidden');
    notification.textContent = `Found ${results.length} matching people`;
    notification.className = 'notification success';
    noResults?.classList.add('hidden');
  } else {
    notification?.classList.add('hidden');
    noResults?.classList.remove('hidden');
    noResults.textContent = 'No matches found. Try different skills.';
    noResults.className = 'notification info';
  }
}

// Search by name
async function searchByName() {
  const input = document.getElementById('nameInput');
  const container = document.getElementById('cardContainer');
  const notification = document.getElementById('matchNotification');
  const noResults = document.getElementById('noResults');
  
  if (!input || !container) return;
  
  const searchName = input.value.trim().toLowerCase();
  
  if (searchName.length < 2) {
    showSearchNotification('Please enter at least 2 characters.', 'info');
    return;
  }
  
  const results = allMembers.filter(member =>
    member.name?.toLowerCase().includes(searchName)
  );
  
  await renderSearchResults(results, container);
  
  if (results.length > 0) {
    notification?.classList.remove('hidden');
    notification.textContent = `Found ${results.length} matching people`;
    notification.className = 'notification success';
    noResults?.classList.add('hidden');
  } else {
    notification?.classList.add('hidden');
    noResults?.classList.remove('hidden');
    noResults.textContent = 'No matches found.';
    noResults.className = 'notification info';
  }
}

// ========================
// RENDER RESULTS
// ========================

async function renderSearchResults(results, container) {
  container.innerHTML = '';
  
  const currentUserCommunityId = getCurrentUserCommunityId();
  
  for (const member of results) {
    const card = await createProfileCard(member, currentUserCommunityId);
    container.appendChild(card);
  }
}

// Create a profile card with privacy controls
async function createProfileCard(member, currentUserCommunityId) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.dataset.id = member.id;
  
  // Check connection status and email visibility
  const connStatus = await getConnectionStatus(member.id);
  const showEmail = await canSeeEmail(member.id);
  const isCurrentUser = member.id === currentUserCommunityId;
  
  // Avatar
  const initials = getInitials(member.name);
  const avatarColor = getAvatarColor(member.name);
  
  let avatarHtml;
  if (member.image_url) {
    avatarHtml = `
      <img src="${member.image_url}" alt="${member.name}" 
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="avatar-initials" style="display:none; background:${avatarColor};">${initials}</div>
    `;
  } else {
    avatarHtml = `<div class="avatar-initials" style="background:${avatarColor};">${initials}</div>`;
  }
  
  // Skills
  const skillsHtml = member.skills.length > 0
    ? member.skills.slice(0, 6).map(s => `<span class="skill-tag">${s}</span>`).join('')
    : '<span class="skill-tag" style="opacity:0.5;">No skills listed</span>';
  
  // Email (privacy controlled)
  const emailHtml = showEmail && member.email
    ? `<div class="card-email"><i class="fas fa-envelope"></i> ${member.email}</div>`
    : '';
  
  // Connection action
  let actionHtml = '';
  if (!isCurrentUser) {
    if (connStatus.status === 'none' || connStatus.canConnect) {
      actionHtml = `
        <button class="connect-btn action-btn" data-id="${member.id}">
          <i class="fas fa-user-plus"></i> Connect
        </button>
      `;
    } else if (connStatus.status === 'pending' && connStatus.isSender) {
      actionHtml = `
        <button class="pending-btn action-btn" disabled>
          <i class="fas fa-clock"></i> Pending
        </button>
      `;
    } else if (connStatus.status === 'pending' && connStatus.isReceiver) {
      actionHtml = `
        <div class="connection-actions">
          <button class="accept-btn action-btn" data-id="${connStatus.connectionId}">
            <i class="fas fa-check"></i> Accept
          </button>
          <button class="decline-btn action-btn" data-id="${connStatus.connectionId}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    } else if (connStatus.status === 'accepted') {
      actionHtml = `
        <div class="connected-badge">
          <i class="fas fa-check-circle"></i> Connected
        </div>
      `;
    }
  }
  
  card.innerHTML = `
    <div class="card-avatar">${avatarHtml}</div>
    <div class="card-name">${member.name || 'Anonymous'}</div>
    ${emailHtml}
    <div class="card-bio">${member.bio || 'No bio available'}</div>
    <div class="card-skills">${skillsHtml}</div>
    <div class="card-availability ${(member.availability || 'available').toLowerCase().replace(/\s+/g, '-')}">
      ${member.availability || 'Available'}
    </div>
    <div class="card-actions">${actionHtml}</div>
  `;
  
  // Attach event listeners
  attachCardListeners(card, member);
  
  return card;
}

// Attach event listeners to card
function attachCardListeners(card, member) {
  // Connect button
  const connectBtn = card.querySelector('.connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        await sendConnectionRequest(member.id);
        
        showSearchNotification('Connection request sent!', 'success');
        
        // Update button
        connectBtn.innerHTML = '<i class="fas fa-clock"></i> Pending';
        connectBtn.className = 'pending-btn action-btn';
      } catch (err) {
        showSearchNotification(err.message, 'error');
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<i class="fas fa-user-plus"></i> Connect';
      }
    });
  }
  
  // Accept button
  const acceptBtn = card.querySelector('.accept-btn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const { acceptConnectionRequest } = await import('./connections.js');
        await acceptConnectionRequest(acceptBtn.dataset.id);
        showSearchNotification('Connection accepted!', 'success');
        
        // Refresh card
        const newCard = await createProfileCard(member, getCurrentUserCommunityId());
        card.replaceWith(newCard);
      } catch (err) {
        showSearchNotification(err.message, 'error');
      }
    });
  }
  
  // Decline button
  const declineBtn = card.querySelector('.decline-btn');
  if (declineBtn) {
    declineBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const { declineConnectionRequest } = await import('./connections.js');
        await declineConnectionRequest(declineBtn.dataset.id);
        showSearchNotification('Connection declined.', 'info');
        
        // Refresh card
        const newCard = await createProfileCard(member, getCurrentUserCommunityId());
        card.replaceWith(newCard);
      } catch (err) {
        showSearchNotification(err.message, 'error');
      }
    });
  }
}

// ========================
// HELPERS
// ========================

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
    '#f43f5e', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'
  ];
  let hash = 0;
  const str = name || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function showSearchNotification(message, type = 'info') {
  const existing = document.querySelector('.search-notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = `search-notification notification ${type}`;
  notif.style.cssText = 'position:fixed; top:20px; right:20px; z-index:15000; max-width:300px;';
  notif.textContent = message;
  document.body.appendChild(notif);
  
  setTimeout(() => notif.remove(), 3000);
}

// Refresh data (call after profile changes)
export async function refreshSearchData() {
  await loadCommunityData();
}

// Export for module use
export default {
  initSearchEngine,
  refreshSearchData
};
