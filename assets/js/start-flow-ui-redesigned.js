// ================================================================
// START Flow UI - Redesigned Interface Components
// ================================================================
// Comprehensive UI for the redesigned START flow
// Features all entity types: themes, projects, people, organizations, opportunities
// ================================================================

console.log("%c🎨 START Flow UI Redesigned - Loading", "color:#0f8; font-weight:bold;");

// ================================================================
// MAIN START MODAL INTERFACE
// ================================================================

/**
 * Open the redesigned START modal with comprehensive recommendations
 */
async function openRedesignedStartModal() {
  console.log('🚀 Opening redesigned START modal');
  
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
    backdrop.style.opacity = '1';
  }, 10);
  
  // Load and display comprehensive recommendations
  await populateRedesignedRecommendations();
}

/**
 * Populate the modal with comprehensive daily recommendations
 */
async function populateRedesignedRecommendations() {
  const container = document.getElementById('start-options-container');
  if (!container) {
    console.error('❌ start-options-container not found');
    return;
  }
  
  // Show loading state
  container.innerHTML = createLoadingState();
  
  try {
    // Get daily recommendations
    let recommendations = window.StartFlowRedesigned?.state?.dailyRecommendations;
    
    if (!recommendations) {
      console.log('🔄 Calculating fresh recommendations...');
      recommendations = await window.StartFlowRedesigned.calculateDailyRecommendations();
    }
    
    if (!recommendations) {
      throw new Error('No recommendations available');
    }
    
    // Generate comprehensive UI
    container.innerHTML = createRecommendationsUI(recommendations);
    
    // Wire up event handlers
    wireRecommendationHandlers(recommendations);
    
  } catch (error) {
    console.error('❌ Failed to load recommendations:', error);
    container.innerHTML = createErrorState();
  }
}

// ================================================================
// UI GENERATION FUNCTIONS
// ================================================================

/**
 * Create loading state UI
 */
function createLoadingState() {
  return `
    <div class="start-loading-state" style="
      text-align: center;
      padding: 3rem 2rem;
      color: rgba(255,255,255,0.6);
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem; animation: pulse 2s ease-in-out infinite;">
        🧠
      </div>
      <h3 style="color: #00e0ff; margin-bottom: 0.5rem;">Analyzing Your Network</h3>
      <p style="margin-bottom: 1.5rem;">Finding the best opportunities across themes, projects, people, and organizations...</p>
      <div class="loading-dots" style="display: flex; justify-content: center; gap: 0.5rem;">
        <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both;"></div>
        <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.16s infinite both;"></div>
        <div style="width: 8px; height: 8px; background: #00e0ff; border-radius: 50%; animation: bounce 1.4s ease-in-out 0.32s infinite both;"></div>
      </div>
    </div>
  `;
}

/**
 * Create error state UI
 */
function createErrorState() {
  return `
    <div class="start-error-state" style="
      text-align: center;
      padding: 3rem 2rem;
      color: rgba(255,107,107,0.8);
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
      <h3 style="margin-bottom: 0.5rem;">Unable to Load Recommendations</h3>
      <p style="margin-bottom: 1.5rem;">We're having trouble analyzing your network right now.</p>
      <button onclick="populateRedesignedRecommendations()" style="
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: #000;
        padding: 0.75rem 1.5rem;
        font-weight: 600;
        cursor: pointer;
      ">
        Try Again
      </button>
    </div>
  `;
}

/**
 * Create the main recommendations UI
 */
