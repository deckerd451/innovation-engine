// ================================================================
// Synapse Quiet Mode v1
// ================================================================
// Radical simplification: Show only what matters for connection-making
// Default mode - overrides all other visualization modes
// ================================================================

/* ==========================================================================
   CONFIGURATION
   ========================================================================== */

const QUIET_MODE_CONFIG = {
  enabled: true, // Feature flag - default ON
  
  // Node limits
  maxVisibleNodes: 12,
  showOnlyFirstDegree: true,
  
  // Visual rules
  nodeScale: {
    user: 1.0,
    connection: 0.8,
    focused: 1.1
  },
  
  colors: {
    user: '#00e0ff',
    connection: '#8899aa',
    focused: '#00e0ff',
    line: 'rgba(136, 153, 170, 0.3)'
  },
  
  // Motion
  allowedMotion: ['focus', 'search', 'cta'],
  transitionDuration: 200,
  
  // Touch
  minTouchTarget: 44,
  
  // Performance
  targetFPS: 60,
  maxActiveAnimations: 1
};

let state = {
  focusedNode: null,
  searchQuery: '',
  activeCTA: null,
  visibleNodes: new Set(),
  relevanceScores: new Map()
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

export function initQuietMode(synapseCore) {
  if (!QUIET_MODE_CONFIG.enabled) {
    console.log('🔇 Quiet Mode disabled');
    return;
  }
  
  console.log('🔇 Initializing Quiet Mode v1 (Default Experience)');
  
  // Override any other modes
  disableOtherModes();
  
  // Apply quiet mode rendering
  applyQuietMode(synapseCore);
  
  // Setup interactions
  setupQuietInteractions(synapseCore);
  
  // Setup search
  setupQuietSearch(synapseCore);
  
  // Hide forbidden UI elements
  hideForbiddenUI();
  
  console.log('✅ Quiet Mode active - calm, focused experience');
}

/* ==========================================================================
   MODE OVERRIDE
   ========================================================================== */

function disableOtherModes() {
  // Disable Progressive Disclosure modes
  if (window.ProgressiveDisclosure) {
    console.log('🔇 Quiet Mode overriding Progressive Disclosure');
  }
  
  // Disable any other visualization modes
  if (window.synapseShowFullCommunity !== undefined) {
    window.synapseShowFullCommunity = false;
  }
}

/* ==========================================================================
   INITIAL RENDER
   ========================================================================== */

export function applyQuietMode(synapseCore) {
  const { nodes, links, nodeEls, linkEls, currentUserCommunityId } = synapseCore;
  
  if (!nodeEls) {
    console.warn('🔇 No nodes to apply Quiet Mode to');
    return;
  }
  
  // Find current user
  const currentUser = nodes.find(n => n.id === currentUserCommunityId || n.isCurrentUser);
  if (!currentUser) {
    console.warn('🔇 Current user not found');
    return;
  }
  
  // Calculate relevance scores for connections
  calculateRelevanceScores(nodes, links, currentUser);
  
  // Get first-degree connections (max 12, sorted by relevance)
  const visibleConnections = getVisibleConnections(nodes, links, currentUser);
  
  // Update visible nodes set
  state.visibleNodes.clear();
  state.visibleNodes.add(currentUser.id);
  visibleConnections.forEach(n => state.visibleNodes.add(n.id));
  
  console.log(`🔇 Showing ${state.visibleNodes.size} nodes (1 user + ${visibleConnections.length} connections)`);
  
  // Apply visual rules
  applyQuietVisuals(nodeEls, linkEls, currentUser, visibleConnections);
}

function calculateRelevanceScores(nodes, links, currentUser) {
  // Score based on:
  // 1. Recent activity
  // 2. Mutual connections
  // 3. Shared interests/skills
  // 4. Connection strength
  
  nodes.forEach(node => {
    if (node.id === currentUser.id) return;
    
    let score = 0;
    
    // Recent activity (if available)
    if (node.last_activity_date) {
      const daysSince = (Date.now() - new Date(node.last_activity_date)) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 100 - daysSince);
    }
    
    // Connection count (more connected = more relevant)
    score += (node.connection_count || 0) * 2;
    
    // Shared skills/interests (if available)
    if (currentUser.skills && node.skills) {
      const userSkills = new Set(currentUser.skills);
      const sharedSkills = node.skills.filter(s => userSkills.has(s)).length;
      score += sharedSkills * 10;
    }
    
    state.relevanceScores.set(node.id, score);
  });
}

function getVisibleConnections(nodes, links, currentUser) {
  // Get first-degree connections
  const connectedIds = new Set();
  
  links.forEach(link => {
    if (link.source.id === currentUser.id) {
      connectedIds.add(link.target.id);
    } else if (link.target.id === currentUser.id) {
      connectedIds.add(link.source.id);
    }
  });
  
  // Filter to connected nodes only
  const connections = nodes.filter(n => connectedIds.has(n.id));
  
  // Sort by relevance score
  connections.sort((a, b) => {
    const scoreA = state.relevanceScores.get(a.id) || 0;
    const scoreB = state.relevanceScores.get(b.id) || 0;
    return scoreB - scoreA;
  });
  
  // Take top 12
  return connections.slice(0, QUIET_MODE_CONFIG.maxVisibleNodes - 1);
}

