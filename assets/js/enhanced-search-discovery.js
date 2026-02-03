// ================================================================
// ENHANCED SEARCH & DISCOVERY SYSTEM
// ================================================================
// Comprehensive search across people, projects, themes, and skills with advanced filtering

console.log("%c🔍 Enhanced Search & Discovery Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let searchCache = {
  people: [],
  projects: [],
  themes: [],
  skills: new Set(),
  lastUpdated: null
};

// Search categories and their configurations
const SEARCH_CATEGORIES = {
  ALL: { 
    id: 'all', 
    name: 'All Results', 
    icon: 'fas fa-search',
    description: 'Search across all content types'
  },
  PEOPLE: { 
    id: 'people', 
    name: 'People', 
    icon: 'fas fa-users',
    description: 'Find community members by name, skills, or interests'
  },
  PROJECTS: { 
    id: 'projects', 
    name: 'Projects', 
    icon: 'fas fa-lightbulb',
    description: 'Discover active projects and collaboration opportunities'
  },
  THEMES: { 
    id: 'themes', 
    name: 'Themes', 
    icon: 'fas fa-bullseye',
    description: 'Explore theme circles and focused discussions'
  },
  SKILLS: { 
    id: 'skills', 
    name: 'Skills', 
    icon: 'fas fa-code',
    description: 'Browse by technical skills and expertise areas'
  }
};

// Advanced filter options
const FILTER_OPTIONS = {
  availability: ['Available', 'Busy', 'Open to opportunities'],
  roles: ['Developer', 'Designer', 'Product Manager', 'Student', 'Entrepreneur', 'Researcher'],
  projectStatus: ['active', 'completed', 'paused'],
  skillCategories: ['Frontend', 'Backend', 'Mobile', 'AI/ML', 'Design', 'DevOps', 'Database', 'Blockchain'],
  timeframes: ['Last week', 'Last month', 'Last 3 months', 'All time']
};

// Initialize enhanced search system
export function initEnhancedSearchDiscovery() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose functions globally
  window.openEnhancedSearch = openEnhancedSearch;
  window.closeEnhancedSearch = closeEnhancedSearch;
  window.performEnhancedSearch = performEnhancedSearch;
  window.applySearchFilters = applySearchFilters;
  window.clearSearchFilters = clearSearchFilters;
  window.switchSearchCategory = switchSearchCategory;

  // Initialize search cache
  loadSearchData();

  console.log('✅ Enhanced search & discovery initialized');
}

