// ================================================================
// START Flow - Enhanced with Recommendation Engine
// ================================================================
// Implements the redesigned START sequence:
// 1. Calculate and recommend best starting point
// 2. Preview concrete outcomes
// 3. Animate network to explain choice
// ================================================================

console.log("%c🚀 START Flow Enhanced Loading", "color:#0f8; font-weight:bold;");

// ================================================================
// RECOMMENDATION ENGINE
// ================================================================

/**
 * Calculate the recommended focus for the user
 * Returns scored options with the best one highlighted
 */
async function calculateRecommendedFocus(supabase, currentUser) {
  console.log('🎯 Calculating recommended focus...');

  const options = [];

  try {
    // Load all data in parallel
    const [themesData, projectsData, peopleData, activityData] = await Promise.all([
      loadThemesWithScore(supabase, currentUser),
      loadProjectsWithScore(supabase, currentUser),
      loadPeopleWithScore(supabase, currentUser),
      loadRecentActivity(supabase, currentUser)
    ]);

    // Score each option type
    const themeScore = calculateThemeScore(themesData, activityData, currentUser);
    const projectScore = calculateProjectScore(projectsData, activityData, currentUser);
    const peopleScore = calculatePeopleScore(peopleData, activityData, currentUser);

    options.push({
      type: 'focus',
      title: 'Start with this focus',
      score: themeScore.score,
      data: themeScore,
      icon: 'compass',
      color: '#00e0ff'
    });

    options.push({
      type: 'projects',
      title: 'See active projects',
      score: projectScore.score,
      data: projectScore,
      icon: 'rocket',
      color: '#ff6b6b'
    });

    options.push({
      type: 'people',
      title: 'Meet people nearby',
      score: peopleScore.score,
      data: peopleScore,
      icon: 'users',
      color: '#ffd700'
    });

    // Sort by score (highest first)
    options.sort((a, b) => b.score - a.score);

    console.log('✅ Recommendation calculated:', {
      winner: options[0].type,
      scores: options.map(o => ({ type: o.type, score: o.score }))
    });

    return options;

  } catch (error) {
    console.error('❌ Error calculating recommendation:', error);
    return options;
  }
}

// ================================================================
// SCORING FUNCTIONS
// ================================================================

function calculateThemeScore(themesData, activityData, currentUser) {
  let score = 50; // Base score

  const { themes, userThemes } = themesData;
  const activeThemes = themes.filter(t => !userThemes.includes(t.id));

  if (activeThemes.length === 0) {
    return { score: 0, themes: [], preview: null };
  }

  // Find best matching theme
  const bestTheme = activeThemes[0]; // Already sorted by activity_score

  // Boost score based on:
  // - Recent theme interactions
  if (activityData.recentThemeViews > 0) score += 20;
  // - Theme momentum
  if (bestTheme.activity_score > 10) score += 15;
  // - User has projects in theme
  const userProjectsInTheme = activityData.userProjects.filter(p => p.theme_id === bestTheme.id);
  if (userProjectsInTheme.length > 0) score += 25;

  // Generate preview
  const preview = {
    title: bestTheme.title,
    activeProjects: themes.reduce((sum, t) => sum + (t.project_count || 0), 0),
    relevantPeople: Math.min(themes.reduce((sum, t) => sum + (t.participant_count || 0), 0), 10),
    openCollaborations: Math.floor(Math.random() * 3) + 1, // TODO: Calculate from actual data
    signal: score > 70 ? 'strongest' : score > 50 ? 'strong' : 'moderate'
  };

  return {
    score,
    themes: activeThemes.slice(0, 3),
    preview,
    bestTheme
  };
}

function calculateProjectScore(projectsData, activityData, currentUser) {
  let score = 40; // Base score

  const { projects, userProjects } = projectsData;
  const availableProjects = projects.filter(p => !userProjects.includes(p.id));

  if (availableProjects.length === 0) {
    return { score: 0, projects: [], preview: null };
  }

  // Boost score based on:
  // - Recent project activity
  if (activityData.recentProjectViews > 0) score += 25;
  // - User is creator of projects (likely to create more)
  const createdProjects = activityData.userProjects.filter(p => p.creator_id === currentUser.id);
  if (createdProjects.length > 0) score += 15;
  // - Many active projects available
  if (availableProjects.length > 5) score += 10;

  const preview = {
    activeCount: availableProjects.length,
    needingHelp: Math.floor(availableProjects.length * 0.6),
    matchingSkills: Math.min(availableProjects.length, 3)
  };

  return {
    score,
    projects: availableProjects.slice(0, 5),
    preview
  };
}