/* ==========================================================================
   VISUAL RULES
   ========================================================================== */

function applyQuietVisuals(nodeEls, linkEls, currentUser, visibleConnections) {
  const visibleIds = new Set([currentUser.id, ...visibleConnections.map(n => n.id)]);
  
  // Apply to nodes
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    const isVisible = visibleIds.has(d.id);
    const isUser = d.id === currentUser.id;
    
    if (!isVisible) {
      // Hide completely
      node.style('display', 'none');
      return;
    }
    
    node.style('display', 'block');
    
    // Remove forbidden elements
    node.selectAll('.theme-ring, .node-badge, .node-icon, .xp-badge, .streak-badge, .project-glow-bg').remove();
    
    // Apply quiet styling to circle
    const circle = node.select('circle.node-circle');
    circle
      .attr('r', (d.radius || 20) * (isUser ? QUIET_MODE_CONFIG.nodeScale.user : QUIET_MODE_CONFIG.nodeScale.connection))
      .attr('fill', isUser ? QUIET_MODE_CONFIG.colors.user : QUIET_MODE_CONFIG.colors.connection)
      .attr('stroke', isUser ? '#fff' : QUIET_MODE_CONFIG.colors.connection)
      .attr('stroke-width', isUser ? 3 : 1.5)
      .style('filter', isUser ? 'drop-shadow(0 0 8px rgba(0, 224, 255, 0.4))' : 'none')
      .style('animation', 'none')
      .style('opacity', 1);
    
    // Remove outer rings
    node.selectAll('.user-outer-ring, .connection-indicator-ring, .org-outer-ring').remove();
    
    // Labels: only user visible
    const label = node.select('text');
    if (isUser) {
      label
        .attr('opacity', 1)
        .attr('fill', '#fff')
        .attr('font-weight', 'bold')
        .attr('font-size', '14px');
    } else {
      label.attr('opacity', 0);
    }
    
    // Ensure minimum touch target
    const hitArea = node.select('.touch-hit-area');
    if (hitArea.empty()) {
      node.insert('circle', ':first-child')
        .attr('class', 'touch-hit-area')
        .attr('r', QUIET_MODE_CONFIG.minTouchTarget / 2)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all');
    }
  });
  
  // Apply to links
  if (linkEls) {
    linkEls.each(function(d) {
      const link = window.d3.select(this);
      const isVisible = visibleIds.has(d.source.id) && visibleIds.has(d.target.id);
      
      if (!isVisible) {
        link.style('display', 'none');
        return;
      }
      
      link
        .style('display', 'block')
        .attr('stroke', QUIET_MODE_CONFIG.colors.line)
        .attr('stroke-width', 1)
        .attr('opacity', 0.3)
        .style('animation', 'none')
        .attr('marker-end', 'none'); // No arrows
    });
  }
}

/* ==========================================================================
   INTERACTIONS
   ========================================================================== */

function setupQuietInteractions(synapseCore) {
  const { nodeEls, svg } = synapseCore;
  
  if (!nodeEls) return;
  
  // Tap node → focus
  nodeEls.on('click', function(event, d) {
    event.stopPropagation();
    
    if (!state.visibleNodes.has(d.id)) return;
    if (d.id === synapseCore.currentUserCommunityId) return; // Don't focus user node
    
    enterFocusState(d, this, synapseCore);
  });
  
  // Tap background → unfocus
  if (svg) {
    svg.on('click.quiet', () => {
      exitFocusState(synapseCore);
    });
  }
}

function enterFocusState(nodeData, nodeElement, synapseCore) {
  console.log('🔇 Focus:', nodeData.name);
  
  state.focusedNode = nodeData.id;
  
  const node = window.d3.select(nodeElement);
  const { nodeEls, linkEls } = synapseCore;
  
  // Enlarge focused node slightly
  node.select('circle.node-circle')
    .transition()
    .duration(QUIET_MODE_CONFIG.transitionDuration)
    .attr('r', (nodeData.radius || 20) * QUIET_MODE_CONFIG.nodeScale.focused)
    .attr('fill', QUIET_MODE_CONFIG.colors.focused)
    .style('filter', 'drop-shadow(0 0 12px rgba(0, 224, 255, 0.6))');
  
  // Show focused node label
  node.select('text')
    .transition()
    .duration(QUIET_MODE_CONFIG.transitionDuration)
    .attr('opacity', 1)
    .attr('fill', '#fff');
  
  // Fade other nodes
  nodeEls.each(function(d) {
    if (d.id === nodeData.id || d.id === synapseCore.currentUserCommunityId) return;
    
    window.d3.select(this)
      .transition()
      .duration(QUIET_MODE_CONFIG.transitionDuration)
      .style('opacity', 0.2);
  });
  
  // Highlight connection to focused node
  if (linkEls) {
    linkEls.each(function(d) {
      const isConnected = (d.source.id === nodeData.id || d.target.id === nodeData.id) &&
                         (d.source.id === synapseCore.currentUserCommunityId || d.target.id === synapseCore.currentUserCommunityId);
      
      window.d3.select(this)
        .transition()
        .duration(QUIET_MODE_CONFIG.transitionDuration)
        .attr('opacity', isConnected ? 0.8 : 0.1)
        .attr('stroke-width', isConnected ? 2 : 1);
    });
  }
  
  // Show CTA
  showCTA(nodeData, nodeElement);
}