// Load and cache search data
async function loadSearchData() {
  if (!supabase) return;

  try {
    console.log('📊 Loading search data...');

    // Load people
    const { data: people, error: peopleError } = await supabase
      .from('community')
      .select('*')
      .order('name');

    if (!peopleError && people) {
      searchCache.people = people.map(person => ({
        ...person,
        type: 'person',
        searchText: `${person.name} ${person.skills || ''} ${person.bio || ''} ${person.user_role || ''}`.toLowerCase(),
        skills: parseSkills(person.skills || '')
      }));
    }

    // Load projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select(`
        *,
        creator:community!projects_creator_id_fkey(name, image_url),
        theme:theme_circles(title, tags)
      `)
      .order('created_at', { ascending: false });

    if (!projectsError && projects) {
      searchCache.projects = projects.map(project => ({
        ...project,
        type: 'project',
        searchText: `${project.title} ${project.description || ''} ${(project.required_skills || []).join(' ')} ${project.creator?.name || ''}`.toLowerCase(),
        skills: project.required_skills || []
      }));
    }

    // Load themes
    const { data: themes, error: themesError } = await supabase
      .from('theme_circles')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (!themesError && themes) {
      searchCache.themes = themes.map(theme => ({
        ...theme,
        type: 'theme',
        searchText: `${theme.title} ${theme.description || ''} ${(theme.tags || []).join(' ')}`.toLowerCase(),
        skills: theme.tags || []
      }));
    }

    // Build skills set
    const allSkills = new Set();
    [...searchCache.people, ...searchCache.projects, ...searchCache.themes].forEach(item => {
      if (item.skills) {
        item.skills.forEach(skill => allSkills.add(skill.toLowerCase().trim()));
      }
    });
    searchCache.skills = allSkills;
    searchCache.lastUpdated = Date.now();

    console.log(`✅ Search data loaded: ${searchCache.people.length} people, ${searchCache.projects.length} projects, ${searchCache.themes.length} themes, ${searchCache.skills.size} skills`);

  } catch (error) {
    console.error('❌ Error loading search data:', error);
  }
}

// Open enhanced search modal
export async function openEnhancedSearch(initialQuery = '', initialCategory = 'all') {
  console.log('🔍 Opening enhanced search...');

  // Remove existing modal if present
  const existing = document.getElementById('enhanced-search-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'enhanced-search-modal';
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
    <div class="search-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1400px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="search-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-search"></i> Enhanced Search
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Discover people, projects, themes, and skills across the platform
            </p>
          </div>
          <button onclick="closeEnhancedSearch()" style="
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

        <!-- Search Bar -->
        <div style="position: relative; margin-bottom: 1.5rem;">
          <input type="text" id="enhanced-search-input" placeholder="Search for people, projects, themes, or skills..." value="${initialQuery}" style="
            width: 100%;
            padding: 1rem 1rem 1rem 3.5rem;
            background: rgba(0, 224, 255, 0.05);
            border: 2px solid rgba(0, 224, 255, 0.3);
            border-radius: 12px;
            color: white;
            font-size: 1.1rem;
            transition: border-color 0.2s;
          ">
          <i class="fas fa-search" style="
            position: absolute;
            left: 1.25rem;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(0, 224, 255, 0.6);
            font-size: 1.1rem;
          "></i>
          <button onclick="performEnhancedSearch()" style="
            position: absolute;
            right: 0.5rem;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2));
            border: 1px solid rgba(0, 224, 255, 0.5);
            border-radius: 8px;
            color: #00e0ff;
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-weight: 600;
          ">
            Search
          </button>
        </div>

        <!-- Category Tabs -->
        <div class="search-categories" style="
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        ">
          ${Object.values(SEARCH_CATEGORIES).map(category => `
            <button class="category-tab ${category.id === initialCategory ? 'active' : ''}" 
                    data-category="${category.id}" 
                    onclick="switchSearchCategory('${category.id}')" style="
              padding: 0.75rem 1rem;
              background: ${category.id === initialCategory ? 'rgba(0, 224, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
              border: 1px solid ${category.id === initialCategory ? 'rgba(0, 224, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)'};
              border-radius: 8px;
              color: ${category.id === initialCategory ? '#00e0ff' : 'rgba(255, 255, 255, 0.8)'};
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            ">
              <i class="${category.icon}"></i>
              ${category.name}
            </button>
          `).join('')}
        </div>

        <!-- Quick Filters -->
        <div id="quick-filters" style="display: none;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
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
                ${FILTER_OPTIONS.availability.map(option => `<option value="${option}">${option}</option>`).join('')}
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
                ${FILTER_OPTIONS.roles.map(role => `<option value="${role}">${role}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-size: 0.9rem;">
                Skill Category
              </label>
              <select id="skill-category-filter" style="
                width: 100%;
                padding: 0.5rem;
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: white;
                font-size: 0.9rem;
              ">
                <option value="">Any Category</option>
                ${FILTER_OPTIONS.skillCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Filter Actions -->
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 0.5rem;">
            <button onclick="toggleQuickFilters()" style="
              padding: 0.5rem 1rem;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: rgba(255, 255, 255, 0.8);
              cursor: pointer;
              font-size: 0.9rem;
            ">
              <i class="fas fa-sliders-h"></i> Filters
            </button>
            <button onclick="clearSearchFilters()" style="
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
          <div id="search-stats" style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem;">
            <!-- Search stats will appear here -->
          </div>
        </div>
      </div>

      <!-- Results Area -->
      <div class="search-results" style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <div id="search-content">
          <div class="search-welcome" style="
            text-align: center;
            padding: 3rem;
            color: rgba(255, 255, 255, 0.6);
          ">
            <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
            <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">Start Your Search</h3>
            <p>Enter keywords to discover people, projects, themes, and skills</p>
            <div style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
              <button onclick="performQuickSearch('React')" style="
                padding: 0.5rem 1rem;
                background: rgba(0, 224, 255, 0.1);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-size: 0.9rem;
              ">React</button>
              <button onclick="performQuickSearch('AI')" style="
                padding: 0.5rem 1rem;
                background: rgba(0, 224, 255, 0.1);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-size: 0.9rem;
              ">AI</button>
              <button onclick="performQuickSearch('Design')" style="
                padding: 0.5rem 1rem;
                background: rgba(0, 224, 255, 0.1);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-size: 0.9rem;
              ">Design</button>
              <button onclick="performQuickSearch('Python')" style="
                padding: 0.5rem 1rem;
                background: rgba(0, 224, 255, 0.1);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-size: 0.9rem;
              ">Python</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .category-tab.active {
      background: rgba(0, 224, 255, 0.2) !important;
      border-color: rgba(0, 224, 255, 0.4) !important;
      color: #00e0ff !important;
    }

    .category-tab:hover {
      background: rgba(0, 224, 255, 0.1) !important;
      border-color: rgba(0, 224, 255, 0.3) !important;
    }

    .search-result-card {
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.3s;
      cursor: pointer;
    }

    .search-result-card:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 224, 255, 0.1);
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .result-type-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .result-type-person {
      background: rgba(0, 224, 255, 0.2);
      color: #00e0ff;
    }

    .result-type-project {
      background: rgba(255, 107, 107, 0.2);
      color: #ff6b6b;
    }

    .result-type-theme {
      background: rgba(255, 215, 0, 0.2);
      color: #ffd700;
    }

    .result-type-skill {
      background: rgba(0, 255, 136, 0.2);
      color: #00ff88;
    }

    .result-title {
      color: #00e0ff;
      font-size: 1.1rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }

    .result-description {
      color: rgba(255, 255, 255, 0.8);
      line-height: 1.5;
      margin-bottom: 1rem;
    }

    .result-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
    }

    .result-skills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .result-skill-tag {
      background: rgba(0, 224, 255, 0.15);
      border: 1px solid rgba(0, 224, 255, 0.3);
      color: #00e0ff;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    #enhanced-search-input:focus {
      border-color: rgba(0, 224, 255, 0.6);
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 224, 255, 0.1);
    }

    .search-section {
      margin-bottom: 2rem;
    }

    .search-section-title {
      color: #00e0ff;
      font-size: 1.2rem;
      font-weight: bold;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Setup event listeners
  setupSearchEventListeners();

  // Perform initial search if query provided
  if (initialQuery) {
    setTimeout(() => performEnhancedSearch(), 100);
  }

  console.log('✅ Enhanced search modal opened');
}

