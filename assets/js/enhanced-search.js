// Enhanced Search Experience
// Search suggestions, history, and filters

let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
let searchCache = new Map();

function initEnhancedSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  
  const wrapper = document.createElement('div');
  wrapper.className = 'search-wrapper';
  searchInput.parentNode.insertBefore(wrapper, searchInput);
  wrapper.appendChild(searchInput);
  
  const suggestions = document.createElement('div');
  suggestions.id = 'search-suggestions';
  suggestions.className = 'search-suggestions';
  wrapper.appendChild(suggestions);
  
  searchInput.addEventListener('input', debounce(handleSearchInput, 300));
  searchInput.addEventListener('focus', showSearchHistory);
  searchInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
}

function handleSearchInput(e) {
  const query = e.target.value.trim();
  
  if (query.length < 2) {
    showSearchHistory();
    return;
  }
  
  if (searchCache.has(query)) {
    showSuggestions(searchCache.get(query));
    return;
  }
  
  performSearch(query);
}

async function performSearch(query) {
  try {
    const [people, projects, themes] = await Promise.all([
      searchPeople(query),
      searchProjects(query),
      searchThemes(query)
    ]);
    
    const results = {
      people: people.slice(0, 3),
      projects: projects.slice(0, 3),
      themes: themes.slice(0, 3)
    };
    
    searchCache.set(query, results);
    showSuggestions(results);
  } catch (err) {
    // Silent fail
  }
}

async function searchPeople(query) {
  const { data } = await window.supabase
    .from('community')
    .select('id, display_name, email, image_url')
    .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(5);
  return data || [];
}

async function searchProjects(query) {
  const { data } = await window.supabase
    .from('projects')
    .select('id, title, description')
    .ilike('title', `%${query}%`)
    .limit(5);
  return data || [];
}

async function searchThemes(query) {
  const { data } = await window.supabase
    .from('themes')
    .select('id, title, description')
    .ilike('title', `%${query}%`)
    .limit(5);
  return data || [];
}

function showSuggestions(results) {
  const container = document.getElementById('search-suggestions');
  if (!container) return;
  
  let html = '';
  
  if (results.people?.length > 0) {
    html += '<div class="suggestion-group"><div class="suggestion-header">People</div>';
    results.people.forEach(person => {
      html += `
        <div class="suggestion-item" onclick="selectPerson('${person.id}')">
          <i class="fas fa-user"></i>
          <span>${person.display_name || person.email}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  if (results.projects?.length > 0) {
    html += '<div class="suggestion-group"><div class="suggestion-header">Projects</div>';
    results.projects.forEach(project => {
      html += `
        <div class="suggestion-item" onclick="selectProject('${project.id}')">
          <i class="fas fa-project-diagram"></i>
          <span>${project.title}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  if (results.themes?.length > 0) {
    html += '<div class="suggestion-group"><div class="suggestion-header">Themes</div>';
    results.themes.forEach(theme => {
      html += `
        <div class="suggestion-item" onclick="selectTheme('${theme.id}')">
          <i class="fas fa-lightbulb"></i>
          <span>${theme.title}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  if (html) {
    container.innerHTML = html;
    container.style.display = 'block';
  } else {
    container.innerHTML = '<div class="no-results">No results found</div>';
    container.style.display = 'block';
  }
}

function showSearchHistory() {
  const container = document.getElementById('search-suggestions');
  if (!container || searchHistory.length === 0) return;
  
  let html = '<div class="suggestion-group"><div class="suggestion-header">Recent Searches</div>';
  searchHistory.slice(0, 5).forEach(term => {
    html += `
      <div class="suggestion-item" onclick="searchFromHistory('${term}')">
        <i class="fas fa-history"></i>
        <span>${term}</span>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
  container.style.display = 'block';
}

function hideSuggestions() {
  const container = document.getElementById('search-suggestions');
  if (container) container.style.display = 'none';
}

function addToHistory(term) {
  searchHistory = searchHistory.filter(t => t !== term);
  searchHistory.unshift(term);
  searchHistory = searchHistory.slice(0, 10);
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function selectPerson(id) {
  if (typeof window.openNodePanel === 'function') {
    window.openNodePanel({ id, type: 'person' });
  }
  hideSuggestions();
}

function selectProject(id) {
  if (typeof window.openNodePanel === 'function') {
    window.openNodePanel({ id, type: 'project' });
  }
  hideSuggestions();
}

function selectTheme(id) {
  if (typeof window.openNodePanel === 'function') {
    window.openNodePanel({ id, type: 'theme' });
  }
  hideSuggestions();
}

function searchFromHistory(term) {
  const input = document.getElementById('search-input');
  if (input) {
    input.value = term;
    input.dispatchEvent(new Event('input'));
  }
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initEnhancedSearch);
  window.selectPerson = selectPerson;
  window.selectProject = selectProject;
  window.selectTheme = selectTheme;
  window.searchFromHistory = searchFromHistory;
}