function createRecommendationsUI(recommendations) {
  const primaryRec = recommendations.primary;
  
  return `
    <div class="redesigned-recommendations">
      <!-- Header -->
      <div class="recommendations-header" style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎯</div>
        <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.8rem;">Your Focus Today</h2>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 1rem;">
          Based on your activity, interests, and network momentum
        </p>
      </div>
      
      <!-- Primary Recommendation -->
      ${createPrimaryRecommendationCard(primaryRec)}
      
      <!-- Category Tabs -->
      <div class="recommendation-tabs" style="margin: 2rem 0 1rem 0;">
        <div class="tab-buttons" style="
          display: flex;
          gap: 0.5rem;
          background: rgba(0,0,0,0.3);
          border-radius: 12px;
          padding: 0.25rem;
          overflow-x: auto;
        ">
          ${createTabButton('all', 'All', 'compass', true)}
          ${createTabButton('themes', 'Themes', 'bullseye')}
          ${createTabButton('projects', 'Projects', 'lightbulb')}
          ${createTabButton('people', 'People', 'users')}
          ${createTabButton('organizations', 'Organizations', 'building')}
          ${createTabButton('opportunities', 'Opportunities', 'briefcase')}
        </div>
      </div>
      
      <!-- Recommendation Content -->
      <div class="recommendation-content">
        ${createAllRecommendationsTab(recommendations)}
        ${createCategoryTab('themes', recommendations.themes)}
        ${createCategoryTab('projects', recommendations.projects)}
        ${createCategoryTab('people', recommendations.people)}
        ${createCategoryTab('organizations', recommendations.organizations)}
        ${createCategoryTab('opportunities', recommendations.opportunities)}
      </div>
      
      <!-- Action Buttons -->
      <div class="start-actions" style="margin-top: 2rem; text-align: center;">
        <button class="explore-freely-btn" onclick="clearSessionFocus(); closeStartModal();" style="
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.7);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s;
        ">
          I'll explore freely today
        </button>
      </div>
    </div>
  `;
}

/**
 * Create primary recommendation card
 */
