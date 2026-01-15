// ================================================================
// START Flow - Integration Layer
// ================================================================
// Ties together all START flow enhancements:
// - Enhanced recommendations
// - Phase 2 features
// - Dynamic UI population
// - Event handling
// ================================================================

console.log("%c🚀 START Flow Integration Loading", "color:#0f8; font-weight:bold;");

// ================================================================
// ENHANCED START MODAL
// ================================================================

/**
 * Enhanced openStartModal with recommendations
 */
async function openEnhancedStartModal() {
  console.log('🚀 Opening enhanced START modal');

  const modal = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');

  if (!modal || !backdrop) {
    console.error('START modal elements not found');
    return;
  }

  // Show modal
  modal.style.display = 'block';
  backdrop.style.display = 'block';

  // Animate in
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.style.transform = 'translateX(0)';
  }, 10);

  // Load and display recommendations
  await populateRecommendations();
}

/**
 * Populate the START modal with ranked recommendations
 */
let populateAttempts = 0;
const MAX_POPULATE_ATTEMPTS = 10;

async function populateRecommendations() {
  const container = document.getElementById('start-options-container');
  if (!container) {
    console.error('❌ start-options-container not found, showing fallback');
    showFallbackStartFlow();
    return;
  }

  // Show loading state
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Analyzing your network...</p>
    </div>
  `;

  try {
    // Get current user and supabase - check multiple sources
    const currentUser = window.currentUserProfile || 
                       window.appState?.communityProfile ||
                       window.startState?.currentUserProfile ||
                       window.synapseData?.currentUser;
    
    const supabase = window.supabase || window.supabaseClient;

    if (!currentUser) {
      populateAttempts++;
      if (populateAttempts >= MAX_POPULATE_ATTEMPTS) {
        throw new Error('User profile not available after multiple attempts');
      }
      console.warn(`⚠️ User profile not yet available, waiting... (attempt ${populateAttempts}/${MAX_POPULATE_ATTEMPTS})`);
      // Wait a bit and try again
      setTimeout(populateRecommendations, 500);
      return;
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    // Reset attempts counter on success
    populateAttempts = 0;

    console.log('✅ Found user profile:', currentUser.name || currentUser.email);
    console.log('✅ Supabase client available');

    // Calculate recommendations
    const options = await window.calculateRecommendedFocus(supabase, currentUser);
    
    if (options.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.6);">
          <i class="fas fa-compass" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <p>Loading your personalized recommendations...</p>
        </div>
      `;
      return;
    }

    // Generate HTML for ranked options
    let html = '';
    
    options.forEach((option, index) => {
      const isRecommended = index === 0;
      const size = isRecommended ? 'large' : 'normal';
      const glow = isRecommended ? 'glow' : '';
      
      html += generateOptionHTML(option, isRecommended, currentUser);
    });

    container.innerHTML = html;

    // Wire up event handlers
    wireOptionHandlers(options, currentUser);

  } catch (error) {
    console.error('Error loading recommendations:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255,107,107,0.7);">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Unable to load recommendations. Please try again.</p>
      </div>
    `;
    // Show fallback after 2 seconds
    setTimeout(showFallbackStartFlow, 2000);
  }
}

/**
 * Show fallback START flow if enhanced version fails
 */
function showFallbackStartFlow() {
  const container = document.getElementById('start-options-container');
  const buttonSection = document.getElementById('start-button-section');
  const doneButton = document.getElementById('start-done-button');
  
  if (container) container.style.display = 'none';
  if (buttonSection) buttonSection.style.display = 'block';
  if (doneButton) doneButton.style.display = 'block';
}

/**
 * Generate HTML for a single option
 */
function generateOptionHTML(option, isRecommended, currentUser) {
  const colors = {
    focus: { primary: '#00e0ff', secondary: 'rgba(0,224,255,0.15)' },
    projects: { primary: '#00ff88', secondary: 'rgba(0,255,136,0.15)' },
    people: { primary: '#ffd700', secondary: 'rgba(255,215,0,0.15)' }
  };

  const icons = {
    focus: 'compass',
    projects: 'rocket',
    people: 'users'
  };

  const color = colors[option.type] || colors.focus;
  const icon = icons[option.type] || 'compass';

  const baseStyle = `
    background: linear-gradient(135deg, ${color.secondary}, rgba(0,0,0,0.1));
    border: 2px solid ${isRecommended ? color.primary : 'rgba(255,255,255,0.2)'};
    border-radius: 16px;
    padding: ${isRecommended ? '2rem' : '1.5rem'};
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: left;
    position: relative;
    overflow: hidden;
  `;

  const glowStyle = isRecommended ? `
    box-shadow: 0 0 30px ${color.primary}40;
    animation: recommendedPulse 3s ease-in-out infinite;
  ` : '';

  const preview = window.generatePreviewHTML ? window.generatePreviewHTML(option) : '';

  return `
    <div class="start-option" data-type="${option.type}" style="${baseStyle} ${glowStyle}">
      ${isRecommended ? `
        <div style="position: absolute; top: 1rem; right: 1rem; background: ${color.primary}; color: #000; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">
          RECOMMENDED
        </div>
      ` : ''}
      
      <div style="display: flex; align-items: start; gap: 1.5rem; margin-bottom: 1rem;">
        <div style="font-size: ${isRecommended ? '3rem' : '2.5rem'}; color: ${color.primary}; flex-shrink: 0;">
          <i class="fas fa-${icon}"></i>
        </div>
        <div style="flex: 1;">
          <div style="color: #fff; font-size: ${isRecommended ? '1.4rem' : '1.2rem'}; font-weight: 700; margin-bottom: 0.5rem;">
            ${option.title}
            ${isRecommended ? `
              <button class="why-this-btn" data-type="${option.type}" style="
                margin-left: 0.5rem;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                width: 24px;
                height: 24px;
                color: rgba(255,255,255,0.7);
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
              " title="Why this recommendation?">
                <i class="fas fa-info"></i>
              </button>
            ` : ''}
          </div>
          <div style="color: rgba(255,255,255,0.7); font-size: 0.95rem; line-height: 1.4;">
            ${getOptionDescription(option.type)}
          </div>
        </div>
      </div>

      ${preview}

      <div style="margin-top: 1.5rem;">
        <button class="select-option-btn" data-type="${option.type}" style="
          width: 100%;
          padding: ${isRecommended ? '1rem 2rem' : '0.8rem 1.5rem'};
          background: linear-gradient(135deg, ${color.primary}, ${color.primary}cc);
          border: none;
          border-radius: 10px;
          color: ${option.type === 'people' ? '#000' : '#000'};
          font-weight: 700;
          cursor: pointer;
          font-size: ${isRecommended ? '1.1rem' : '1rem'};
          transition: all 0.2s;
          box-shadow: 0 4px 15px ${color.primary}40;
        ">
          ${isRecommended ? '🎯 Start Here' : 'Choose This'}
        </button>
      </div>
    </div>
  `;
}

function getOptionDescription(type) {
  const descriptions = {
    focus: 'Dive into the theme where your interests and activity overlap most',
    projects: 'Explore active projects that match your skills and interests',
    people: 'Connect with people who share your interests and goals'
  };
  return descriptions[type] || '';
}

/**
 * Wire up event handlers for options
 */
function wireOptionHandlers(options, currentUser) {
  // Select option buttons
  document.querySelectorAll('.select-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.type;
      const option = options.find(o => o.type === type);
      
      if (option && window.setSessionFocus) {
        window.setSessionFocus(type, option.data);
        
        // Track action
        if (window.trackAction) {
          window.trackAction(type);
        }
      }
    });

    // Hover effects
    btn.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = e.currentTarget.style.boxShadow.replace('40', '60');
    });

    btn.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = e.currentTarget.style.boxShadow.replace('60', '40');
    });
  });

  // Why this buttons
  document.querySelectorAll('.why-this-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = e.currentTarget.dataset.type;
      const option = options.find(o => o.type === type);
      
      if (option && window.showWhyThisModal) {
        // Mock activity data for now
        const activityData = {
          recentThemeViews: 2,
          recentProjectViews: 1,
          recentConnections: 0,
          userProjects: []
        };
        
        window.showWhyThisModal(option, currentUser, activityData);
      }
    });

    // Hover effects
    btn.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
      e.currentTarget.style.color = '#fff';
    });

    btn.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
    });
  });

  // Option hover effects
  document.querySelectorAll('.start-option').forEach(option => {
    option.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = e.currentTarget.style.boxShadow + ', 0 10px 30px rgba(0,0,0,0.3)';
    });

    option.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = e.currentTarget.style.boxShadow.replace(', 0 10px 30px rgba(0,0,0,0.3)', '');
    });
  });
}

// ================================================================
// CLOSE MODAL FUNCTION
// ================================================================

function closeStartModal() {
  const modal = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');

  if (modal) {
    modal.style.opacity = '0';
    modal.style.transform = 'translateX(100%)';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }

  if (backdrop) {
    backdrop.style.display = 'none';
  }
}

// ================================================================
// INTEGRATION WITH EXISTING SYSTEM
// ================================================================

// Override the original openStartModal function
document.addEventListener('DOMContentLoaded', () => {
  // Replace START button handler
  const startBtn = document.getElementById('btn-start');
  if (startBtn) {
    // Remove existing listeners
    const newBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newBtn, startBtn);
    
    // Add new enhanced handler
    newBtn.addEventListener('click', openEnhancedStartModal);
  }

  // Add CSS animations
  if (!document.getElementById('start-integration-styles')) {
    const style = document.createElement('style');
    style.id = 'start-integration-styles';
    style.textContent = `
      @keyframes recommendedPulse {
        0%, 100% { 
          box-shadow: 0 0 30px rgba(0,224,255,0.25);
        }
        50% { 
          box-shadow: 0 0 40px rgba(0,224,255,0.4);
        }
      }
      
      .start-option {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .start-option:hover {
        transform: translateY(-4px);
      }
      
      .select-option-btn:hover {
        transform: translateY(-2px) scale(1.02);
      }
      
      .why-this-btn:hover {
        transform: scale(1.1);
      }
    `;
    document.head.appendChild(style);
  }
});

// Export functions
window.openEnhancedStartModal = openEnhancedStartModal;
window.closeStartModal = closeStartModal;
window.populateRecommendations = populateRecommendations;
window.showFallbackStartFlow = showFallbackStartFlow;
window.clearSessionFocus = function() {
  if (window.clearFocus) {
    window.clearFocus();
  }
  localStorage.removeItem('startSessionFocus');
  console.log('🔄 Session focus cleared');
};

console.log('✅ START Flow Integration ready');