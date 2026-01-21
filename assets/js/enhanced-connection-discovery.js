// ================================================================
// ENHANCED CONNECTION DISCOVERY INTERFACE
// ================================================================
// Advanced people discovery with smart suggestions, filters, and search

console.log("%c🔍 Enhanced Connection Discovery Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let allUsers = [];
let filteredUsers = [];
let currentFilters = {
  skills: [],
  availability: '',
  role: '',
  searchTerm: ''
};

// Initialize enhanced discovery
export function initEnhancedConnectionDiscovery() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Listen for smart suggestions updates
  document.addEventListener('smart-suggestions-updated', (e) => {
    updateSmartSuggestionsUI(e.detail.suggestions);
  });

  // Expose functions globally
  window.openConnectionDiscovery = openConnectionDiscovery;
  window.closeConnectionDiscovery = closeConnectionDiscovery;
  window.applyDiscoveryFilters = applyDiscoveryFilters;
  window.clearDiscoveryFilters = clearDiscoveryFilters;
  window.searchConnections = searchConnections;

  console.log('✅ Enhanced connection discovery initialized');
}

// Open connection discovery modal
export async function openConnectionDiscovery() {
  console.log('🔍 Opening connection discovery...');

  // Remove existing modal if present
  const existing = document.getElementById('connection-discovery-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'connection-discovery-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  modal.innerHTML = `
    <div class="discovery-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1200px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="discovery-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-users"></i> Discover Connections
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Find people to collaborate with using smart recommendations
            </p>
          </div>
          <button onclick="closeConnectionDiscovery()" style="
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
            transition: all 0.2s;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Search and Filters -->
      <div class="discovery-filters" style="
        padding: 1.5rem 2rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
      ">
        <!-- Search Bar -->
        <div style="margin-bottom: 1.5rem;">
          <div style="position: relative;">
            <input type="text" id="connection-search" placeholder="Search by name, skills, or role..." style="
              width: 100%;
              padding: 0.875rem 1rem 0.875rem 3rem;
              background: rgba(0, 224, 255, 0.05);
              border: 2px solid rgba(0, 224, 255, 0.3);
              border-radius: 8px;
              color: white;
              font-size: 1rem;
              transition: border-color 0.2s;
            ">
            <i class="fas fa-search" style="
              position: absolute;
              left: 1rem;
              top: 50%;
              transform: translateY(-50%);
              color: rgba(0, 224, 255, 0.6);
            "></i>
          </div>
        </div>

        <!-- Filter Tabs -->
        <div class="filter-tabs" style="
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        ">
          <button class="filter-tab active" data-tab="smart" style="
            padding: 0.5rem 1rem;
            background: rgba(0, 224, 255, 0.2);
            border: 1px solid rgba(0, 224, 255, 0.4);
            border-radius: 6px;
            color: #00e0ff;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          ">
            <i class="fas fa-magic"></i> Smart Suggestions
          </button>
          <button class="filter-tab" data-tab="all" style="
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          ">
            <i class="fas fa-list"></i> All People
          </button>
          <button class="filter-tab" data-tab="skills" style="
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          ">
            <i class="fas fa-code"></i> By Skills
          </button>
          <button class="filter-tab" data-tab="activity" style="
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          ">
            <i class="fas fa-clock"></i> Recent Activity
          </button>
        </div>

        <!-- Advanced Filters (Initially Hidden) -->
        <div id="advanced-filters" style="display: none;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div>
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-size: 0.9rem;">
                Availability
              </label>
              <select id="availability-filter" style="
                width: 100%;
                padding: 0.5rem;
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: white;
                font-size: 0.9rem;
              ">
                <option value="">Any</option>
                <option value="Available">Available</option>
                <option value="Busy">Busy</option>
                <option value="Open to opportunities">Open to opportunities</option>
              </select>
            </div>
            <div>
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-size: 0.9rem;">
                Role
              </label>
              <select id="role-filter" style="
                width: 100%;
                padding: 0.5rem;
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: white;
                font-size: 0.9rem;
              ">
                <option value="">Any Role</option>
                <option value="Developer">Developer</option>
                <option value="Designer">Designer</option>
                <option value="Product Manager">Product Manager</option>
                <option value="Student">Student</option>
                <option value="Entrepreneur">Entrepreneur</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Filter Actions -->
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button onclick="toggleAdvancedFilters()" style="
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-size: 0.9rem;
          ">
            <i class="fas fa-sliders-h"></i> Advanced Filters
          </button>
          <button onclick="clearDiscoveryFilters()" style="
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-size: 0.9rem;
          ">
            <i class="fas fa-times"></i> Clear
          </button>
        </div>
      </div>

      <!-- Results Area -->
      <div class="discovery-results" style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <div id="discovery-content">
          <div class="loading-state" style="
            text-align: center;
            padding: 3rem;
            color: rgba(255, 255, 255, 0.6);
          ">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Loading smart suggestions...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .filter-tab.active {
      background: rgba(0, 224, 255, 0.2) !important;
      border-color: rgba(0, 224, 255, 0.4) !important;
      color: #00e0ff !important;
    }

    .filter-tab:hover {
      background: rgba(0, 224, 255, 0.1) !important;
      border-color: rgba(0, 224, 255, 0.3) !important;
    }

    .smart-suggestion-card {
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.3s;
    }

    .smart-suggestion-card:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 224, 255, 0.1);
    }

    .suggestion-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .suggestion-avatar img,
    .avatar-placeholder {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      object-fit: cover;
    }

    .avatar-placeholder {
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 1.2rem;
    }

    .suggestion-name {
      color: #00e0ff;
      font-size: 1.1rem;
      font-weight: bold;
      margin-bottom: 0.25rem;
    }

    .suggestion-role {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;
      margin-bottom: 0.25rem;
    }

    .match-score {
      color: #ffd700;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .suggestion-reasons {
      margin-bottom: 1rem;
    }

    .reason-item {
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.85rem;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .reason-item i {
      color: #00ff88;
      font-size: 0.75rem;
    }

    .suggestion-skills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .skill-tag {
      background: rgba(0, 224, 255, 0.15);
      border: 1px solid rgba(0, 224, 255, 0.3);
      color: #00e0ff;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .skill-more {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.8rem;
      padding: 0.25rem 0.5rem;
    }

    .suggestion-actions {
      display: flex;
      gap: 0.75rem;
    }

    .btn-connect-smart {
      flex: 1;
      padding: 0.75rem 1rem;
      background: linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2));
      border: 1px solid rgba(0, 224, 255, 0.5);
      border-radius: 8px;
      color: #00e0ff;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.2s;
    }

    .btn-connect-smart:hover {
      background: linear-gradient(135deg, rgba(0, 224, 255, 0.4), rgba(0, 224, 255, 0.3));
      transform: translateY(-1px);
    }

    .btn-explain {
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-explain:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }

    #connection-search:focus {
      border-color: rgba(0, 224, 255, 0.6);
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 224, 255, 0.1);
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Initialize the modal
  await initializeDiscoveryModal();

  // Setup event listeners
  setupDiscoveryEventListeners();

  console.log('✅ Connection discovery modal opened');
}

// Initialize discovery modal with data
async function initializeDiscoveryModal() {
  // Load smart suggestions by default
  await loadSmartSuggestions();
}

// Load smart suggestions
async function loadSmartSuggestions() {
  const content = document.getElementById('discovery-content');
  if (!content) return;

  try {
    // Import smart suggestions module
    const { getSmartConnectionSuggestions, renderSmartSuggestionCard } = await import('./smart-connection-suggestions.js');
    
    content.innerHTML = `
      <div class="loading-state" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Analyzing compatibility...</p>
      </div>
    `;

    const suggestions = await getSmartConnectionSuggestions(8);
    
    if (suggestions.length === 0) {
      content.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-users" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">No suggestions available</h3>
          <p>Try connecting with more people or completing your profile for better suggestions.</p>
        </div>
      `;
      return;
    }

    // Cache suggestions for explanation feature
    window.cachedSuggestions = suggestions;

    let html = `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-magic"></i> Smart Suggestions (${suggestions.length})
        </h3>
        <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 1.5rem;">
          People recommended based on your skills, interests, and activity patterns.
        </p>
      </div>
      <div class="suggestions-grid">
    `;

    suggestions.forEach(suggestion => {
      html += renderSmartSuggestionCard(suggestion);
    });

    html += '</div>';
    content.innerHTML = html;

  } catch (error) {
    console.error('Error loading smart suggestions:', error);
    content.innerHTML = `
      <div class="error-state" style="text-align: center; padding: 3rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to load suggestions. Please try again.</p>
      </div>
    `;
  }
}

