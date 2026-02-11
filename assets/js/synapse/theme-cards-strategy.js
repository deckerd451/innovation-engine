// assets/js/synapse/theme-cards-strategy.js
// New Theme Strategy: Card-based interface to replace problematic concentric circles

console.log("🎯 NEW THEME CARDS STRATEGY LOADED");

import { getInitials, truncateName, escapeHtml } from "./ui.js";

// Enhanced theme color palette with more vibrant, distinct colors
const THEME_COLORS = [
  "#00e0ff", // Electric Cyan
  "#ff4757", // Vibrant Red
  "#ffd700", // Gold
  "#2ed573", // Emerald Green
  "#ff6b9d", // Pink
  "#ff7f50", // Coral
  "#7bed9f", // Mint Green
  "#70a1ff", // Sky Blue
  "#a4b0be", // Steel Blue
  "#ff6348", // Orange Red
  "#dda0dd", // Plum
  "#40e0d0", // Turquoise
];

// Get a consistent color for a theme based on its ID
export function getThemeColor(themeId) {
  if (!themeId) return "#00e0ff";

  // Convert theme ID to a number for consistent hashing
  let hash = 0;
  const idStr = String(themeId);
  for (let i = 0; i < idStr.length; i++) {
    hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % THEME_COLORS.length;
  return THEME_COLORS[index];
}
import { showSynapseNotification } from "./ui.js";

/**
 * NEW STRATEGY: Theme Cards Grid
 * 
 * Instead of overlapping SVG circles that cause click blocking:
 * 1. Display themes as interactive cards in a responsive grid
 * 2. Each card shows theme info, participant count, and projects
 * 3. Cards are always clickable (no SVG layering issues)
 * 4. Better mobile experience and accessibility
 * 5. Easier to add features like search, filtering, sorting
 */

export function renderThemeCardsGrid(container, themeNodes, { onThemeClick, currentUserCommunityId } = {}) {
  console.log("🎯 Rendering theme cards grid with", themeNodes.length, "themes");

  // Clear existing content
  container.innerHTML = '';

  // Create grid container
  const gridContainer = document.createElement('div');
  gridContainer.className = 'theme-cards-grid';
  gridContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    backdrop-filter: blur(10px);
  `;

  // Add header
  const header = document.createElement('div');
  header.className = 'theme-grid-header';
  header.style.cssText = `
    grid-column: 1 / -1;
    text-align: center;
    margin-bottom: 1rem;
  `;
  header.innerHTML = `
    <h2 style="color: #00e0ff; font-size: 2rem; margin: 0 0 0.5rem 0; font-weight: 700;">
      🌟 Active Theme Circles
    </h2>
    <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1.1rem;">
      Join a theme to collaborate on projects and connect with like-minded innovators
    </p>
  `;
  gridContainer.appendChild(header);

  // Sort themes by activity (participant count + project count)
  const sortedThemes = [...themeNodes].sort((a, b) => {
    const scoreA = (a.participant_count || 0) + (a.project_count || 0);
    const scoreB = (b.participant_count || 0) + (b.project_count || 0);
    return scoreB - scoreA;
  });

  // Create theme cards
  sortedThemes.forEach(theme => {
    const card = createThemeCard(theme, { onThemeClick, currentUserCommunityId });
    gridContainer.appendChild(card);
  });

  // Add empty state if no themes
  if (themeNodes.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem;
      color: rgba(255, 255, 255, 0.6);
    `;
    emptyState.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 1rem;">🌱</div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">No Active Themes</h3>
      <p>Theme circles will appear here when they're created by the community.</p>
    `;
    gridContainer.appendChild(emptyState);
  }

  container.appendChild(gridContainer);

  // Add responsive CSS
  addThemeCardsCSS();

  return gridContainer;
}

function createThemeCard(theme, { onThemeClick, currentUserCommunityId }) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  card.dataset.themeId = theme.theme_id;

  const themeColor = getThemeColor(theme.theme_id);
  const isUserParticipant = theme.user_is_participant;
  const isDiscoverable = !isUserParticipant;

  // Calculate time remaining
  const now = Date.now();
  const expires = new Date(theme.expires_at).getTime();
  const remaining = expires - now;
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const timeText = daysRemaining > 1 ? `${daysRemaining} days left` : `${hoursRemaining} hours left`;

  // Engagement level display
  const engagementLevels = {
    observer: { icon: "👀", label: "Observer", color: "rgba(255,255,255,0.5)" },
    interested: { icon: "⭐", label: "Interested", color: "rgba(0,224,255,0.7)" },
    active: { icon: "⚡", label: "Active", color: "rgba(0,255,136,0.8)" },
    leading: { icon: "👑", label: "Leading", color: "rgba(255,215,0,0.9)" }
  };

  const userEngagement = theme.user_engagement_level ? engagementLevels[theme.user_engagement_level] : null;

  card.style.cssText = `
    background: linear-gradient(135deg, 
      rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.1),
      rgba(0, 0, 0, 0.4)
    );
    border: 2px solid ${isUserParticipant ? themeColor : `rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.3)`};
    border-radius: 12px;
    padding: 1.5rem;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  `;

  // Add hover effects
  card.addEventListener('mouseenter', () => {
    card.style.transform = 'translateY(-4px)';
    card.style.boxShadow = `0 8px 32px rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.3)`;
    card.style.borderColor = themeColor;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'translateY(0)';
    card.style.boxShadow = 'none';
    card.style.borderColor = isUserParticipant ? themeColor : `rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.3)`;
  });

  // Theme icon (top-right corner)
  const themeIcons = ["🚀", "💡", "🎨", "🔬", "🌟", "⚡", "🎯", "🔥", "💎", "🌈"];
  const iconIndex = Math.abs(theme.theme_id?.charCodeAt?.(0) || 0) % themeIcons.length;

  card.innerHTML = `
    <!-- Theme Icon -->
    <div style="position: absolute; top: 1rem; right: 1rem; font-size: 2rem; opacity: 0.7;">
      ${themeIcons[iconIndex]}
    </div>

    <!-- User Engagement Badge -->
    ${userEngagement ? `
      <div style="position: absolute; top: 1rem; left: 1rem; 
                  background: ${userEngagement.color}; 
                  color: #000; 
                  padding: 0.25rem 0.75rem; 
                  border-radius: 20px; 
                  font-size: 0.75rem; 
                  font-weight: bold;
                  display: flex; 
                  align-items: center; 
                  gap: 0.25rem;">
        ${userEngagement.icon} ${userEngagement.label}
      </div>
    ` : ''}

    <!-- Theme Title -->
    <h3 style="color: ${themeColor}; 
               font-size: 1.4rem; 
               font-weight: 700; 
               margin: ${userEngagement ? '2.5rem' : '0'} 0 0.5rem 0; 
               line-height: 1.2;">
      ${escapeHtml(theme.title)}
    </h3>

    <!-- Theme Description -->
    ${theme.description ? `
      <p style="color: rgba(255, 255, 255, 0.8); 
                font-size: 0.95rem; 
                line-height: 1.4; 
                margin-bottom: 1rem;">
        ${escapeHtml(theme.description)}
      </p>
    ` : ''}

    <!-- Stats Row -->
    <div style="display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 1rem; 
                padding: 0.75rem; 
                background: rgba(0, 0, 0, 0.3); 
                border-radius: 8px;">
      <div style="display: flex; gap: 1.5rem;">
        <div style="text-align: center;">
          <div style="color: ${themeColor}; font-weight: bold; font-size: 1.2rem;">
            ${theme.participant_count || 0}
          </div>
          <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.8rem;">
            People
          </div>
        </div>
        <div style="text-align: center;">
          <div style="color: ${themeColor}; font-weight: bold; font-size: 1.2rem;">
            ${theme.project_count || 0}
          </div>
          <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.8rem;">
            Projects
          </div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.85rem;">
          ⏰ ${timeText}
        </div>
      </div>
    </div>

    <!-- Projects Preview -->
    ${theme.projects && theme.projects.length > 0 ? `
      <div style="margin-bottom: 1rem;">
        <div style="color: rgba(255, 255, 255, 0.7); 
                   font-size: 0.8rem; 
                   text-transform: uppercase; 
                   letter-spacing: 0.5px; 
                   margin-bottom: 0.5rem;">
          Featured Projects
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${theme.projects.slice(0, 3).map(project => `
            <div style="background: rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.2);
                        border: 1px solid rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.4);
                        padding: 0.25rem 0.75rem;
                        border-radius: 16px;
                        font-size: 0.8rem;
                        color: ${themeColor};
                        font-weight: 500;">
              💡 ${escapeHtml(project.title)}
            </div>
          `).join('')}
          ${theme.projects.length > 3 ? `
            <div style="color: rgba(255, 255, 255, 0.5); 
                       font-size: 0.8rem; 
                       padding: 0.25rem 0.5rem;">
              +${theme.projects.length - 3} more
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Tags -->
    ${theme.tags && theme.tags.length > 0 ? `
      <div style="margin-bottom: 1rem;">
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${theme.tags.slice(0, 4).map(tag => `
            <span style="background: rgba(255, 255, 255, 0.1);
                         border: 1px solid rgba(255, 255, 255, 0.2);
                         padding: 0.25rem 0.5rem;
                         border-radius: 12px;
                         font-size: 0.75rem;
                         color: rgba(255, 255, 255, 0.8);">
              #${escapeHtml(tag)}
            </span>
          `).join('')}
          ${theme.tags.length > 4 ? `
            <span style="color: rgba(255, 255, 255, 0.5); font-size: 0.75rem; padding: 0.25rem 0.5rem;">
              +${theme.tags.length - 4}
            </span>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Action Button -->
    <button class="theme-card-action" 
            style="width: 100%; 
                   padding: 0.75rem 1rem; 
                   background: ${isUserParticipant ? 
                     `linear-gradient(135deg, ${themeColor}, rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.8))` :
                     `linear-gradient(135deg, rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.2), rgba(${hexToRgb(themeColor).r}, ${hexToRgb(themeColor).g}, ${hexToRgb(themeColor).b}, 0.1))`
                   };
                   border: 2px solid ${themeColor};
                   border-radius: 8px;
                   color: ${isUserParticipant ? '#000' : themeColor};
                   font-weight: bold;
                   font-size: 0.95rem;
                   cursor: pointer;
                   transition: all 0.2s ease;
                   display: flex;
                   align-items: center;
                   justify-content: center;
                   gap: 0.5rem;">
      ${isUserParticipant ? 
        `<i class="fas fa-cog"></i> Manage Participation` :
        `<i class="fas fa-plus-circle"></i> Join Theme Circle`
      }
    </button>
  `;

  // Add click handler
  card.addEventListener('click', (event) => {
    event.preventDefault();
    console.log("🎯 Theme card clicked:", theme.title, theme.theme_id);
    
    // Visual feedback
    card.style.transform = 'scale(0.98)';
    setTimeout(() => {
      card.style.transform = 'translateY(-4px)';
    }, 100);

    // Call the theme click handler
    if (onThemeClick) {
      onThemeClick(event, theme);
    }
  });

  return card;
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 224, b: 255 };
}

// Add CSS for theme cards
function addThemeCardsCSS() {
  if (document.querySelector('#theme-cards-styles')) return;

  const style = document.createElement('style');
  style.id = 'theme-cards-styles';
  style.textContent = `
    /* Sidebar scrollbar styling */
    .themes-sidebar::-webkit-scrollbar {
      width: 8px;
    }

    .themes-sidebar::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
    }

    .themes-sidebar::-webkit-scrollbar-thumb {
      background: rgba(0, 224, 255, 0.4);
      border-radius: 4px;
    }

    .themes-sidebar::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 224, 255, 0.6);
    }

    /* Theme cards animations */
    .theme-cards-grid {
      animation: fadeInUp 0.6s ease-out;
    }

    .theme-card {
      animation: slideInUp 0.4s ease-out;
      animation-fill-mode: both;
    }

    .theme-card:nth-child(1) { animation-delay: 0.1s; }
    .theme-card:nth-child(2) { animation-delay: 0.2s; }
    .theme-card:nth-child(3) { animation-delay: 0.3s; }
    .theme-card:nth-child(4) { animation-delay: 0.4s; }
    .theme-card:nth-child(5) { animation-delay: 0.5s; }
    .theme-card:nth-child(6) { animation-delay: 0.6s; }

    .theme-card-action:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    }

    .theme-card-action:active {
      transform: translateY(0) !important;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .theme-cards-grid {
        grid-template-columns: 1fr !important;
        padding: 1rem !important;
        gap: 1rem !important;
      }
      
      .theme-card {
        padding: 1rem !important;
      }
      
      .theme-grid-header h2 {
        font-size: 1.5rem !important;
      }
    }

    /* Accessibility improvements */
    .theme-card:focus {
      outline: 3px solid #00e0ff;
      outline-offset: 2px;
    }

    .theme-card-action:focus {
      outline: 2px solid #00e0ff;
      outline-offset: 2px;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .theme-card {
        border-width: 3px !important;
      }
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .theme-card,
      .theme-cards-grid,
      .theme-card-action {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Alternative: Hybrid approach - Keep people/project nodes in center, 
 * but show themes as a sidebar or top panel of cards
 */
export function renderThemesSidebar(container, themeNodes, { onThemeClick, currentUserCommunityId } = {}) {
  console.log("🎯 Rendering themes sidebar with", themeNodes.length, "themes");

  const sidebar = document.createElement('div');
  sidebar.className = 'themes-sidebar';

  // Responsive sidebar styling with proper z-index and spacing
  const isMobile = window.innerWidth <= 768;

  sidebar.style.cssText = `
    position: fixed;
    top: ${isMobile ? '70px' : '90px'};
    right: ${isMobile ? '10px' : '20px'};
    width: ${isMobile ? 'calc(100% - 20px)' : '320px'};
    max-width: ${isMobile ? '400px' : '320px'};
    max-height: calc(100vh - ${isMobile ? '180px' : '200px'});
    background: rgba(0, 0, 0, 0.95);
    border: 2px solid rgba(0, 224, 255, 0.4);
    border-radius: 12px;
    backdrop-filter: blur(15px);
    z-index: 999;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
    box-shadow: 0 8px 32px rgba(0, 224, 255, 0.2);
  `;

  // Header
  const header = document.createElement('div');
  header.innerHTML = `
    <h3 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
      <i class="fas fa-layer-group"></i> Active Themes
    </h3>
  `;
  sidebar.appendChild(header);

  // Theme cards (compact version)
  themeNodes.forEach(theme => {
    const card = createCompactThemeCard(theme, { onThemeClick, currentUserCommunityId });
    sidebar.appendChild(card);
  });

  container.appendChild(sidebar);

  // Add responsive resize listener
  const handleResize = () => {
    const mobile = window.innerWidth <= 768;
    sidebar.style.top = mobile ? '70px' : '90px';
    sidebar.style.right = mobile ? '10px' : '20px';
    sidebar.style.width = mobile ? 'calc(100% - 20px)' : '320px';
    sidebar.style.maxWidth = mobile ? '400px' : '320px';
    sidebar.style.maxHeight = `calc(100vh - ${mobile ? '180px' : '200px'})`;
  };

  window.addEventListener('resize', handleResize);

  return sidebar;
}

function createCompactThemeCard(theme, { onThemeClick, currentUserCommunityId }) {
  const card = document.createElement('div');
  card.className = 'compact-theme-card';
  card.dataset.themeId = theme.theme_id;

  const themeColor = getThemeColor(theme.theme_id);
  const isUserParticipant = theme.user_is_participant;
  const rgb = hexToRgb(themeColor);

  card.style.cssText = `
    background: linear-gradient(135deg,
      rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12),
      rgba(0, 0, 0, 0.4)
    );
    border: ${isUserParticipant ? '2px' : '1px'} solid ${isUserParticipant ? themeColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`};
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 0.75rem;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  `;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
      <h4 style="color: ${themeColor}; margin: 0; font-size: 1rem; font-weight: 700; line-height: 1.3; flex: 1; padding-right: 0.5rem;">
        ${escapeHtml(theme.title)}
      </h4>
      <div style="font-size: 1.3rem; opacity: 0.8; flex-shrink: 0;">
        ${["🚀", "💡", "🎨", "🔬", "🌟", "⚡"][Math.abs(theme.theme_id?.charCodeAt?.(0) || 0) % 6]}
      </div>
    </div>

    <div style="display: flex; gap: 1.2rem; margin-bottom: 0.6rem; font-size: 0.85rem;">
      <span style="color: rgba(255, 255, 255, 0.8); display: flex; align-items: center; gap: 0.3rem;">
        <i class="fas fa-users" style="font-size: 0.75rem;"></i> ${theme.participant_count || 0}
      </span>
      <span style="color: rgba(255, 255, 255, 0.8); display: flex; align-items: center; gap: 0.3rem;">
        <i class="fas fa-lightbulb" style="font-size: 0.75rem;"></i> ${theme.project_count || 0}
      </span>
    </div>

    ${isUserParticipant ? `
      <div style="background: rgba(0, 255, 136, 0.25);
                  border: 1px solid rgba(0, 255, 136, 0.5);
                  padding: 0.4rem 0.6rem;
                  border-radius: 6px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  color: #00ff88;
                  text-align: center;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 0.3rem;">
        <i class="fas fa-check-circle"></i> Joined
      </div>
    ` : `
      <div style="background: rgba(0, 224, 255, 0.15);
                  border: 1px solid rgba(0, 224, 255, 0.4);
                  padding: 0.4rem 0.6rem;
                  border-radius: 6px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  color: #00e0ff;
                  text-align: center;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 0.3rem;">
        <i class="fas fa-plus-circle"></i> Click to Join
      </div>
    `}
  `;

  // Enhanced hover effects
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = themeColor;
    card.style.transform = 'translateX(-6px) scale(1.02)';
    card.style.boxShadow = `0 6px 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
    card.style.background = `linear-gradient(135deg,
      rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2),
      rgba(0, 0, 0, 0.5)
    )`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.borderColor = isUserParticipant ? themeColor : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
    card.style.transform = 'translateX(0) scale(1)';
    card.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
    card.style.background = `linear-gradient(135deg,
      rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12),
      rgba(0, 0, 0, 0.4)
    )`;
  });

  // Click handler
  card.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log("🎯 Compact theme card clicked:", theme.title);

    if (onThemeClick) {
      onThemeClick(event, theme);
    }
  });

  return card;
}

export { createThemeCard, createCompactThemeCard };