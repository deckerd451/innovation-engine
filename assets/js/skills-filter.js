// ================================================================
// SKILLS FILTER WITH PREDICTIVE SUGGESTIONS
// File: /assets/js/skills-filter.js
// ================================================================
// Purpose:
// - Provide skills-based filtering for the network visualization
// - Show predictive/autocomplete suggestions as user types
// - Integrate with quiet mode auto-disable
// - Filter nodes by selected skills
//
// Public API:
//   initSkillsFilter() -> void
// ================================================================

console.log("%c🎯 Skills Filter Loading...", "color:#8b5cf6; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let allSkills = new Set();
let selectedSkills = new Set();
let suggestionsPanel = null;
let skillsButton = null;
let isActive = false;

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Initialize skills filter system
 */
export function initSkillsFilter() {
  console.log('🎯 Initializing Skills Filter...');
  
  supabase = window.supabase;
  if (!supabase) {
    console.warn('⚠️ Supabase not available yet, will retry after login');
    return;
  }
  
  // Get skills button
  skillsButton = document.getElementById('skills-filter-btn');
  if (!skillsButton) {
    console.warn('⚠️ Skills filter button not found yet, will initialize after login');
    return;
  }
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e?.detail?.profile || null;
    loadAllSkills();
  });
  
  // Also try to initialize after profile loaded (in case button wasn't ready first time)
  window.addEventListener('profile-loaded', () => {
    if (!skillsButton) {
      setTimeout(() => {
        skillsButton = document.getElementById('skills-filter-btn');
        if (skillsButton) {
          console.log('✅ Skills button found after profile load, completing initialization');
          setupButtonHandlers();
        }
      }, 500);
    }
  });
  
  // Create suggestions panel
  createSuggestionsPanel();
  
  // Setup button handlers if button exists
  if (skillsButton) {
    setupButtonHandlers();
  }
  
  console.log('✅ Skills Filter initialized');
}

/**
 * Setup button click handlers
 */
function setupButtonHandlers() {
  if (!skillsButton) return;
  
  // Setup button click handler
  skillsButton.addEventListener('click', toggleSkillsFilter);
  
  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (isActive && suggestionsPanel && 
        !suggestionsPanel.contains(e.target) && 
        !skillsButton.contains(e.target)) {
      closeSkillsFilter();
    }
  });
  
  console.log('✅ Skills button handlers attached');
}

/**
 * Load all available skills from community
 */
async function loadAllSkills() {
  try {
    console.log('📊 Loading all skills from community...');
    
    const { data, error } = await supabase
      .from('community')
      .select('skills')
      .or('is_hidden.is.null,is_hidden.eq.false');
    
    if (error) {
      console.error('❌ Error loading skills:', error);
      return;
    }
    
    // Extract and normalize all skills
    allSkills.clear();
    data.forEach(row => {
      if (row.skills) {
        const skills = Array.isArray(row.skills) ? row.skills : 
                      typeof row.skills === 'string' ? row.skills.split(',') : [];
        skills.forEach(skill => {
          const normalized = skill.trim().toLowerCase();
          if (normalized) allSkills.add(normalized);
        });
      }
    });
    
    console.log(`✅ Loaded ${allSkills.size} unique skills`);
  } catch (err) {
    console.error('❌ Error loading skills:', err);
  }
}

/**
 * Create suggestions panel UI
 */