// Setup search event listeners
function setupSearchEventListeners() {
  // Search input
  const searchInput = document.getElementById('enhanced-search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (e.target.value.trim()) {
          performEnhancedSearch();
        }
      }, 300);
    });

    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performEnhancedSearch();
      }
    });
  }

  // Close modal on backdrop click
  const modal = document.getElementById('enhanced-search-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeEnhancedSearch();
      }
    });
  }
}

// Perform enhanced search
window.performEnhancedSearch = async function() {
  const searchInput = document.getElementById('enhanced-search-input');
  const content = document.getElementById('search-content');
  const stats = document.getElementById('search-stats');
  
  if (!searchInput || !content) return;

  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    content.innerHTML = `
      <div class="search-welcome" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
        <p>Enter a search term to get started</p>
      </div>
    `;
    return;
  }

  // Show loading
  content.innerHTML = `
    <div class="loading-state" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Searching...</p>
    </div>
  `;

  try {
    // Ensure data is loaded
    if (!searchCache.lastUpdated || Date.now() - searchCache.lastUpdated > 300000) { // 5 minutes
      await loadSearchData();
    }

    // Get active category
    const activeCategory = document.querySelector('.category-tab.active')?.dataset.category || 'all';
    
    // Get filter values
    const filters = {
      availability: document.getElementById('availability-filter')?.value || '',
      role: document.getElementById('role-filter')?.value || '',
      skillCategory: document.getElementById('skill-category-filter')?.value || ''
    };

    // Perform search
    const results = performSearch(query, activeCategory, filters);
    
    // Render results
    renderSearchResults(results, content, query);
    
    // Update stats
    if (stats) {
      const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
      stats.textContent = `${totalResults} result${totalResults !== 1 ? 's' : ''} found`;
    }

  } catch (error) {
    console.error('Search error:', error);
    content.innerHTML = `
      <div class="error-state" style="text-align: center; padding: 3rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Search failed. Please try again.</p>
      </div>
    `;
  }
};

