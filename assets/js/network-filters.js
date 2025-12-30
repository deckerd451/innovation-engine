// ================================================================
// NETWORK FILTERS & SEMANTIC SEARCH
// ================================================================
// Advanced filtering and intelligent search for network exploration

console.log("%c🔍 Network Filters Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let filterPanel = null;
let supabase = null;
let currentUserProfile = null;
let onFilterChange = null;

// Filter state
let activeFilters = {
  skills: [],
  availability: [],
  roles: [],
  connectionStatus: 'all',
  degreeOfSeparation: 'all',
  hasProjects: false,
  searchQuery: ''
};

// Preset views
const PRESET_VIEWS = {
  mentors: {
    name: 'Mentors Available',
    icon: 'fa-chalkboard-teacher',
    description: 'People who can provide guidance',
    filters: { availability: ['Available for mentoring'] }
  },
  hiddenConnectors: {
    name: 'Hidden Connectors',
    icon: 'fa-network-wired',
    description: 'Highly connected individuals you haven\'t met',
    filters: { connectionStatus: 'not-connected', sortBy: 'connection_count' }
  },
  newMembers: {
    name: 'New Members',
    icon: 'fa-user-plus',
    description: 'Recently joined the network',
    filters: { sortBy: 'created_at', sortOrder: 'desc' }
  },
  projectCreators: {
    name: 'Project Creators',
    icon: 'fa-lightbulb',
    description: 'Active project leads',
    filters: { hasProjects: true }
  },
  suggested: {
    name: 'Suggested for You',
    icon: 'fa-star',
    description: 'Based on shared interests',
    filters: { connectionStatus: 'not-connected', matchScore: 'high' }
  }
};

// Initialize filters
export function initNetworkFilters(filterChangeCallback) {
  supabase = window.supabase;
  onFilterChange = filterChangeCallback;

  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  createFilterPanel();

  console.log('✅ Network filters initialized');
}

// Create filter panel UI
function createFilterPanel() {
  filterPanel = document.createElement('div');
  filterPanel.id = 'network-filter-panel';
  filterPanel.style.cssText = `
    position: fixed;
    top: 70px;
    left: -400px;
    width: 380px;
    height: calc(100vh - 70px);
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
    border-right: 2px solid rgba(0, 224, 255, 0.5);
    backdrop-filter: blur(10px);
    z-index: 1500;
    overflow-y: auto;
    transition: left 0.3s ease-out;
    box-shadow: 5px 0 30px rgba(0, 0, 0, 0.5);
  `;

  filterPanel.innerHTML = `
    <div style="padding: 2rem; padding-bottom: 100px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h2 style="color: #00e0ff; font-size: 1.5rem; margin: 0;">
          <i class="fas fa-filter"></i> Filters & Search
        </h2>
        <button onclick="closeFilterPanel()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 35px; height: 35px; border-radius: 50%; cursor: pointer;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Semantic Search -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-search"></i> Semantic Search
        </label>
        <input
          type="text"
          id="semantic-search-input"
          placeholder="e.g., 'AI + healthcare connectors'"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;"
        />
        <div style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">
          Try: "people connected to X within 2 hops", "designers with React skills", "available mentors in AI"
        </div>
      </div>

      <!-- Preset Views -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-eye"></i> Quick Views
        </label>
        <div id="preset-views-container" style="display: grid; gap: 0.75rem;">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Skills Filter -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-code"></i> Skills
        </label>
        <div id="skills-filter-container">
          <input
            type="text"
            id="skill-input"
            placeholder="Add skill..."
            style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; margin-bottom: 0.75rem;"
          />
          <div id="selected-skills" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <!-- Selected skills -->
          </div>
          <div id="suggested-skills" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            <!-- Common skills -->
          </div>
        </div>
      </div>

      <!-- Availability Filter -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-calendar-check"></i> Availability
        </label>
        <div id="availability-filter" style="display: flex; flex-direction: column; gap: 0.5rem;">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Roles Filter -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-user-tag"></i> Roles
        </label>
        <div id="roles-filter" style="display: flex; flex-direction: column; gap: 0.5rem;">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Connection Status -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-link"></i> Connection Status
        </label>
        <select id="connection-status-filter" onchange="updateConnectionStatusFilter(this.value)" style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
          <option value="all">All People</option>
          <option value="connected">Connected</option>
          <option value="pending">Pending Requests</option>
          <option value="not-connected">Not Connected</option>
        </select>
      </div>

      <!-- Degree of Separation -->
      <div style="margin-bottom: 2rem;">
        <label style="display: block; color: #00e0ff; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-project-diagram"></i> Degrees of Separation
        </label>
        <select id="degree-filter" onchange="updateDegreeFilter(this.value)" style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
          <option value="all">Show All</option>
          <option value="1">1st Degree (Direct)</option>
          <option value="2">Up to 2nd Degree</option>
          <option value="3">Up to 3rd Degree</option>
        </select>
      </div>

      <!-- Has Projects -->
      <div style="margin-bottom: 2rem;">
        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
          <input
            type="checkbox"
            id="has-projects-filter"
            onchange="updateProjectsFilter(this.checked)"
            style="width: 20px; height: 20px; cursor: pointer;"
          />
          <span style="color: white; font-size: 1rem;">
            <i class="fas fa-lightbulb"></i> Only show project creators
          </span>
        </label>
      </div>
    </div>

    <!-- Action Bar -->
    <div style="position: fixed; bottom: 0; left: 0; width: 380px; background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border-top: 2px solid rgba(0, 224, 255, 0.5); padding: 1rem; backdrop-filter: blur(10px);">
      <button onclick="clearAllFilters()" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-weight: bold; cursor: pointer; margin-bottom: 0.75rem;">
        <i class="fas fa-undo"></i> Clear All Filters
      </button>
      <button onclick="applyFilters()" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
        <i class="fas fa-check"></i> Apply Filters
      </button>
    </div>
  `;

  document.body.appendChild(filterPanel);

  // Initialize components
  loadPresetViews();
  loadSuggestedSkills();
  loadAvailabilityOptions();
  loadRoleOptions();
  setupSemanticSearch();
}

// Load preset views
function loadPresetViews() {
  const container = document.getElementById('preset-views-container');
  if (!container) return;

  let html = '';
  Object.entries(PRESET_VIEWS).forEach(([key, preset]) => {
    html += `
      <button onclick="applyPresetView('${key}')" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; text-align: left; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.15)'; this.style.borderColor='rgba(0,224,255,0.5)'" onmouseout="this.style.background='rgba(0,224,255,0.05)'; this.style.borderColor='rgba(0,224,255,0.2)'">
        <i class="fas ${preset.icon}" style="font-size: 1.5rem; color: #00e0ff;"></i>
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 0.25rem;">${preset.name}</div>
          <div style="color: #aaa; font-size: 0.85rem;">${preset.description}</div>
        </div>
      </button>
    `;
  });

  container.innerHTML = html;
}

// Load suggested skills
async function loadSuggestedSkills() {
  const container = document.getElementById('suggested-skills');
  if (!container) return;

  try {
    // Get top skills from community
    const { data: community } = await supabase
      .from('community')
      .select('skills')
      .not('skills', 'is', null);

    // Count skill frequency
    const skillCounts = {};
    community?.forEach(person => {
      if (person.skills) {
        const skills = person.skills.split(',').map(s => s.trim());
        skills.forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      }
    });

    // Get top 10 skills
    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill]) => skill);

    let html = '';
    topSkills.forEach(skill => {
      html += `
        <button onclick="addSkillFilter('${skill}')" style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.2)'" onmouseout="this.style.background='rgba(0,224,255,0.1)'">
          ${skill}
        </button>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading suggested skills:', error);
  }
}

// Load availability options
async function loadAvailabilityOptions() {
  const container = document.getElementById('availability-filter');
  if (!container) return;

  const availabilityOptions = [
    'Available now',
    'Available soon',
    'Available for mentoring',
    'Looking for opportunities',
    'Open to collaborations'
  ];

  let html = '';
  availabilityOptions.forEach(option => {
    html += `
      <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.15)'" onmouseout="this.style.background='rgba(0,224,255,0.05)'">
        <input type="checkbox" value="${option}" onchange="toggleAvailabilityFilter(this.value, this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
        <span style="color: white;">${option}</span>
      </label>
    `;
  });

  container.innerHTML = html;
}

// Load role options
async function loadRoleOptions() {
  const container = document.getElementById('roles-filter');
  if (!container) return;

  try {
    // Get unique roles from community
    const { data: community } = await supabase
      .from('community')
      .select('user_role')
      .not('user_role', 'is', null);

    const uniqueRoles = [...new Set(community?.map(p => p.user_role).filter(Boolean))];

    let html = '';
    uniqueRoles.forEach(role => {
      html += `
        <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.15)'" onmouseout="this.style.background='rgba(0,224,255,0.05)'">
          <input type="checkbox" value="${role}" onchange="toggleRoleFilter(this.value, this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
          <span style="color: white;">${role}</span>
        </label>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading roles:', error);
  }
}

