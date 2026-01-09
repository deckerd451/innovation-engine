/**
 * Theme Circles Discovery Interface
 * Help users find and join theme circles that match their interests
 */

import { showSynapseNotification } from "./synapse/ui.js";
import { markInterested } from "./synapse/themes.js";

let supabase = null;
let currentUser = null;
let allThemes = [];
let allTags = new Set();
let userParticipations = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initThemeDiscovery() {
  supabase = window.supabase;
  if (!supabase) {
    console.warn("⚠️ Supabase not available for theme discovery");
    return;
  }

  // Listen for profile loaded event
  window.addEventListener('profile-loaded', async (e) => {
    currentUser = e.detail.profile;
    await loadUserParticipations();
  });

  // Make functions available globally
  window.openThemeDiscoveryModal = openThemeDiscoveryModal;
  window.closeThemeDiscoveryModal = closeThemeDiscoveryModal;

  console.log("✅ Theme discovery initialized");
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadActiveThemes() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('activity_score', { ascending: false });

    if (error) throw error;

    allThemes = data || [];

    // Extract all unique tags
    allTags.clear();
    allThemes.forEach(theme => {
      (theme.tags || []).forEach(tag => allTags.add(tag));
    });

  } catch (error) {
    console.error('Failed to load themes:', error);
    showSynapseNotification('Failed to load themes', 'error');
  }
}

async function loadUserParticipations() {
  if (!supabase || !currentUser?.id) return;

  try {
    const { data, error } = await supabase
      .from('theme_participants')
      .select('theme_id, signals, engagement_level')
      .eq('community_id', currentUser.id)
      .gt('expires_at', new Date().toISOString());

    if (error) throw error;

    userParticipations = data || [];

  } catch (error) {
    console.error('Failed to load user participations:', error);
  }
}

function isUserParticipating(themeId) {
  return userParticipations.some(p => p.theme_id === themeId);
}

function getUserEngagement(themeId) {
  const participation = userParticipations.find(p => p.theme_id === themeId);
  return participation?.engagement_level || null;
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

function getRecommendedThemes() {
  if (!currentUser) return [];

  const userSkills = (currentUser.skills || []).map(s =>
    String(s).toLowerCase().trim()
  );
  const userInterests = (currentUser.interests || []).map(i =>
    String(i).toLowerCase().trim()
  );

  return allThemes
    .map(theme => {
      let score = 0;
      const themeTags = (theme.tags || []).map(t => t.toLowerCase().trim());

      // Match skills
      const skillMatches = userSkills.filter(skill =>
        themeTags.some(tag =>
          tag.includes(skill) || skill.includes(tag)
        )
      );
      score += skillMatches.length * 3;

      // Match interests
      const interestMatches = userInterests.filter(interest =>
        themeTags.some(tag =>
          tag.includes(interest) || interest.includes(tag)
        )
      );
      score += interestMatches.length * 2;

      // Boost for new/emerging themes
      if (theme.activity_score < 5) score += 1;

      // Penalize if already participating
      if (isUserParticipating(theme.id)) score = 0;

      return { theme, score, matches: [...skillMatches, ...interestMatches] };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6); // Top 6 recommendations
}

// ============================================================================
// MODAL UI
// ============================================================================

export async function openThemeDiscoveryModal() {
  // Remove existing modal if present
  closeThemeDiscoveryModal();

  // Load data
  await loadActiveThemes();
  if (currentUser) await loadUserParticipations();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'theme-discovery-modal';
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
      <button class="modal-close" onclick="window.closeThemeDiscoveryModal()">
        <i class="fas fa-times"></i>
      </button>

      <div class="modal-header">
        <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">
          <i class="fas fa-compass"></i> Discover Theme Circles
        </h2>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
          Find and join conversations that matter to you
        </p>
      </div>

      <!-- Search and Filters -->
      <div class="discovery-controls" style="margin: 1.5rem 0; display: grid; gap: 1rem;">
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input
              type="text"
              id="theme-search-input"
              placeholder="Search themes..."
              style="width: 100%; padding: 0.75rem 0.75rem 0.75rem 2.5rem; background: rgba(0,0,0,0.3);
                     border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #fff; font-size: 1rem;"
            />
            <i class="fas fa-search" style="position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); color: rgba(0,224,255,0.5);"></i>
          </div>
          <button
            id="btn-show-recommendations"
            style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1));
                   border: 1px solid rgba(255,215,0,0.4); border-radius: 8px; color: #ffd700;
                   cursor: pointer; font-weight: 600; white-space: nowrap;"
          >
            <i class="fas fa-star"></i> For You
          </button>
        </div>

        <div id="tag-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <!-- Tag filters will be inserted here -->
        </div>
      </div>

      <!-- Themes Grid -->
      <div id="themes-grid-container">
        ${renderThemesGrid(allThemes, 'all')}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  renderTagFilters();
  wireDiscoveryEvents();
}