function createPrimaryRecommendationCard(recommendation) {
  if (!recommendation) {
    return '<div style="text-align: center; color: rgba(255,255,255,0.5);">No primary recommendation available</div>';
  }
  
  const colors = getTypeColors(recommendation.type);
  
  return `
    <div class="primary-recommendation" style="
      background: linear-gradient(135deg, ${colors.secondary}, rgba(0,0,0,0.2));
      border: 3px solid ${colors.primary};
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 30px ${colors.primary}40;
      animation: recommendedPulse 3s ease-in-out infinite;
    ">
      <!-- Recommended Badge -->
      <div style="
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: ${colors.primary};
        color: #000;
        padding: 0.4rem 1rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      ">
        Recommended
      </div>
      
      <!-- Content -->
      <div style="display: flex; align-items: start; gap: 1.5rem;">
        <div style="font-size: 3.5rem; color: ${colors.primary}; flex-shrink: 0;">
          <i class="fas fa-${recommendation.actionIcon}"></i>
        </div>
        <div style="flex: 1;">
          <h3 style="color: #fff; font-size: 1.5rem; margin: 0 0 0.5rem 0; font-weight: 700;">
            ${recommendation.title}
          </h3>
          <p style="color: rgba(255,255,255,0.8); margin: 0 0 1rem 0; line-height: 1.5;">
            ${recommendation.description || 'No description available'}
          </p>
          
          <!-- Reasons -->
          ${recommendation.reasons && recommendation.reasons.length > 0 ? `
            <div style="margin-bottom: 1.5rem;">
              <div style="color: ${colors.primary}; font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem;">
                Why this recommendation:
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${recommendation.reasons.slice(0, 3).map(reason => `
                  <span style="
                    background: rgba(0,0,0,0.4);
                    border: 1px solid ${colors.primary}40;
                    border-radius: 20px;
                    padding: 0.25rem 0.75rem;
                    font-size: 0.8rem;
                    color: rgba(255,255,255,0.9);
                  ">
                    ${reason}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- Action Button -->
          <button class="primary-action-btn" data-type="${recommendation.type}" data-id="${recommendation.id}" style="
            background: linear-gradient(135deg, ${colors.primary}, ${colors.primary}cc);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 15px ${colors.primary}40;
          ">
            🎯 ${recommendation.action}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Create tab button
 */
function createTabButton(id, label, icon, active = false) {
  return `
    <button class="tab-btn ${active ? 'active' : ''}" data-tab="${id}" style="
      background: ${active ? 'rgba(0,224,255,0.2)' : 'transparent'};
      border: ${active ? '1px solid rgba(0,224,255,0.4)' : '1px solid transparent'};
      color: ${active ? '#00e0ff' : 'rgba(255,255,255,0.7)'};
      padding: 0.75rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.2s;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    ">
      <i class="fas fa-${icon}"></i>
      <span>${label}</span>
    </button>
  `;
}

/**
 * Create "All" recommendations tab
 */
function createAllRecommendationsTab(recommendations) {
  // Combine top items from each category
  const allItems = [
    ...(recommendations.themes || []).slice(0, 2),
    ...(recommendations.projects || []).slice(0, 2),
    ...(recommendations.people || []).slice(0, 3),
    ...(recommendations.organizations || []).slice(0, 2),
    ...(recommendations.opportunities || []).slice(0, 2)
  ].sort((a, b) => b.score - a.score);
  
  return `
    <div class="tab-content active" data-tab-content="all">
      <div class="recommendations-grid" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      ">
        ${allItems.map(item => createRecommendationCard(item)).join('')}
      </div>
    </div>
  `;
}

/**
 * Create category-specific tab
 */
function createCategoryTab(category, items) {
  if (!items || items.length === 0) {
    return `
      <div class="tab-content" data-tab-content="${category}" style="display: none;">
        <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
          <div style="font-size: 2rem; margin-bottom: 1rem;">🔍</div>
          <p>No ${category} recommendations available right now.</p>
          <p style="font-size: 0.9rem;">Check back tomorrow for fresh suggestions!</p>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="tab-content" data-tab-content="${category}" style="display: none;">
      <div class="recommendations-grid" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      ">
        ${items.map(item => createRecommendationCard(item)).join('')}
      </div>
    </div>
  `;
}

/**
 * Create individual recommendation card
 */
function createRecommendationCard(item) {
  const colors = getTypeColors(item.type);
  
  return `
    <div class="recommendation-card" style="
      background: linear-gradient(135deg, ${colors.secondary}, rgba(0,0,0,0.1));
      border: 2px solid ${colors.primary}40;
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.3s ease;
      cursor: pointer;
      position: relative;
    " data-type="${item.type}" data-id="${item.id}">
      
      <!-- Type Badge -->
      <div style="
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: ${colors.primary}20;
        border: 1px solid ${colors.primary}60;
        border-radius: 12px;
        padding: 0.25rem 0.5rem;
        font-size: 0.7rem;
        color: ${colors.primary};
        text-transform: uppercase;
        font-weight: 600;
      ">
        ${item.type}
      </div>
      
      <!-- Content -->
      <div style="display: flex; align-items: start; gap: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 2rem; color: ${colors.primary}; flex-shrink: 0;">
          <i class="fas fa-${item.actionIcon}"></i>
        </div>
        <div style="flex: 1;">
          <h4 style="color: #fff; margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 600;">
            ${item.title}
          </h4>
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem; line-height: 1.4;">
            ${truncateText(item.description || 'No description available', 100)}
          </p>
        </div>
      </div>
      
      <!-- Score and Reasons -->
      <div style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: ${colors.primary}; font-size: 0.8rem; font-weight: 600;">
            Match Score: ${item.score}/100
          </span>
          <div style="
            width: 60px;
            height: 4px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            overflow: hidden;
          ">
            <div style="
              width: ${Math.min(item.score, 100)}%;
              height: 100%;
              background: ${colors.primary};
              transition: width 0.3s ease;
            "></div>
          </div>
        </div>
        
        ${item.reasons && item.reasons.length > 0 ? `
          <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
            ${item.reasons[0]}
          </div>
        ` : ''}
      </div>
      
      <!-- Action Button -->
      <button class="card-action-btn" data-type="${item.type}" data-id="${item.id}" style="
        width: 100%;
        background: linear-gradient(135deg, ${colors.primary}, ${colors.primary}cc);
        border: none;
        border-radius: 8px;
        color: #000;
        padding: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      ">
        ${item.action}
      </button>
    </div>
  `;
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

/**
 * Get colors for different recommendation types
 */
function getTypeColors(type) {
  const colors = {
    theme: { primary: '#00e0ff', secondary: 'rgba(0,224,255,0.15)' },
    project: { primary: '#00ff88', secondary: 'rgba(0,255,136,0.15)' },
    person: { primary: '#ffd700', secondary: 'rgba(255,215,0,0.15)' },
    organization: { primary: '#ff6b6b', secondary: 'rgba(255,107,107,0.15)' },
    opportunity: { primary: '#9b59b6', secondary: 'rgba(155,89,182,0.15)' }
  };
  
  return colors[type] || colors.theme;
}

/**
 * Truncate text to specified length
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// ================================================================
// EVENT HANDLERS
// ================================================================

/**
 * Wire up event handlers for recommendations
 */
function wireRecommendationHandlers(recommendations) {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.currentTarget.dataset.tab;
      switchTab(tabId);
    });
  });
  
  // Primary action button
  const primaryBtn = document.querySelector('.primary-action-btn');
  if (primaryBtn) {
    primaryBtn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.type;
      const id = e.currentTarget.dataset.id;
      handleRecommendationAction(type, id, recommendations);
    });
  }
  
  // Card action buttons
  document.querySelectorAll('.card-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = e.currentTarget.dataset.type;
      const id = e.currentTarget.dataset.id;
      handleRecommendationAction(type, id, recommendations);
    });
  });
  
  // Card hover effects
  document.querySelectorAll('.recommendation-card').forEach(card => {
    card.addEventListener('mouseenter', (e) => {
      const colors = getTypeColors(e.currentTarget.dataset.type);
      e.currentTarget.style.borderColor = colors.primary + '80';
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 8px 25px ${colors.primary}30`;
    });
    
    card.addEventListener('mouseleave', (e) => {
      const colors = getTypeColors(e.currentTarget.dataset.type);
      e.currentTarget.style.borderColor = colors.primary + '40';
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'none';
    });
  });
  
  // Explore freely button hover
  const exploreBtn = document.querySelector('.explore-freely-btn');
  if (exploreBtn) {
    exploreBtn.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)';
      e.currentTarget.style.color = 'rgba(255,255,255,1)';
    });
    
    exploreBtn.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
    });
  }
}

