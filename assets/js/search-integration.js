// ================================================================
// SEARCH INTEGRATION SYSTEM
// ================================================================
// Integrates enhanced search with existing dashboard and navigation

console.log("%c🔗 Search Integration Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

// Initialize search integration
export function initSearchIntegration() {
  // Add search button to dashboard
  addSearchButtonToDashboard();
  
  // Add global search shortcut
  setupGlobalSearchShortcut();
  
  // Integrate with existing search elements
  enhanceExistingSearchElements();
  
  // Setup search result handlers
  setupSearchResultHandlers();

  console.log('✅ Search integration initialized');
}

// Add search button to dashboard (integrated into header)
function addSearchButtonToDashboard() {
  // Search functionality is now integrated into the header
  // No need for additional search buttons
  console.log('✅ Search integrated into header');
}

// Setup global search shortcut (Ctrl/Cmd + K)
function setupGlobalSearchShortcut() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (typeof window.openEnhancedSearch === 'function') {
        window.openEnhancedSearch();
      }
    }

    // Escape to close search
    if (e.key === 'Escape') {
      const searchModal = document.getElementById('enhanced-search-modal');
      if (searchModal && typeof window.closeEnhancedSearch === 'function') {
        window.closeEnhancedSearch();
      }
    }
  });
}

// Enhance existing search elements
function enhanceExistingSearchElements() {
  // Find existing search inputs and enhance them
  const searchInputs = document.querySelectorAll('input[type="text"][placeholder*="search" i], input[type="search"]');
  
  searchInputs.forEach(input => {
    // Add click handler to open enhanced search
    input.addEventListener('focus', () => {
      if (typeof window.openEnhancedSearch === 'function') {
        const currentValue = input.value;
        window.openEnhancedSearch(currentValue);
        input.blur(); // Remove focus from original input
      }
    });
  });

  // Enhance existing search buttons
  const searchButtons = document.querySelectorAll('button[id*="search"], button[class*="search"]');
  
  searchButtons.forEach(button => {
    const originalHandler = button.onclick;
    button.onclick = (e) => {
      e.preventDefault();
      if (typeof window.openEnhancedSearch === 'function') {
        // Try to get search term from nearby input
        const nearbyInput = button.parentElement?.querySelector('input') || 
                           document.querySelector('#people-search, #teamSkillsInput, #nameInput');
        const searchTerm = nearbyInput?.value || '';
        window.openEnhancedSearch(searchTerm);
      } else if (originalHandler) {
        originalHandler.call(button, e);
      }
    };
  });
}

// Setup search result handlers
function setupSearchResultHandlers() {
  // Handle opening search results
  window.openSearchResult = async function(type, id) {
    console.log('🔍 Opening search result:', type, id);

    try {
      switch (type) {
        case 'person':
          await openPersonResult(id);
          break;
        case 'project':
          await openProjectResult(id);
          break;
        case 'theme':
          await openThemeResult(id);
          break;
        case 'skill':
          await openSkillResult(id);
          break;
        default:
          console.warn('Unknown result type:', type);
      }
    } catch (error) {
      console.error('Error opening search result:', error);
    }
  };
}

// Open person result
async function openPersonResult(personId) {
  // Close search modal
  if (typeof window.closeEnhancedSearch === 'function') {
    window.closeEnhancedSearch();
  }

  // Try to open node panel if available
  if (typeof window.openNodePanel === 'function') {
    // Create a mock node data object
    const nodeData = {
      id: personId,
      type: 'person'
    };
    await window.openNodePanel(nodeData);
  } else {
    // Fallback: show notification
    showSearchNotification(`Opening profile for user ${personId}`, 'info');
  }
}

// Open project result
async function openProjectResult(projectId) {
  // Close search modal
  if (typeof window.closeEnhancedSearch === 'function') {
    window.closeEnhancedSearch();
  }

  // Try to open project details
  if (typeof window.openProjectDetails === 'function') {
    await window.openProjectDetails({ id: projectId });
  } else if (typeof window.openNodePanel === 'function') {
    const nodeData = {
      id: projectId,
      type: 'project'
    };
    await window.openNodePanel(nodeData);
  } else {
    showSearchNotification(`Opening project ${projectId}`, 'info');
  }
}

// Open theme result
async function openThemeResult(themeId) {
  // Close search modal
  if (typeof window.closeEnhancedSearch === 'function') {
    window.closeEnhancedSearch();
  }

  // Try to focus on theme in synapse view
  if (typeof window.focusOnTheme === 'function') {
    await window.focusOnTheme(themeId);
  } else if (typeof window.openNodePanel === 'function') {
    const nodeData = {
      id: themeId,
      type: 'theme',
      isThemeLens: true
    };
    await window.openNodePanel(nodeData);
  } else {
    showSearchNotification(`Opening theme ${themeId}`, 'info');
  }
}