export function closeThemeDiscoveryModal() {
  const modal = document.getElementById('theme-discovery-modal');
  if (modal) modal.remove();
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  if (!container) return;

  const tags = Array.from(allTags).sort();

  container.innerHTML = tags.map(tag => `
    <button
      class="tag-filter"
      data-tag="${escapeHtml(tag)}"
      style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3);
             border-radius: 20px; color: rgba(0,224,255,0.8); cursor: pointer; font-size: 0.85rem;
             transition: all 0.2s;"
    >
      ${escapeHtml(tag)}
    </button>
  `).join('');
}

function renderThemesGrid(themes, mode = 'all') {
  if (!themes || themes.length === 0) {
    return `
      <div style="text-align: center; padding: 4rem 2rem; color: rgba(255,255,255,0.5);">
        <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
        <p style="font-size: 1.1rem;">No themes found</p>
        <p style="font-size: 0.9rem; opacity: 0.7;">Try adjusting your search or filters</p>
      </div>
    `;
  }

  const title = mode === 'recommended' ?
    '<h3 style="color: #ffd700; font-size: 1.1rem; margin-bottom: 1rem;"><i class="fas fa-star"></i> Recommended For You</h3>' :
    mode === 'filtered' ?
    '<h3 style="color: #00e0ff; font-size: 1.1rem; margin-bottom: 1rem;"><i class="fas fa-filter"></i> Filtered Results</h3>' :
    '<h3 style="color: #00e0ff; font-size: 1.1rem; margin-bottom: 1rem;"><i class="fas fa-compass"></i> All Active Themes</h3>';

  return `
    ${title}
    <div class="themes-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem;">
      ${themes.map(item => {
        const theme = item.theme || item;
        const matches = item.matches || [];
        return renderDiscoveryThemeCard(theme, matches);
      }).join('')}
    </div>
  `;
}