/**
 * Switch between recommendation tabs
 */
function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    
    if (isActive) {
      btn.style.background = 'rgba(0,224,255,0.2)';
      btn.style.borderColor = 'rgba(0,224,255,0.4)';
      btn.style.color = '#00e0ff';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.style.color = 'rgba(255,255,255,0.7)';
    }
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    const isActive = content.dataset.tabContent === tabId;
    content.style.display = isActive ? 'block' : 'none';
    content.classList.toggle('active', isActive);
  });
}

/**
 * Handle recommendation action clicks
 */
function handleRecommendationAction(type, id, recommendations) {
  console.log('🎯 Recommendation action:', type, id);
  
  // Find the recommendation data
  let recommendation = null;
  
  if (recommendations.primary && recommendations.primary.id === id) {
    recommendation = recommendations.primary;
  } else {
    // Search in category arrays
    const categories = ['themes', 'projects', 'people', 'organizations', 'opportunities'];
    for (const category of categories) {
      if (recommendations[category]) {
        recommendation = recommendations[category].find(item => item.id === id);
        if (recommendation) break;
      }
    }
  }
  
  if (!recommendation) {
    console.error('Recommendation not found:', type, id);
    return;
  }
  
  // Set session focus
  if (window.setSessionFocus) {
    window.setSessionFocus(type, recommendation.data);
  }
  
  // Track action
  if (window.trackAction) {
    window.trackAction(type);
  }
  
  // Close modal
  closeStartModal();
  
  // Show success message
  showActionSuccess(type, recommendation.title);
  
  // Navigate to appropriate view
  navigateToRecommendation(type, recommendation);
}