// Perform search logic
function performSearch(query, category, filters) {
  const results = {
    people: [],
    projects: [],
    themes: [],
    skills: []
  };

  const queryTerms = query.split(' ').filter(term => term.length > 1);

  // Search people
  if (category === 'all' || category === 'people') {
    results.people = searchCache.people.filter(person => {
      // Text matching
      const textMatch = queryTerms.some(term => person.searchText.includes(term));
      
      // Filter matching
      const availabilityMatch = !filters.availability || person.availability === filters.availability;
      const roleMatch = !filters.role || person.user_role === filters.role;
      
      return textMatch && availabilityMatch && roleMatch;
    });
  }

  // Search projects
  if (category === 'all' || category === 'projects') {
    results.projects = searchCache.projects.filter(project => {
      const textMatch = queryTerms.some(term => project.searchText.includes(term));
      return textMatch;
    });
  }

  // Search themes
  if (category === 'all' || category === 'themes') {
    results.themes = searchCache.themes.filter(theme => {
      const textMatch = queryTerms.some(term => theme.searchText.includes(term));
      return textMatch;
    });
  }

  // Search skills
  if (category === 'all' || category === 'skills') {
    const matchingSkills = Array.from(searchCache.skills).filter(skill => 
      queryTerms.some(term => skill.includes(term))
    );
    
    results.skills = matchingSkills.map(skill => ({
      id: skill,
      name: skill,
      type: 'skill',
      count: [...searchCache.people, ...searchCache.projects].filter(item => 
        item.skills.some(s => s.toLowerCase() === skill)
      ).length
    }));
  }

  // Sort results by relevance
  Object.keys(results).forEach(key => {
    if (key !== 'skills') {
      results[key].sort((a, b) => calculateRelevanceScore(b, queryTerms) - calculateRelevanceScore(a, queryTerms));
    }
  });

  return results;
}

// Calculate relevance score for search results
function calculateRelevanceScore(item, queryTerms) {
  let score = 0;
  const text = item.searchText || '';
  
  queryTerms.forEach(term => {
    // Exact matches in name/title get highest score
    if ((item.name || item.title || '').toLowerCase().includes(term)) {
      score += 10;
    }
    
    // Matches in skills get high score
    if (item.skills && item.skills.some(skill => skill.toLowerCase().includes(term))) {
      score += 8;
    }
    
    // General text matches
    const termCount = (text.match(new RegExp(term, 'g')) || []).length;
    score += termCount * 2;
  });
  
  return score;
}

// Render search results
function renderSearchResults(results, container, query) {
  let html = '';
  
  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  
  if (totalResults === 0) {
    html = `
      <div class="no-results" style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
        <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
        <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">No results found</h3>
        <p>Try different keywords or check your filters</p>
      </div>
    `;
  } else {
    // Render each category with results
    if (results.people.length > 0) {
      html += renderSearchSection('People', 'fas fa-users', results.people, 'person');
    }
    
    if (results.projects.length > 0) {
      html += renderSearchSection('Projects', 'fas fa-lightbulb', results.projects, 'project');
    }
    
    if (results.themes.length > 0) {
      html += renderSearchSection('Themes', 'fas fa-bullseye', results.themes, 'theme');
    }
    
    if (results.skills.length > 0) {
      html += renderSearchSection('Skills', 'fas fa-code', results.skills, 'skill');
    }
  }
  
  container.innerHTML = html;
}

// Render a search results section
function renderSearchSection(title, icon, items, type) {
  let html = `
    <div class="search-section">
      <div class="search-section-title">
        <i class="${icon}"></i>
        ${title} (${items.length})
      </div>
      <div class="search-results-grid">
  `;
  
  items.slice(0, 10).forEach(item => { // Limit to 10 results per section
    html += renderSearchResultCard(item, type);
  });
  
  if (items.length > 10) {
    html += `
      <div style="text-align: center; padding: 1rem; color: rgba(255, 255, 255, 0.6);">
        <p>+${items.length - 10} more results</p>
      </div>
    `;
  }
  
  html += '</div></div>';
  return html;
}