function renderDiscoveryThemeCard(theme, matches = []) {
  const now = Date.now();
  const expires = new Date(theme.expires_at).getTime();
  const remaining = expires - now;
  const daysRemaining = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const isParticipating = isUserParticipating(theme.id);
  const engagement = getUserEngagement(theme.id);

  return `
    <div class="discovery-theme-card" data-theme-id="${theme.id}" style="
      background: ${isParticipating ? 'rgba(0,255,136,0.05)' : 'rgba(0,224,255,0.05)'};
      border: 1px solid ${isParticipating ? 'rgba(0,255,136,0.3)' : 'rgba(0,224,255,0.3)'};
      border-radius: 12px;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    ">
      ${isParticipating ? `
        <div style="position: absolute; top: 0.75rem; right: 0.75rem; padding: 0.25rem 0.75rem;
                    background: rgba(0,255,136,0.2); border: 1px solid rgba(0,255,136,0.5);
                    border-radius: 12px; font-size: 0.7rem; color: #00ff88;">
          <i class="fas fa-check-circle"></i> Joined
        </div>
      ` : ''}

      <div style="margin-bottom: 0.75rem;">
        <h4 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.1rem; padding-right: ${isParticipating ? '5rem' : '0'};">
          ${escapeHtml(theme.title)}
        </h4>
        ${theme.description ? `
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.85rem; line-height: 1.4;">
            ${escapeHtml(theme.description).substring(0, 120)}${theme.description.length > 120 ? '...' : ''}
          </p>
        ` : ''}
      </div>

      ${matches.length > 0 ? `
        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(255,215,0,0.1);
                    border-left: 3px solid rgba(255,215,0,0.5); border-radius: 4px;">
          <div style="font-size: 0.75rem; color: #ffd700; margin-bottom: 0.25rem;">
            <i class="fas fa-star"></i> Matches your profile
          </div>
          <div style="font-size: 0.75rem; color: rgba(255,215,0,0.8);">
            ${matches.slice(0, 3).map(m => escapeHtml(m)).join(', ')}${matches.length > 3 ? '...' : ''}
          </div>
        </div>
      ` : ''}

      ${theme.tags && theme.tags.length > 0 ? `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          ${theme.tags.slice(0, 4).map(tag => `
            <span style="padding: 0.25rem 0.5rem; background: rgba(0,224,255,0.1);
                         border: 1px solid rgba(0,224,255,0.3); border-radius: 4px;
                         font-size: 0.7rem; color: rgba(0,224,255,0.8);">
              ${escapeHtml(tag)}
            </span>
          `).join('')}
          ${theme.tags.length > 4 ? `<span style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">+${theme.tags.length - 4}</span>` : ''}
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
          <i class="fas fa-clock"></i> ${daysRemaining} days left
          <span style="margin-left: 0.75rem;">
            <i class="fas fa-users"></i> ${theme.activity_score || 0}
          </span>
        </div>
        ${!isParticipating ? `
          <button
            class="btn-join-theme"
            data-theme-id="${theme.id}"
            style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #00e0ff, #00a8cc);
                   border: none; border-radius: 6px; color: #000; cursor: pointer;
                   font-weight: 700; font-size: 0.85rem;"
          >
            <i class="fas fa-star"></i> Join
          </button>
        ` : engagement ? `
          <span style="padding: 0.5rem 1rem; background: rgba(0,255,136,0.2);
                       border: 1px solid rgba(0,255,136,0.5); border-radius: 6px;
                       color: #00ff88; font-weight: 600; font-size: 0.85rem;">
            ${engagement === 'leading' ? '👑 Leading' : engagement === 'active' ? '⚡ Active' : '⭐ Interested'}
          </span>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function wireDiscoveryEvents() {
  const modal = document.getElementById('theme-discovery-modal');
  if (!modal) return;

  // Search
  const searchInput = modal.querySelector('#theme-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  // Show recommendations
  const recBtn = modal.querySelector('#btn-show-recommendations');
  if (recBtn) {
    recBtn.addEventListener('click', showRecommendations);
  }

  // Tag filters (delegated)
  modal.addEventListener('click', (e) => {
    const tagBtn = e.target.closest('.tag-filter');
    if (tagBtn) {
      handleTagFilter(tagBtn);
      return;
    }

    const joinBtn = e.target.closest('.btn-join-theme');
    if (joinBtn) {
      e.stopPropagation();
      handleJoinTheme(joinBtn.dataset.themeId);
      return;
    }

    const themeCard = e.target.closest('.discovery-theme-card');
    if (themeCard && !e.target.closest('button')) {
      handleThemeClick(themeCard.dataset.themeId);
    }
  });
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    // Show all themes
    const container = document.getElementById('themes-grid-container');
    if (container) {
      container.innerHTML = renderThemesGrid(allThemes, 'all');
    }
    return;
  }

  const filtered = allThemes.filter(theme => {
    const titleMatch = theme.title.toLowerCase().includes(query);
    const descMatch = (theme.description || '').toLowerCase().includes(query);
    const tagMatch = (theme.tags || []).some(tag =>
      tag.toLowerCase().includes(query)
    );
    return titleMatch || descMatch || tagMatch;
  });

  const container = document.getElementById('themes-grid-container');
  if (container) {
    container.innerHTML = renderThemesGrid(filtered, 'filtered');
  }
}

function handleTagFilter(button) {
  const tag = button.dataset.tag;
  const isActive = button.classList.contains('active');

  if (isActive) {
    // Remove filter
    button.classList.remove('active');
    button.style.background = 'rgba(0,224,255,0.1)';
    button.style.borderColor = 'rgba(0,224,255,0.3)';
    button.style.color = 'rgba(0,224,255,0.8)';
  } else {
    // Add filter
    button.classList.add('active');
    button.style.background = 'rgba(0,224,255,0.25)';
    button.style.borderColor = 'rgba(0,224,255,0.6)';
    button.style.color = '#00e0ff';
  }

  // Get all active filters
  const activeFilters = Array.from(
    document.querySelectorAll('.tag-filter.active')
  ).map(btn => btn.dataset.tag);

  if (activeFilters.length === 0) {
    // Show all
    const container = document.getElementById('themes-grid-container');
    if (container) {
      container.innerHTML = renderThemesGrid(allThemes, 'all');
    }
    return;
  }

  // Filter by tags
  const filtered = allThemes.filter(theme =>
    activeFilters.some(filter =>
      (theme.tags || []).includes(filter)
    )
  );

  const container = document.getElementById('themes-grid-container');
  if (container) {
    container.innerHTML = renderThemesGrid(filtered, 'filtered');
  }
}

function showRecommendations() {
  if (!currentUser) {
    showSynapseNotification('Please log in to see recommendations', 'info');
    return;
  }

  const recommendations = getRecommendedThemes();

  if (recommendations.length === 0) {
    showSynapseNotification('No recommendations right now. Update your profile skills!', 'info');
    return;
  }

  const container = document.getElementById('themes-grid-container');
  if (container) {
    container.innerHTML = renderThemesGrid(recommendations, 'recommended');
  }
}

async function handleJoinTheme(themeId) {
  if (!currentUser) {
    showSynapseNotification('Please log in to join themes', 'info');
    return;
  }

  try {
    await markInterested(supabase, {
      themeId,
      communityId: currentUser.id,
      days: 7
    });

    showSynapseNotification('Joined theme! ✨', 'success');

    // Reload data
    await loadUserParticipations();

    // Re-render current view
    const container = document.getElementById('themes-grid-container');
    if (container) {
      container.innerHTML = renderThemesGrid(allThemes, 'all');
    }

  } catch (error) {
    console.error('Failed to join theme:', error);
    showSynapseNotification(error.message || 'Failed to join theme', 'error');
  }
}

async function handleThemeClick(themeId) {
  // Open theme details (use existing theme card system)
  const theme = allThemes.find(t => t.id === themeId);
  if (!theme) return;

  // Import and use existing theme card renderer
  try {
    const { renderThemeOverlayCard, getThemeInterestCount } = await import('./synapse/themes.js');

    const interestCount = await getThemeInterestCount(supabase, theme.id);

    // Load participants
    const { data: participantData } = await supabase
      .from('theme_participants')
      .select(`
        community_id,
        engagement_level,
        community:community_id (
          id,
          name,
          image_url
        )
      `)
      .eq('theme_id', theme.id)
      .gt('expires_at', new Date().toISOString());

    const participants = (participantData || []).map(p => ({
      id: p.community?.id,
      name: p.community?.name || 'Anonymous',
      image_url: p.community?.image_url,
      engagement_level: p.engagement_level
    }));

    await renderThemeOverlayCard({
      themeNode: {
        ...theme,
        theme_id: theme.id
      },
      interestCount,
      participants,
      onInterested: async () => {
        if (!currentUser) return;
        await handleJoinTheme(theme.id);
      }
    });

    // Close discovery modal to show theme card
    closeThemeDiscoveryModal();

  } catch (error) {
    console.error('Failed to open theme card:', error);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ============================================================================
// AUTO-INITIALIZE
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeDiscovery);
} else {
  initThemeDiscovery();
}