/**
 * Show success message after action
 */
function showActionSuccess(type, title) {
  const messages = {
    theme: `🎯 Focus set on "${title}". Network adjusted to show relevant connections.`,
    project: `🚀 Project mode active. Highlighting "${title}" and similar opportunities.`,
    person: `👥 Connect mode active. "${title}" and similar people highlighted.`,
    organization: `🏢 Following "${title}". You'll see their updates and opportunities.`,
    opportunity: `💼 Viewing "${title}". Application details loaded.`
  };
  
  const message = messages[type] || `✅ Action completed for "${title}"`;
  
  if (window.showToastNotification) {
    window.showToastNotification(message, 'success');
  }
}

/**
 * Navigate to the appropriate view for the recommendation
 */
/**
 * Navigate to the appropriate view with synapse integration
 */
function navigateToRecommendation(type, recommendation) {
  console.log('🌐 Navigating with synapse integration:', type, recommendation.title);
  
  // Ensure main content is visible first
  const mainContent = document.getElementById('main-content');
  if (mainContent && mainContent.classList.contains('hidden')) {
    console.log('📱 Main content hidden - showing it first');
    mainContent.classList.remove('hidden');
    
    // Wait a moment for the content to become visible
    setTimeout(() => {
      continueNavigation(type, recommendation);
    }, 500);
  } else {
    continueNavigation(type, recommendation);
  }
}

/**
 * Continue navigation after ensuring content is visible
 */
function continueNavigation(type, recommendation) {
  // For theme recommendations, we want to show the circles view for better interaction
  const synapseMode = (type === 'theme') ? 'circles' : getSynapseModeForType(type);
  
  console.log(`🎯 Navigating to ${type} recommendation in ${synapseMode} mode`);
  
  // Switch to synapse view
  switchToSynapseView(synapseMode);
  
  // Wait for the view to switch, then highlight and show guidance
  setTimeout(() => {
    // Only try to highlight if synapse is ready
    if (window.isSynapseReady && window.isSynapseReady()) {
      highlightRecommendationInSynapse(type, recommendation);
      showSynapseGuidanceOverlay(type, recommendation);
    } else {
      console.log('🔄 Synapse not ready - showing guidance without highlighting');
      showSynapseGuidanceOverlay(type, recommendation);
    }
  }, 2000); // Longer delay to allow for strategy switching
  
  // Legacy navigation as fallback
  switch (type) {
    case 'theme':
      if (window.openThemeCard) {
        setTimeout(() => window.openThemeCard(recommendation.data), 1500);
      }
      break;
      
    case 'project':
      if (window.openProjectsModal) {
        setTimeout(() => window.openProjectsModal(), 1500);
      }
      break;
      
    case 'person':
      if (window.openQuickConnectModal) {
        setTimeout(() => window.openQuickConnectModal(), 1500);
      }
      break;
      
    case 'organization':
      console.log('🏢 Navigate to organization:', recommendation.data);
      break;
      
    case 'opportunity':
      console.log('💼 Navigate to opportunity:', recommendation.data);
      break;
  }
}

/**
 * Get the appropriate synapse mode for a recommendation type
 */
function getSynapseModeForType(type) {
  const modeMap = {
    'theme': 'circles',
    'project': 'circles', // Projects are shown within theme circles
    'person': 'network',
    'organization': 'network',
    'opportunity': 'circles'
  };
  
  return modeMap[type] || 'circles';
}