// Open skill result
async function openSkillResult(skillName) {
  // Close search modal
  if (typeof window.closeEnhancedSearch === 'function') {
    window.closeEnhancedSearch();
  }

  // Open enhanced search with skill filter
  setTimeout(() => {
    if (typeof window.openEnhancedSearch === 'function') {
      window.openEnhancedSearch(skillName, 'people');
    }
  }, 100);
}

// Search notification helper
function showSearchNotification(message, type = 'info') {
  // Try to use existing notification system
  if (typeof window.showSynapseNotification === 'function') {
    window.showSynapseNotification(message, type);
  } else {
    // Fallback notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#00e0ff'};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10001;
      animation: slideInRight 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

// Add search suggestions to dashboard
export function addSearchSuggestionsToDashboard() {
  // Find suggestions container or create one
  let suggestionsContainer = document.getElementById('search-suggestions');
  
  if (!suggestionsContainer) {
    // Try to find a good place to add suggestions
    const dashboardContent = document.getElementById('dashboard-content') ||
                            document.querySelector('.dashboard-main') ||
                            document.querySelector('main');
    
    if (!dashboardContent) return;

    suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'search-suggestions';
    suggestionsContainer.style.cssText = `
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 1rem 0;
    `;

    suggestionsContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="color: #00e0ff; margin: 0; font-size: 1.1rem;">
          <i class="fas fa-search"></i> Quick Search
        </h3>
        <button onclick="openEnhancedSearch()" style="
          background: rgba(0, 224, 255, 0.2);
          border: 1px solid rgba(0, 224, 255, 0.4);
          color: #00e0ff;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
        ">
          <i class="fas fa-search-plus"></i> Advanced Search
        </button>
      </div>
      
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button onclick="openEnhancedSearch('React', 'people')" class="search-suggestion-btn">
          <i class="fas fa-users"></i> React Developers
        </button>
        <button onclick="openEnhancedSearch('AI', 'projects')" class="search-suggestion-btn">
          <i class="fas fa-lightbulb"></i> AI Projects
        </button>
        <button onclick="openEnhancedSearch('Design', 'people')" class="search-suggestion-btn">
          <i class="fas fa-palette"></i> Designers
        </button>
        <button onclick="openEnhancedSearch('Python', 'skills')" class="search-suggestion-btn">
          <i class="fas fa-code"></i> Python Skills
        </button>
        <button onclick="openEnhancedSearch('', 'themes')" class="search-suggestion-btn">
          <i class="fas fa-bullseye"></i> Active Themes
        </button>
      </div>
    `;

    // Add suggestion button styles
    const style = document.createElement('style');
    style.textContent = `
      .search-suggestion-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.8);
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .search-suggestion-btn:hover {
        background: rgba(0, 224, 255, 0.1);
        border-color: rgba(0, 224, 255, 0.3);
        color: #00e0ff;
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);

    dashboardContent.insertBefore(suggestionsContainer, dashboardContent.firstChild);
  }
}

// Enhanced search analytics
export function trackSearchAnalytics(query, category, resultsCount) {
  // Track search usage for analytics
  console.log('🔍 Search Analytics:', {
    query,
    category,
    resultsCount,
    timestamp: new Date().toISOString()
  });

  // Could integrate with analytics service
  if (window.gtag) {
    window.gtag('event', 'search', {
      search_term: query,
      category: category,
      results_count: resultsCount
    });
  }
}

// Search keyboard shortcuts helper
export function showSearchShortcuts() {
  const shortcuts = [
    { key: 'Ctrl/Cmd + K', action: 'Open search' },
    { key: 'Escape', action: 'Close search' },
    { key: 'Tab', action: 'Navigate categories' },
    { key: 'Enter', action: 'Search' }
  ];

  const shortcutsHTML = shortcuts.map(s => 
    `<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
      <span style="font-family: monospace; background: rgba(255,255,255,0.1); padding: 0.25rem 0.5rem; border-radius: 4px;">${s.key}</span>
      <span>${s.action}</span>
    </div>`
  ).join('');

  // Show shortcuts in a tooltip or modal
  showSearchNotification(`Keyboard Shortcuts:\n${shortcuts.map(s => `${s.key}: ${s.action}`).join('\n')}`, 'info');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initSearchIntegration();
  
  // Add search suggestions after a short delay
  setTimeout(() => {
    addSearchSuggestionsToDashboard();
  }, 1000);
});

console.log('✅ Search integration ready');