// Setup event listeners
function setupDiscoveryEventListeners() {
  // Search input
  const searchInput = document.getElementById('connection-search');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchConnections(e.target.value);
      }, 300);
    });
  }

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      // Update active tab
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');

      // Load content based on tab
      const tabType = e.target.dataset.tab;
      loadTabContent(tabType);
    });
  });

  // Close modal on backdrop click
  const modal = document.getElementById('connection-discovery-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeConnectionDiscovery();
      }
    });
  }
}

// Load content based on selected tab
async function loadTabContent(tabType) {
  const content = document.getElementById('discovery-content');
  if (!content) return;

  content.innerHTML = `
    <div class="loading-state" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Loading...</p>
    </div>
  `;

  switch (tabType) {
    case 'smart':
      await loadSmartSuggestions();
      break;
    case 'all':
      await loadAllPeople();
      break;
    case 'skills':
      await loadPeopleBySkills();
      break;
    case 'activity':
      await loadRecentlyActive();
      break;
  }
}

// Load all people
async function loadAllPeople() {
  // Implementation for loading all people with basic cards
  const content = document.getElementById('discovery-content');
  content.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6);">All people view - Coming soon!</p>';
}

// Load people by skills
async function loadPeopleBySkills() {
  // Implementation for skill-based filtering
  const content = document.getElementById('discovery-content');
  content.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6);">Skills-based discovery - Coming soon!</p>';
}