/**
 * Switch to synapse view programmatically
 */
function switchToSynapseView(mode = 'circles') {
  console.log('🌐 Switching to synapse view:', mode);
  
  // Ensure main content is visible
  const mainContent = document.getElementById('main-content');
  if (mainContent && mainContent.classList.contains('hidden')) {
    mainContent.classList.remove('hidden');
  }
  
  // For circles mode, we need to switch to the old SVG strategy
  if (mode === 'circles') {
    console.log('🎯 Switching to SVG circles strategy for network view');
    
    // Check if we need to switch from cards to circles strategy
    if (window.toggleThemeStrategy && typeof window.toggleThemeStrategy === 'function') {
      // Check current strategy - if it's 'new' (cards), switch to 'old' (circles)
      const currentStrategy = window.currentStrategy || 'new';
      if (currentStrategy === 'new') {
        console.log('🔄 Switching from cards to circles strategy');
        window.toggleThemeStrategy();
        return; // toggleThemeStrategy will handle the switch
      }
    }
    
    // If already in circles mode or no toggle available, ensure synapse is visible
    const synapseContainer = document.getElementById('synapse-main-view');
    if (synapseContainer) {
      synapseContainer.style.display = 'block';
    }
    
    // Hide theme cards if showing
    const themeCardsContainer = document.querySelector('.theme-cards-container');
    if (themeCardsContainer) {
      themeCardsContainer.style.display = 'none';
    }
    
  } else if (mode === 'network') {
    // For network mode, we can use the new cards system
    console.log('👥 Switching to network view in cards system');
    
    if (window.toggleThemeDisplayMode) {
      window.toggleThemeDisplayMode('hybrid'); // Show both network and themes
    }
  }
  
  // Update UI state
  updateSynapseViewButtons(mode);
}

/**
 * Update synapse view toggle buttons
 */
function updateSynapseViewButtons(mode) {
  // Update "Switch to Circles" button if it exists
  const switchButton = document.querySelector('[onclick*="switchToCirclesMode"]');
  if (switchButton) {
    if (mode === 'circles') {
      switchButton.textContent = '🌐 Switch to Network';
      switchButton.onclick = () => switchToSynapseView('network');
    } else {
      switchButton.textContent = '🎯 Switch to Circles';
      switchButton.onclick = () => switchToSynapseView('circles');
    }
  }
}

/**
 * Highlight a specific recommendation in the synapse view
 */
function highlightRecommendationInSynapse(type, recommendation) {
  console.log('✨ Highlighting recommendation in synapse:', recommendation.title);
  
  // Find the node in the synapse
  const nodeId = recommendation.id;
  
  // Try different selectors based on type
  const selectors = [
    `[data-id="${nodeId}"]`,
    `[data-theme-id="${nodeId}"]`,
    `[data-project-id="${nodeId}"]`,
    `.theme-card[data-id="${nodeId}"]`,
    `.node[data-id="${nodeId}"]`
  ];
  
  let targetElement = null;
  for (const selector of selectors) {
    targetElement = document.querySelector(selector);
    if (targetElement) break;
  }
  
  if (targetElement) {
    // Add highlight effect
    targetElement.style.boxShadow = '0 0 30px rgba(0,224,255,0.8)';
    targetElement.style.transform = 'scale(1.05)';
    targetElement.style.zIndex = '1000';
    
    // Scroll into view
    targetElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
    
    // Remove highlight after a few seconds
    setTimeout(() => {
      targetElement.style.boxShadow = '';
      targetElement.style.transform = '';
      targetElement.style.zIndex = '';
    }, 5000);
    
    console.log('✅ Recommendation highlighted in synapse');
  } else {
    console.warn('⚠️ Could not find recommendation in synapse view');
  }
}

/**
 * Show contextual guidance overlay in synapse view
 */