// Setup semantic search
function setupSemanticSearch() {
  const input = document.getElementById('semantic-search-input');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      activeFilters.searchQuery = e.target.value;
      parseSemanticQuery(e.target.value);
    }, 500);
  });
}

// Parse semantic search queries
function parseSemanticQuery(query) {
  if (!query) return;

  const lowerQuery = query.toLowerCase();

  // Extract skills (common tech keywords)
  const skillKeywords = ['javascript', 'python', 'react', 'ai', 'ml', 'design', 'ux', 'backend', 'frontend', 'data', 'healthcare', 'blockchain'];
  const foundSkills = skillKeywords.filter(skill => lowerQuery.includes(skill));

  // Extract availability hints
  if (lowerQuery.includes('available') || lowerQuery.includes('mentor')) {
    activeFilters.availability = ['Available now', 'Available for mentoring'];
  }

  // Extract connection hints
  if (lowerQuery.includes('connected to') || lowerQuery.includes('hops') || lowerQuery.includes('degree')) {
    const degreeMatch = lowerQuery.match(/(\d+)\s*(hop|degree)/);
    if (degreeMatch) {
      activeFilters.degreeOfSeparation = degreeMatch[1];
    }
  }

  // Extract role hints
  if (lowerQuery.includes('designer')) {
    activeFilters.roles.push('Designer');
  }
  if (lowerQuery.includes('developer') || lowerQuery.includes('engineer')) {
    activeFilters.roles.push('Developer');
  }

  // Add found skills
  foundSkills.forEach(skill => {
    if (!activeFilters.skills.includes(skill)) {
      activeFilters.skills.push(skill);
    }
  });

  // Visual feedback
  if (foundSkills.length > 0 || activeFilters.availability.length > 0 || activeFilters.roles.length > 0) {
    showSemanticHint(`Searching for: ${[...foundSkills, ...activeFilters.availability, ...activeFilters.roles].join(', ')}`);
  }
}