function calculatePeopleScore(peopleData, activityData, currentUser) {
  let score = 30; // Base score

  const { people, connections } = peopleData;

  if (people.length === 0) {
    return { score: 0, people: [], preview: null };
  }

  // Boost score based on:
  // - Recent connection activity
  if (activityData.recentConnections > 0) score += 20;
  // - Few existing connections (needs to build network)
  if (connections.length < 5) score += 25;
  // - Many relevant people available
  if (people.length > 10) score += 15;

  const preview = {
    relevantCount: people.length,
    sharedInterests: Math.min(people.length, 5),
    newConnections: Math.min(people.length, 3)
  };

  return {
    score,
    people: people.slice(0, 5),
    preview
  };
}

// ================================================================
// DATA LOADERS
// ================================================================

async function loadThemesWithScore(supabase, currentUser) {
  const { data: themes } = await supabase
    .from('theme_circles')
    .select('*, project_count:projects(count), participant_count:theme_participants(count)')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('activity_score', { ascending: false })
    .limit(10);

  const { data: userThemes } = await supabase
    .from('theme_participants')
    .select('theme_id')
    .eq('community_id', currentUser.id);

  return {
    themes: themes || [],
    userThemes: (userThemes || []).map(t => t.theme_id)
  };
}

async function loadProjectsWithScore(supabase, currentUser) {
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .in('status', ['open', 'active', 'in-progress'])
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: userProjects } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', currentUser.id);

  return {
    projects: projects || [],
    userProjects: (userProjects || []).map(p => p.project_id)
  };
}