function showSynapseGuidanceOverlay(type, recommendation) {
  console.log('🧭 Showing synapse guidance overlay');
  
  // Create guidance overlay
  const overlay = document.createElement('div');
  overlay.id = 'synapse-guidance-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,128,255,0.95));
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 350px;
    color: #000;
    font-weight: 600;
    z-index: 10001;
    box-shadow: 0 8px 25px rgba(0,224,255,0.3);
    animation: slideInRight 0.5s ease-out;
  `;
  
  const messages = {
    theme: `🎯 Perfect! You're now focused on "${recommendation.title}". The circles view shows all related projects, people, and connections. Click on any theme circle or connected node to explore further.`,
    project: `🚀 Great choice! "${recommendation.title}" is highlighted. You can see team members, related themes, and potential collaborators in the circles network view.`,
    person: `👥 Excellent! "${recommendation.title}" is highlighted. Explore their connections and shared interests in the network circles to find collaboration opportunities.`,
    organization: `🏢 Smart move! "${recommendation.title}" is now in focus. See their opportunities, sponsored themes, and network connections in the circles view.`,
    opportunity: `💼 Perfect timing! "${recommendation.title}" is highlighted. Explore the organization and related themes in the circles view to understand the full context.`
  };
  
  overlay.innerHTML = `
    <div style="display: flex; align-items: start; gap: 1rem;">
      <div style="font-size: 2rem;">🧭</div>
      <div style="flex: 1;">
        <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">Your Next Steps</h3>
        <p style="margin: 0 0 1rem 0; line-height: 1.4; font-size: 0.9rem;">
          ${messages[type] || 'Explore the network to discover connections and opportunities.'}
        </p>
        <button onclick="this.closest('#synapse-guidance-overlay').remove()" style="
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(0,0,0,0.3);
          border-radius: 6px;
          color: #000;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.8rem;
        ">
          Got it!
        </button>
      </div>
    </div>
  `;
  
  // Add CSS animation
  if (!document.getElementById('synapse-guidance-styles')) {
    const style = document.createElement('style');
    style.id = 'synapse-guidance-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove any existing overlay
  const existing = document.getElementById('synapse-guidance-overlay');
  if (existing) existing.remove();
  
  // Add to page
  document.body.appendChild(overlay);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 10000);
}

// ================================================================
// CSS ANIMATIONS
// ================================================================

// Add CSS animations if not already present
if (!document.getElementById('start-redesigned-styles')) {
  const style = document.createElement('style');
  style.id = 'start-redesigned-styles';
  style.textContent = `
    @keyframes recommendedPulse {
      0%, 100% { 
        box-shadow: 0 0 30px rgba(0,224,255,0.25);
      }
      50% { 
        box-shadow: 0 0 40px rgba(0,224,255,0.4);
      }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-10px); }
    }
    
    .recommendation-card {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .recommendation-card:hover {
      transform: translateY(-4px);
    }
    
    .card-action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    
    .primary-action-btn:hover {
      transform: translateY(-2px) scale(1.02);
    }
    
    .tab-btn:hover {
      background: rgba(0,224,255,0.1) !important;
      border-color: rgba(0,224,255,0.3) !important;
    }
    
    .recommendations-grid {
      animation: fadeInUp 0.5s ease-out;
    }
    
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

// ================================================================
// EXPORT FUNCTIONS
// ================================================================

window.openRedesignedStartModal = openRedesignedStartModal;
window.populateRedesignedRecommendations = populateRedesignedRecommendations;
window.switchTab = switchTab;
window.handleRecommendationAction = handleRecommendationAction;
window.switchToSynapseView = switchToSynapseView;
window.highlightRecommendationInSynapse = highlightRecommendationInSynapse;
window.showSynapseGuidanceOverlay = showSynapseGuidanceOverlay;
window.continueNavigation = continueNavigation;

console.log('✅ START Flow UI Redesigned ready');