function showSemanticHint(text) {
  const input = document.getElementById('semantic-search-input');
  if (!input) return;

  // Create hint element
  let hint = document.getElementById('semantic-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'semantic-hint';
    hint.style.cssText = `
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(0,224,255,0.1);
      border: 1px solid rgba(0,224,255,0.3);
      border-radius: 8px;
      color: #00e0ff;
      font-size: 0.85rem;
    `;
    input.parentNode.appendChild(hint);
  }

  hint.textContent = text;
}

// Filter management functions
window.addSkillFilter = function(skill) {
  if (!activeFilters.skills.includes(skill)) {
    activeFilters.skills.push(skill);
    renderSelectedSkills();
  }
};

window.removeSkillFilter = function(skill) {
  activeFilters.skills = activeFilters.skills.filter(s => s !== skill);
  renderSelectedSkills();
};

function renderSelectedSkills() {
  const container = document.getElementById('selected-skills');
  if (!container) return;

  if (activeFilters.skills.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  activeFilters.skills.forEach(skill => {
    html += `
      <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border-radius: 8px; color: white; font-size: 0.9rem;">
        <span>${skill}</span>
        <button onclick="removeSkillFilter('${skill}')" style="background: none; border: none; color: white; cursor: pointer; padding: 0; font-size: 1rem;">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.toggleAvailabilityFilter = function(value, checked) {
  if (checked) {
    if (!activeFilters.availability.includes(value)) {
      activeFilters.availability.push(value);
    }
  } else {
    activeFilters.availability = activeFilters.availability.filter(a => a !== value);
  }
};

window.toggleRoleFilter = function(value, checked) {
  if (checked) {
    if (!activeFilters.roles.includes(value)) {
      activeFilters.roles.push(value);
    }
  } else {
    activeFilters.roles = activeFilters.roles.filter(r => r !== value);
  }
};

window.updateConnectionStatusFilter = function(value) {
  activeFilters.connectionStatus = value;
};

window.updateDegreeFilter = function(value) {
  activeFilters.degreeOfSeparation = value;
};

window.updateProjectsFilter = function(checked) {
  activeFilters.hasProjects = checked;
};

window.clearAllFilters = function() {
  activeFilters = {
    skills: [],
    availability: [],
    roles: [],
    connectionStatus: 'all',
    degreeOfSeparation: 'all',
    hasProjects: false,
    searchQuery: ''
  };

  // Reset UI
  document.querySelectorAll('#availability-filter input, #roles-filter input').forEach(cb => {
    cb.checked = false;
  });
  document.getElementById('connection-status-filter').value = 'all';
  document.getElementById('degree-filter').value = 'all';
  document.getElementById('has-projects-filter').checked = false;
  document.getElementById('semantic-search-input').value = '';

  renderSelectedSkills();

  // Apply cleared filters
  applyFilters();
};

window.applyPresetView = function(presetKey) {
  const preset = PRESET_VIEWS[presetKey];
  if (!preset) return;

  // Apply preset filters
  activeFilters = {
    skills: [],
    availability: [],
    roles: [],
    connectionStatus: 'all',
    degreeOfSeparation: 'all',
    hasProjects: false,
    searchQuery: '',
    ...preset.filters
  };

  applyFilters();
};

window.applyFilters = function() {
  console.log('Applying filters:', activeFilters);

  if (onFilterChange) {
    onFilterChange(activeFilters);
  }

  // Show notification
  showFilterNotification(`Filters applied`);
};

function showFilterNotification(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #00e0ff, #0080ff);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    font-weight: bold;
    animation: slideUp 0.3s ease-out;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideDown 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Panel controls
export function openFilterPanel() {
  filterPanel.style.left = '0';
}

export function closeFilterPanel() {
  filterPanel.style.left = '-400px';
}

window.openFilterPanel = openFilterPanel;
window.closeFilterPanel = closeFilterPanel;

// Toggle filter panel
export function toggleFilterPanel() {
  if (filterPanel.style.left === '0px') {
    closeFilterPanel();
  } else {
    openFilterPanel();
  }
}

window.toggleFilterPanel = toggleFilterPanel;

console.log('✅ Network filters ready');