async function loadPeopleWithScore(supabase, currentUser) {
  const { data: people } = await supabase
    .from('community')
    .select('id, name, email, image_url, skills, interests, bio')
    .neq('id', currentUser.id)
    .limit(20);

  const { data: connections } = await supabase
    .from('connections')
    .select('from_user_id, to_user_id, status')
    .or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`)
    .eq('status', 'accepted');

  const connectedIds = new Set();
  (connections || []).forEach(conn => {
    if (conn.from_user_id === currentUser.id) connectedIds.add(conn.to_user_id);
    if (conn.to_user_id === currentUser.id) connectedIds.add(conn.from_user_id);
  });

  return {
    people: (people || []).filter(p => !connectedIds.has(p.id)),
    connections: connections || []
  };
}

async function loadRecentActivity(supabase, currentUser) {
  // TODO: Implement activity tracking
  // For now, return mock data
  return {
    recentThemeViews: 0,
    recentProjectViews: 0,
    recentConnections: 0,
    userProjects: []
  };
}

// ================================================================
// PREVIEW GENERATION
// ================================================================

function generatePreviewHTML(option) {
  if (!option.data.preview) return '';

  const { preview } = option.data;

  if (option.type === 'focus') {
    return `
      <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
        <div style="color: #00e0ff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.75rem;">
          ${preview.title}
        </div>
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; color: rgba(255,255,255,0.8); font-size: 0.9rem;">
          <div><strong>${preview.activeProjects}</strong> active projects</div>
          <div><strong>${preview.relevantPeople}</strong> relevant people</div>
          <div><strong>${preview.openCollaborations}</strong> open collaboration${preview.openCollaborations > 1 ? 's' : ''}</div>
        </div>
        <div style="margin-top: 0.75rem; color: #00ff88; font-size: 0.85rem; font-style: italic;">
          "This is where your signal is ${preview.signal} right now."
        </div>
      </div>
    `;
  } else if (option.type === 'projects') {
    return `
      <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; color: rgba(255,255,255,0.8); font-size: 0.9rem;">
          <div><strong>${preview.activeCount}</strong> active projects</div>
          <div><strong>${preview.needingHelp}</strong> needing help</div>
          <div><strong>${preview.matchingSkills}</strong> match your skills</div>
        </div>
      </div>
    `;
  } else if (option.type === 'people') {
    return `
      <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; color: rgba(255,255,255,0.8); font-size: 0.9rem;">
          <div><strong>${preview.relevantCount}</strong> relevant people</div>
          <div><strong>${preview.sharedInterests}</strong> shared interests</div>
          <div><strong>${preview.newConnections}</strong> potential connections</div>
        </div>
      </div>
    `;
  }

  return '';
}

// ================================================================
// NETWORK ANIMATION
// ================================================================

/**
 * Check if synapse is ready for animation
 */
function isSynapseReady() {
  // Check D3 library
  if (!window.d3) {
    console.warn('⚠️ D3 library not loaded');
    return false;
  }

  // Check SVG element
  const synapseElement = document.getElementById('synapse-svg');
  if (!synapseElement) {
    console.warn('⚠️ Synapse SVG element not found');
    return false;
  }

  // Check if parent container is visible
  const mainContent = document.getElementById('main-content');
  if (mainContent && mainContent.classList.contains('hidden')) {
    console.warn('⚠️ Main content is hidden - synapse not visible');
    return false;
  }

  // Check if synapse has been initialized with nodes
  const svg = window.d3.select('#synapse-svg');
  const nodeCount = svg.selectAll('.synapse-node, .theme-container').size();
  if (nodeCount === 0) {
    console.warn('⚠️ Synapse network not initialized yet (no nodes found)');
    return false;
  }

  return true;
}

function animateNetworkForChoice(choiceType, choiceData) {
  console.log('🎨 Animating network for choice:', choiceType, choiceData);

  if (!isSynapseReady()) {
    console.warn('⚠️ Synapse not ready for animation - will try again when network is loaded');
    
    // Try again after a short delay if synapse might be loading
    setTimeout(() => {
      if (isSynapseReady()) {
        console.log('🔄 Synapse now ready - retrying animation');
        animateNetworkForChoice(choiceType, choiceData);
      }
    }, 2000);
    
    return;
  }

  const svg = window.d3.select('#synapse-svg');

  // Dim all nodes initially
  svg.selectAll('.synapse-node, .theme-container')
    .transition()
    .duration(600)
    .style('opacity', 0.3);

  // Highlight relevant nodes based on choice
  if (choiceType === 'focus' && choiceData.bestTheme) {
    // Highlight the recommended theme
    svg.selectAll(`.theme-${choiceData.bestTheme.id}`)
      .transition()
      .duration(600)
      .style('opacity', 1);

    // Show overlay message
    showNetworkOverlay("We're bringing the most relevant people and projects closer.");
  } else if (choiceType === 'projects') {
    // Highlight project nodes
    svg.selectAll('.synapse-node[data-type="project"]')
      .transition()
      .duration(600)
      .style('opacity', 1);

    showNetworkOverlay("Focusing on active projects that need your skills.");
  } else if (choiceType === 'people' && choiceData.people) {
    // Highlight SPECIFIC recommended people
    const recommendedIds = choiceData.people.map(p => p.id);
    console.log('👥 Highlighting recommended people:', recommendedIds);

    // Highlight each recommended person
    recommendedIds.forEach(personId => {
      svg.selectAll(`.synapse-node[data-id="${personId}"]`)
        .transition()
        .duration(600)
        .style('opacity', 1)
        .style('filter', 'drop-shadow(0 0 10px #ffd700)');
    });

    // Also use pathway animations if available
    if (typeof window.showConnectPathways === 'function') {
      recommendedIds.forEach((personId, index) => {
        setTimeout(() => {
          window.showConnectPathways(null, personId, {
            color: '#ffd700',
            duration: 2000,
            label: 'Recommended'
          });
        }, index * 300);
      });
    }

    showNetworkOverlay(`Highlighting ${recommendedIds.length} people you should connect with.`);
  }

  // Reset after 5 seconds (longer to see the highlights)
  setTimeout(() => {
    svg.selectAll('.synapse-node, .theme-container')
      .transition()
      .duration(600)
      .style('opacity', 1)
      .style('filter', 'none');
  }, 5000);
}

function showNetworkOverlay(message) {
  const existing = document.getElementById('network-overlay-message');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'network-overlay-message';
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.9);
    border: 2px solid rgba(0,224,255,0.5);
    border-radius: 12px;
    padding: 1.5rem 2rem;
    color: #00e0ff;
    font-size: 1.1rem;
    font-weight: 600;
    z-index: 9999;
    pointer-events: none;
    animation: fadeInOut 3s ease-in-out;
  `;
  overlay.textContent = message;

  document.body.appendChild(overlay);

  setTimeout(() => overlay.remove(), 3000);
}

// Add CSS animation
if (!document.getElementById('network-overlay-animation')) {
  const style = document.createElement('style');
  style.id = 'network-overlay-animation';
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, -45%); }
      20% { opacity: 1; transform: translate(-50%, -50%); }
      80% { opacity: 1; transform: translate(-50%, -50%); }
      100% { opacity: 0; transform: translate(-50%, -55%); }
    }
  `;
  document.head.appendChild(style);
}

// ================================================================
// EXPORT FUNCTIONS
// ================================================================

window.calculateRecommendedFocus = calculateRecommendedFocus;
window.generatePreviewHTML = generatePreviewHTML;
window.animateNetworkForChoice = animateNetworkForChoice;
window.isSynapseReady = isSynapseReady;

console.log('✅ START Flow Enhanced ready');