// Render individual search result card
function renderSearchResultCard(item, type) {
  const typeConfig = {
    person: { badge: 'Person', class: 'result-type-person' },
    project: { badge: 'Project', class: 'result-type-project' },
    theme: { badge: 'Theme', class: 'result-type-theme' },
    skill: { badge: 'Skill', class: 'result-type-skill' }
  };
  
  const config = typeConfig[type];
  
  let content = '';
  
  switch (type) {
    case 'person':
      content = `
        <div class="result-header">
          <div class="result-type-badge ${config.class}">${config.badge}</div>
          <div class="result-title">${item.name}</div>
        </div>
        <div class="result-description">
          ${item.bio || 'No bio available'}
        </div>
        <div class="result-meta">
          <span><i class="fas fa-user"></i> ${item.user_role || 'Member'}</span>
          ${item.availability ? `<span><i class="fas fa-circle"></i> ${item.availability}</span>` : ''}
          ${item.connection_count ? `<span><i class="fas fa-users"></i> ${item.connection_count} connections</span>` : ''}
        </div>
        ${item.skills.length > 0 ? `
          <div class="result-skills">
            ${item.skills.slice(0, 5).map(skill => `
              <span class="result-skill-tag">${skill}</span>
            `).join('')}
            ${item.skills.length > 5 ? `<span style="color: rgba(255,255,255,0.6);">+${item.skills.length - 5} more</span>` : ''}
          </div>
        ` : ''}
      `;
      break;
      
    case 'project':
      content = `
        <div class="result-header">
          <div class="result-type-badge ${config.class}">${config.badge}</div>
          <div class="result-title">${item.title}</div>
        </div>
        <div class="result-description">
          ${item.description || 'No description available'}
        </div>
        <div class="result-meta">
          <span><i class="fas fa-user"></i> ${item.creator?.name || 'Unknown'}</span>
          <span><i class="fas fa-circle"></i> ${item.status}</span>
          ${item.theme?.title ? `<span><i class="fas fa-bullseye"></i> ${item.theme.title}</span>` : ''}
        </div>
        ${item.skills.length > 0 ? `
          <div class="result-skills">
            ${item.skills.slice(0, 5).map(skill => `
              <span class="result-skill-tag">${skill}</span>
            `).join('')}
          </div>
        ` : ''}
      `;
      break;
      
    case 'theme':
      content = `
        <div class="result-header">
          <div class="result-type-badge ${config.class}">${config.badge}</div>
          <div class="result-title">${item.title}</div>
        </div>
        <div class="result-description">
          ${item.description || 'No description available'}
        </div>
        <div class="result-meta">
          <span><i class="fas fa-calendar"></i> Expires ${new Date(item.expires_at).toLocaleDateString()}</span>
        </div>
        ${item.skills.length > 0 ? `
          <div class="result-skills">
            ${item.skills.slice(0, 5).map(tag => `
              <span class="result-skill-tag">${tag}</span>
            `).join('')}
          </div>
        ` : ''}
      `;
      break;
      
    case 'skill':
      content = `
        <div class="result-header">
          <div class="result-type-badge ${config.class}">${config.badge}</div>
          <div class="result-title">${item.name}</div>
        </div>
        <div class="result-description">
          ${item.count} people and projects use this skill
        </div>
        <div class="result-meta">
          <span><i class="fas fa-users"></i> ${item.count} matches</span>
        </div>
      `;
      break;
  }
  
  return `
    <div class="search-result-card" onclick="openSearchResult('${type}', '${item.id}')">
      ${content}
    </div>
  `;
}

// Helper functions
function parseSkills(skillsString) {
  if (!skillsString) return [];
  if (Array.isArray(skillsString)) return skillsString;
  return skillsString.split(',').map(s => s.trim()).filter(Boolean);
}

// Global functions
window.switchSearchCategory = function(category) {
  // Update active tab
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.category === category) {
      tab.classList.add('active');
    }
  });
  
  // Perform search with new category
  const searchInput = document.getElementById('enhanced-search-input');
  if (searchInput && searchInput.value.trim()) {
    performEnhancedSearch();
  }
};

window.toggleQuickFilters = function() {
  const filters = document.getElementById('quick-filters');
  if (filters) {
    filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
  }
};

window.applySearchFilters = function() {
  // Apply current filter values and re-run search
  performEnhancedSearch();
};

window.clearSearchFilters = function() {
  // Clear filter inputs
  const filters = ['availability-filter', 'role-filter', 'skill-category-filter'];
  filters.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  
  // Re-run search
  performEnhancedSearch();
};

window.performQuickSearch = function(term) {
  const searchInput = document.getElementById('enhanced-search-input');
  if (searchInput) {
    searchInput.value = term;
    performEnhancedSearch();
  }
};

window.openSearchResult = function(type, id) {
  console.log('Opening search result:', type, id);
  // Implementation for opening specific results
  // This would integrate with existing modal systems
};

window.closeEnhancedSearch = function() {
  const modal = document.getElementById('enhanced-search-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Enhanced search modal closed');
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initEnhancedSearchDiscovery();
});

console.log('✅ Enhanced search & discovery ready');