// Load recently active people
async function loadRecentlyActive() {
  // Implementation for activity-based filtering
  const content = document.getElementById('discovery-content');
  content.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6);">Recent activity view - Coming soon!</p>';
}

// Toggle advanced filters
window.toggleAdvancedFilters = function() {
  const filters = document.getElementById('advanced-filters');
  if (filters) {
    filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
  }
};

// Apply discovery filters
window.applyDiscoveryFilters = function() {
  // Implementation for applying filters
  console.log('Applying discovery filters...');
};

// Clear discovery filters
window.clearDiscoveryFilters = function() {
  // Clear all filter inputs
  const searchInput = document.getElementById('connection-search');
  const availabilityFilter = document.getElementById('availability-filter');
  const roleFilter = document.getElementById('role-filter');

  if (searchInput) searchInput.value = '';
  if (availabilityFilter) availabilityFilter.value = '';
  if (roleFilter) roleFilter.value = '';

  // Reset to smart suggestions
  const smartTab = document.querySelector('[data-tab="smart"]');
  if (smartTab) {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    smartTab.classList.add('active');
    loadSmartSuggestions();
  }
};

// Search connections
window.searchConnections = function(searchTerm) {
  console.log('Searching connections for:', searchTerm);
  // Implementation for search functionality
};

// Update smart suggestions UI
function updateSmartSuggestionsUI(suggestions) {
  const content = document.getElementById('discovery-content');
  if (!content) return;

  // Only update if we're currently showing smart suggestions
  const activeTab = document.querySelector('.filter-tab.active');
  if (!activeTab || activeTab.dataset.tab !== 'smart') return;

  // Re-render with new suggestions
  window.cachedSuggestions = suggestions;
  loadSmartSuggestions();
}

// Close connection discovery modal
window.closeConnectionDiscovery = function() {
  const modal = document.getElementById('connection-discovery-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Connection discovery modal closed');
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initEnhancedConnectionDiscovery();
});

console.log('✅ Enhanced connection discovery ready');