function exitFocusState(synapseCore) {
  if (!state.focusedNode) return;
  
  console.log('🔇 Unfocus');
  
  state.focusedNode = null;
  
  // Reset all nodes
  applyQuietMode(synapseCore);
  
  // Hide CTA
  hideCTA();
}

/* ==========================================================================
   CTA (Call To Action)
   ========================================================================== */

function showCTA(nodeData, nodeElement) {
  // CTA disabled - messaging is available in the sidebar panel
  return;
  
  // Remove any existing CTA
  hideCTA();
  
  const node = window.d3.select(nodeElement);
  const nodeBox = nodeElement.getBoundingClientRect();
  
  // Create CTA
  const cta = document.createElement('div');
  cta.id = 'quiet-mode-cta';
  cta.className = 'quiet-cta';
  cta.innerHTML = `
    <button class="quiet-cta-button">
      <i class="fas fa-comment"></i>
      Message ${nodeData.name?.split(' ')[0] || 'User'}
    </button>
  `;
  
  // Position near node (mobile-safe)
  cta.style.position = 'fixed';
  cta.style.left = '50%';
  cta.style.transform = 'translateX(-50%)';
  cta.style.bottom = '80px';
  cta.style.zIndex = '10000';
  
  document.body.appendChild(cta);
  
  // Handle CTA click
  cta.querySelector('.quiet-cta-button').addEventListener('click', () => {
    handleCTAAction(nodeData);
  });
  
  state.activeCTA = cta;
}

function hideCTA() {
  if (state.activeCTA) {
    state.activeCTA.remove();
    state.activeCTA = null;
  }
}

function handleCTAAction(nodeData) {
  console.log('🔇 CTA Action:', nodeData.name);
  
  // Open messaging or node panel
  if (window.openNodePanel) {
    window.openNodePanel(nodeData); // Pass the full nodeData object, not just the ID
  }
  
  hideCTA();
}

/* ==========================================================================
   SEARCH
   ========================================================================== */

function setupQuietSearch(synapseCore) {
  // Search functionality removed - using main search bar instead
  console.log('🔇 Quiet mode search disabled - use main search bar');
}

function handleSearch(query, synapseCore) {
  state.searchQuery = query.toLowerCase().trim();
  
  if (!state.searchQuery) {
    // Reset to default view
    applyQuietMode(synapseCore);
    return;
  }
  
  console.log('🔇 Search:', state.searchQuery);
  
  const { nodes, nodeEls } = synapseCore;
  
  // Filter nodes by search
  const matches = nodes.filter(n => 
    state.visibleNodes.has(n.id) && 
    n.name?.toLowerCase().includes(state.searchQuery)
  );
  
  if (matches.length === 0) {
    console.log('🔇 No matches');
    return;
  }
  
  // Show only matching nodes
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    const isMatch = matches.some(m => m.id === d.id);
    
    if (isMatch || d.id === synapseCore.currentUserCommunityId) {
      node.style('display', 'block').style('opacity', 1);
    } else {
      node.style('display', 'none');
    }
  });
  
  // Focus on best match
  if (matches.length > 0) {
    const bestMatch = matches[0];
    const matchNode = nodeEls.filter(d => d.id === bestMatch.id).node();
    if (matchNode) {
      enterFocusState(bestMatch, matchNode, synapseCore);
    }
  }
}

/* ==========================================================================
   HIDE FORBIDDEN UI
   ========================================================================== */

function hideForbiddenUI() {
  // Hide mode switcher
  const modeSwitcher = document.getElementById('synapse-mode-switcher');
  if (modeSwitcher) {
    modeSwitcher.style.display = 'none';
  }
  
  // Hide category toggles
  const categoryToggles = document.querySelectorAll('.category-toggle, .filter-button, .view-toggle');
  categoryToggles.forEach(el => el.style.display = 'none');
  
  // Hide XP/streak UI
  const gamification = document.querySelectorAll('.xp-bar, .streak-indicator, .level-badge, .leaderboard');
  gamification.forEach(el => el.style.display = 'none');
  
  // Hide panels/sidebars
  const panels = document.querySelectorAll('.floating-panel, .sidebar, .bottom-tray:not(#quiet-search)');
  panels.forEach(el => el.style.display = 'none');
  
  console.log('🔇 Forbidden UI elements hidden');
}

/* ==========================================================================
   EXPORTS
   ========================================================================== */

export default {
  init: initQuietMode,
  apply: applyQuietMode,
  config: QUIET_MODE_CONFIG,
  state
};