function createSuggestionsPanel() {
  suggestionsPanel = document.createElement('div');
  suggestionsPanel.id = 'skills-suggestions-panel';
  suggestionsPanel.style.cssText = `
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    width: min(500px, 90vw);
    max-height: 400px;
    background: rgba(10,14,39,0.98);
    border: 2px solid rgba(139,92,246,0.4);
    border-radius: 12px;
    padding: 1rem;
    display: none;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: 0 8px 32px rgba(139,92,246,0.3);
    backdrop-filter: blur(10px);
    z-index: 10000;
    animation: fadeInUp 0.2s ease;
  `;
  
  suggestionsPanel.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
      <h3 style="color: #8b5cf6; font-size: 1rem; font-weight: 700; margin: 0;">
        <i class="fas fa-code"></i> Filter by Skills
      </h3>
      <button id="skills-close-btn" style="
        background: transparent;
        border: none;
        color: #888;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
      " title="Close">×</button>
    </div>
    
    <div style="position: relative;">
      <input 
        type="text" 
        id="skills-search-input" 
        placeholder="Type to search skills (e.g., React, Python, UX)..."
        autocomplete="off"
        style="
          width: 100%;
          padding: 0.75rem 2.5rem 0.75rem 1rem;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 8px;
          color: #fff;
          font-size: 0.9rem;
          outline: none;
        "
      />
      <i class="fas fa-search" style="
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        color: #8b5cf6;
        pointer-events: none;
      "></i>
    </div>
    
    <div id="selected-skills-container" style="
      display: none;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(139,92,246,0.1);
      border-radius: 8px;
      border: 1px solid rgba(139,92,246,0.2);
    "></div>
    
    <div id="skills-suggestions-list" style="
      max-height: 250px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    "></div>
    
    <div style="display: flex; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
      <button id="skills-clear-btn" style="
        flex: 1;
        padding: 0.6rem 1rem;
        background: rgba(255,107,107,0.15);
        border: 1px solid rgba(255,107,107,0.3);
        border-radius: 8px;
        color: #ff6b6b;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s;
      ">
        <i class="fas fa-times"></i> Clear
      </button>
      <button id="skills-apply-btn" style="
        flex: 2;
        padding: 0.6rem 1rem;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        border: none;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s;
      ">
        <i class="fas fa-check"></i> Apply Filter
      </button>
    </div>
  `;
  
  // Add to search container
  const searchContainer = document.getElementById('centered-search-container');
  if (searchContainer) {
    searchContainer.style.position = 'relative';
    searchContainer.appendChild(suggestionsPanel);
  }
  
  // Setup event listeners
  const searchInput = document.getElementById('skills-search-input');
  const closeBtn = document.getElementById('skills-close-btn');
  const clearBtn = document.getElementById('skills-clear-btn');
  const applyBtn = document.getElementById('skills-apply-btn');
  
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearchInput, 200));
    searchInput.addEventListener('keydown', handleSearchKeydown);
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSkillsFilter);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSelectedSkills);
  }
  
  if (applyBtn) {
    applyBtn.addEventListener('click', applySkillsFilter);
  }
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    #skills-suggestions-list::-webkit-scrollbar {
      width: 6px;
    }
    
    #skills-suggestions-list::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.2);
      border-radius: 3px;
    }
    
    #skills-suggestions-list::-webkit-scrollbar-thumb {
      background: rgba(139,92,246,0.5);
      border-radius: 3px;
    }
    
    #skills-suggestions-list::-webkit-scrollbar-thumb:hover {
      background: rgba(139,92,246,0.7);
    }
    
    .skill-suggestion-item:hover {
      background: rgba(139,92,246,0.2) !important;
    }
    
    .skill-chip:hover {
      background: rgba(255,107,107,0.3) !important;
      border-color: rgba(255,107,107,0.5) !important;
    }
    
    #skills-clear-btn:hover {
      background: rgba(255,107,107,0.25) !important;
      border-color: rgba(255,107,107,0.5) !important;
    }
    
    #skills-apply-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(139,92,246,0.4);
    }
    
    #skills-close-btn:hover {
      color: #fff !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Toggle skills filter panel
 */
function toggleSkillsFilter(e) {
  e.stopPropagation();
  
  if (isActive) {
    closeSkillsFilter();
  } else {
    openSkillsFilter();
  }
}

/**
 * Open skills filter panel
 */
function openSkillsFilter() {
  if (!suggestionsPanel) return;
  
  isActive = true;
  suggestionsPanel.style.display = 'flex';
  
  // Update button style
  if (skillsButton) {
    skillsButton.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
    skillsButton.style.color = 'white';
    skillsButton.style.borderColor = 'transparent';
  }
  
  // Focus search input
  const searchInput = document.getElementById('skills-search-input');
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 100);
  }
  
  // Show all skills initially
  renderSuggestions(Array.from(allSkills).sort());
  
  // Update selected skills display
  updateSelectedSkillsDisplay();
  
  console.log('✅ Skills filter opened');
}

/**
 * Close skills filter panel
 */
function closeSkillsFilter() {
  if (!suggestionsPanel) return;
  
  isActive = false;
  suggestionsPanel.style.display = 'none';
  
  // Reset button style
  if (skillsButton) {
    if (selectedSkills.size > 0) {
      // Keep highlighted if skills are selected
      skillsButton.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
      skillsButton.style.color = 'white';
      skillsButton.style.borderColor = 'transparent';
    } else {
      skillsButton.style.background = 'rgba(139,92,246,0.15)';
      skillsButton.style.color = '#8b5cf6';
      skillsButton.style.borderColor = 'rgba(139,92,246,0.3)';
    }
  }
  
  console.log('✅ Skills filter closed');
}

/**
 * Handle search input
 */
function handleSearchInput(e) {
  const query = e.target.value.trim().toLowerCase();
  
  if (!query) {
    // Show all skills
    renderSuggestions(Array.from(allSkills).sort());
    return;
  }
  
  // Filter skills by query
  const filtered = Array.from(allSkills)
    .filter(skill => skill.includes(query))
    .sort((a, b) => {
      // Prioritize exact matches and starts-with matches
      const aStarts = a.startsWith(query);
      const bStarts = b.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });
  
  renderSuggestions(filtered);
}

/**
 * Handle search keydown (Enter to add first suggestion)
 */
function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const firstSuggestion = document.querySelector('.skill-suggestion-item');
    if (firstSuggestion) {
      const skill = firstSuggestion.dataset.skill;
      if (skill) {
        toggleSkillSelection(skill);
        e.target.value = '';
        renderSuggestions(Array.from(allSkills).sort());
      }
    }
  }
}

/**
 * Render skill suggestions
 */
function renderSuggestions(skills) {
  const listContainer = document.getElementById('skills-suggestions-list');
  if (!listContainer) return;
  
  if (skills.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #888;">
        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
        <div>No skills found</div>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = skills.map(skill => {
    const isSelected = selectedSkills.has(skill);
    return `
      <div 
        class="skill-suggestion-item" 
        data-skill="${skill}"
        style="
          padding: 0.75rem 1rem;
          background: ${isSelected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'};
          border: 1px solid ${isSelected ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'};
          border-radius: 8px;
          color: ${isSelected ? '#8b5cf6' : '#fff'};
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
        "
      >
        <span style="font-weight: ${isSelected ? '600' : '400'};">${skill}</span>
        ${isSelected ? '<i class="fas fa-check" style="color: #8b5cf6;"></i>' : ''}
      </div>
    `;
  }).join('');
  
  // Add click handlers
  listContainer.querySelectorAll('.skill-suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const skill = item.dataset.skill;
      if (skill) toggleSkillSelection(skill);
    });
  });
}

/**
 * Toggle skill selection
 */
function toggleSkillSelection(skill) {
  if (selectedSkills.has(skill)) {
    selectedSkills.delete(skill);
  } else {
    selectedSkills.add(skill);
  }
  
  // Update displays
  updateSelectedSkillsDisplay();
  renderSuggestions(Array.from(allSkills).sort());
  
  console.log('🎯 Selected skills:', Array.from(selectedSkills));
}

/**
 * Update selected skills display
 */
function updateSelectedSkillsDisplay() {
  const container = document.getElementById('selected-skills-container');
  if (!container) return;
  
  if (selectedSkills.size === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  container.innerHTML = Array.from(selectedSkills).map(skill => `
    <div 
      class="skill-chip"
      data-skill="${skill}"
      style="
        padding: 0.4rem 0.75rem;
        background: rgba(139,92,246,0.2);
        border: 1px solid rgba(139,92,246,0.4);
        border-radius: 16px;
        color: #8b5cf6;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      "
    >
      <span>${skill}</span>
      <i class="fas fa-times" style="font-size: 0.7rem;"></i>
    </div>
  `).join('');
  
  // Add click handlers to remove chips
  container.querySelectorAll('.skill-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const skill = chip.dataset.skill;
      if (skill) toggleSkillSelection(skill);
    });
  });
}

/**
 * Clear all selected skills
 */
function clearSelectedSkills() {
  selectedSkills.clear();
  updateSelectedSkillsDisplay();
  renderSuggestions(Array.from(allSkills).sort());
  
  // Reset filter
  applySkillsFilter();
  
  console.log('🧹 Cleared all selected skills');
}

/**
 * Apply skills filter
 */
function applySkillsFilter() {
  console.log('🎯 Applying skills filter:', Array.from(selectedSkills));
  
  // Trigger quiet mode auto-disable
  if (window.QuietModeAutoDisable && typeof window.QuietModeAutoDisable.disable === 'function') {
    window.QuietModeAutoDisable.disable('Skills filter applied');
  }
  
  // Emit filter event
  const filterData = {
    skills: Array.from(selectedSkills),
    active: selectedSkills.size > 0
  };
  
  window.dispatchEvent(new CustomEvent('skills-filter-applied', { detail: filterData }));
  
  // Filter nodes in synapse
  filterNodesBySkills(Array.from(selectedSkills));
  
  // Close panel
  closeSkillsFilter();
  
  // Show notification
  if (selectedSkills.size > 0) {
    showNotification(`Filtering by ${selectedSkills.size} skill${selectedSkills.size > 1 ? 's' : ''}`, 'info');
  } else {
    showNotification('Skills filter cleared', 'info');
  }
}

/**
 * Filter nodes by skills
 */
function filterNodesBySkills(skills) {
  if (!window.d3 || !window.synapseSimulation) {
    console.warn('⚠️ Synapse not available for filtering');
    return;
  }
  
  const svg = document.getElementById('synapse-svg');
  if (!svg) return;
  
  const nodes = window.synapseSimulation.nodes();
  
  if (skills.length === 0) {
    // Show all nodes
    window.d3.select(svg)
      .selectAll('.node')
      .style('opacity', 1)
      .style('pointer-events', 'all');
    return;
  }
  
  // Filter nodes
  window.d3.select(svg)
    .selectAll('.node')
    .style('opacity', d => {
      if (!d.skills) return 0.1;
      
      const nodeSkills = Array.isArray(d.skills) ? d.skills : 
                        typeof d.skills === 'string' ? d.skills.split(',') : [];
      
      const normalizedNodeSkills = nodeSkills.map(s => s.trim().toLowerCase());
      const hasMatch = skills.some(skill => 
        normalizedNodeSkills.some(ns => ns.includes(skill.toLowerCase()))
      );
      
      return hasMatch ? 1 : 0.1;
    })
    .style('pointer-events', d => {
      if (!d.skills) return 'none';
      
      const nodeSkills = Array.isArray(d.skills) ? d.skills : 
                        typeof d.skills === 'string' ? d.skills.split(',') : [];
      
      const normalizedNodeSkills = nodeSkills.map(s => s.trim().toLowerCase());
      const hasMatch = skills.some(skill => 
        normalizedNodeSkills.some(ns => ns.includes(skill.toLowerCase()))
      );
      
      return hasMatch ? 'all' : 'none';
    });
  
  console.log(`✅ Filtered nodes by skills: ${skills.join(', ')}`);
}

/**
 * Show notification helper
 */
function showNotification(message, type = 'info') {
  if (typeof window.showNotification === 'function') {
    window.showNotification(message, type);
  } else {
    console.log(`📢 ${message}`);
  }
}

// Auto-initialize when DOM is ready (but don't block if button not found)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initSkillsFilter();
    } catch (err) {
      console.warn('⚠️ Skills filter initialization deferred:', err.message);
    }
  });
} else {
  try {
    initSkillsFilter();
  } catch (err) {
    console.warn('⚠️ Skills filter initialization deferred:', err.message);
  }
}

// Export for manual initialization
window.SkillsFilter = { init: initSkillsFilter };

console.log("✅ Skills Filter module loaded");
