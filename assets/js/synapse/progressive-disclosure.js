// ================================================================
// Synapse Progressive Disclosure System
// ================================================================
// Mobile-first, calm, guided network visualization
// Implements visual hierarchy, progressive disclosure, and responsive behavior
// ================================================================

/* ==========================================================================
   STATE & CONFIGURATION
   ========================================================================== */

const config = {
  // Visual States
  states: {
    dormant: {
      opacity: 0.25,
      scale: 0.8,
      saturation: 0.2,
      showLabel: false,
      showIcons: false,
      showBadges: false,
      glow: false
    },
    aware: {
      opacity: 0.7,
      scale: 1.0,
      saturation: 0.6,
      showLabel: true,
      showIcons: false,
      showBadges: false,
      glow: true,
      glowIntensity: 0.3
    },
    active: {
      opacity: 1.0,
      scale: 1.2,
      saturation: 1.0,
      showLabel: true,
      showIcons: true,
      showBadges: true,
      glow: true,
      glowIntensity: 0.6
    }
  },
  
  // Zoom Thresholds (semantic density)
  zoom: {
    far: { max: 0.5, showAvatars: false, showLabels: false, clustering: true },
    mid: { min: 0.5, max: 1.5, showAvatars: true, showLabels: 'selective', clustering: false },
    close: { min: 1.5, showAvatars: true, showLabels: true, clustering: false }
  },
  
  // Label Limits
  maxVisibleLabels: 3,
  
  // Animation
  transitionDuration: 300,
  motionReduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  
  // Touch
  minTouchTarget: 44, // px
  longPressDuration: 500, // ms
  
  // Modes
  modes: {
    myNetwork: {
      name: 'My Network',
      description: 'Your direct connections',
      maxDegree: 2,
      showThemes: false,
      motionLevel: 'minimal'
    },
    discovery: {
      name: 'Discovery',
      description: 'Explore the full network',
      maxDegree: Infinity,
      showThemes: true,
      motionLevel: 'moderate'
    },
    focus: {
      name: 'Focus',
      description: 'Clear path to your goal',
      maxDegree: 1,
      showThemes: false,
      motionLevel: 'none',
      dimUnrelated: true
    }
  }
};

let state = {
  currentMode: 'myNetwork',
  activeNode: null,
  focusedNode: null,
  visibleLabels: new Set(),
  currentZoomLevel: 1.0,
  touchStartTime: null,
  touchTarget: null,
  firstLoad: true,
  userHasInteracted: false
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

export function initProgressiveDisclosure(synapseCore) {
  console.log('🎨 Initializing Progressive Disclosure System');
  
  // Detect mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                   window.innerWidth < 768;
  
  // Set initial mode based on device
  state.currentMode = isMobile ? 'myNetwork' : 'discovery';
  
  // Setup event listeners
  setupEventListeners(synapseCore);
  
  // Setup mode switcher UI
  setupModeSwitcher();
  
  // Setup first-time experience
  if (state.firstLoad) {
    setupFirstTimeExperience(synapseCore);
  }
  
  // Apply initial visual state
  applyDormantState(synapseCore);
  
  console.log('✅ Progressive Disclosure initialized in', state.currentMode, 'mode');
}

/* ==========================================================================
   VISUAL STATE MANAGEMENT
   ========================================================================== */

/**
 * Apply dormant state to all nodes (default)
 */
export function applyDormantState(synapseCore) {
  const { nodes, nodeEls } = synapseCore;
  if (!nodeEls) return;
  
  const dormant = config.states.dormant;
  
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    
    // Skip current user (always visible)
    if (d.isCurrentUser) {
      applyActiveState(node, d);
      return;
    }
    
    // Apply dormant styling
    node.select('circle')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', dormant.opacity)
      .attr('r', d => (d.radius || 20) * dormant.scale)
      .style('filter', 'grayscale(80%) brightness(0.7)');
    
    // Hide avatar
    node.select('image')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 0);
    
    // Hide label
    node.select('text')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 0);
    
    // Hide icons and badges
    node.selectAll('.node-icon, .node-badge')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 0);
    
    // Remove glow
    node.select('circle').style('filter', 'none');
  });
  
  // Dim all links
  if (synapseCore.linkEls) {
    synapseCore.linkEls
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 0.1);
  }
}

/**
 * Apply aware state to a node (hover/proximity)
 */
export function applyAwareState(nodeEl, nodeData) {
  const aware = config.states.aware;
  
  nodeEl.select('circle')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', aware.opacity)
    .attr('r', (nodeData.radius || 20) * aware.scale)
    .style('filter', `grayscale(${(1 - aware.saturation) * 100}%) brightness(1.1) drop-shadow(0 0 8px rgba(100, 200, 255, ${aware.glowIntensity}))`);
  
  // Show avatar
  nodeEl.select('image')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', 0.8);
  
  // Show label
  if (aware.showLabel && canShowLabel(nodeData.id)) {
    showLabel(nodeEl, nodeData);
  }
}

/**
 * Apply active state to a node (selected/focused)
 */
export function applyActiveState(nodeEl, nodeData) {
  const active = config.states.active;
  
  nodeEl.select('circle')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', active.opacity)
    .attr('r', (nodeData.radius || 20) * active.scale)
    .style('filter', `grayscale(0%) brightness(1.2) drop-shadow(0 0 12px rgba(100, 200, 255, ${active.glowIntensity}))`);
  
  // Show avatar
  nodeEl.select('image')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', 1.0);
  
  // Show label
  if (active.showLabel) {
    showLabel(nodeEl, nodeData);
  }
  
  // Show icons and badges (only at close zoom)
  if (active.showIcons && state.currentZoomLevel >= config.zoom.close.min) {
    showIconsAndBadges(nodeEl, nodeData);
  }
  
  // Wake connected nodes
  wakeConnectedNodes(nodeData);
}

/**
 * Wake connected nodes (partial awareness)
 */
function wakeConnectedNodes(nodeData) {
  // Implementation depends on synapse core structure
  // This would highlight immediate connections
  console.log('🔗 Waking connected nodes for:', nodeData.id);
}

/* ==========================================================================
   LABEL MANAGEMENT
   ========================================================================== */

function canShowLabel(nodeId) {
  // Always allow current user label
  if (state.visibleLabels.has('current-user')) {
    if (nodeId === 'current-user') return true;
  }
  
  // Check if we're under the limit
  if (state.visibleLabels.size < config.maxVisibleLabels) {
    return true;
  }
  
  // Check if this label is already visible
  return state.visibleLabels.has(nodeId);
}

function showLabel(nodeEl, nodeData) {
  state.visibleLabels.add(nodeData.id);
  
  const label = nodeEl.select('text');
  
  // Position label responsively
  const isMobile = window.innerWidth < 768;
  const yOffset = isMobile ? -35 : -30;
  
  label
    .text(nodeData.name || 'Unknown')
    .attr('y', yOffset)
    .attr('font-size', isMobile ? '11px' : '12px')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', 1);
  
  // Enforce label limit
  enforceLabel Limit();
}

function hideLabel(nodeEl, nodeData) {
  state.visibleLabels.delete(nodeData.id);
  
  nodeEl.select('text')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', 0);
}

function enforceLabelLimit() {
  if (state.visibleLabels.size <= config.maxVisibleLabels) return;
  
  // Remove oldest labels (except current user and active node)
  const toRemove = Array.from(state.visibleLabels)
    .filter(id => id !== 'current-user' && id !== state.activeNode)
    .slice(0, state.visibleLabels.size - config.maxVisibleLabels);
  
  toRemove.forEach(id => {
    state.visibleLabels.delete(id);
    // Hide the label in DOM
    window.d3.selectAll('.node').each(function(d) {
      if (d.id === id) {
        window.d3.select(this).select('text')
          .transition()
          .duration(config.transitionDuration)
          .attr('opacity', 0);
      }
    });
  });
}

/* ==========================================================================
   ICONS & BADGES
   ========================================================================== */

function showIconsAndBadges(nodeEl, nodeData) {
  // Only show at close zoom
  if (state.currentZoomLevel < config.zoom.close.min) return;
  
  // Show XP badge
  if (nodeData.xp) {
    nodeEl.select('.xp-badge')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 1);
  }
  
  // Show streak badge
  if (nodeData.streak && nodeData.streak > 0) {
    nodeEl.select('.streak-badge')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 1);
  }
  
  // Show theme icons (if in discovery mode)
  if (state.currentMode === 'discovery' && nodeData.themes) {
    nodeEl.selectAll('.theme-icon')
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', 0.8);
  }
}

function hideIconsAndBadges(nodeEl) {
  nodeEl.selectAll('.node-icon, .node-badge, .theme-icon')
    .transition()
    .duration(config.transitionDuration)
    .attr('opacity', 0);
}

/* ==========================================================================
   ZOOM HANDLING (Semantic Density)
   ========================================================================== */

export function handleZoomChange(zoomLevel, synapseCore) {
  state.currentZoomLevel = zoomLevel;
  
  console.log('🔍 Zoom level:', zoomLevel.toFixed(2));
  
  // Determine zoom tier
  let tier = 'mid';
  if (zoomLevel < config.zoom.far.max) {
    tier = 'far';
  } else if (zoomLevel >= config.zoom.close.min) {
    tier = 'close';
  }
  
  console.log('📊 Zoom tier:', tier);
  
  // Apply tier-specific rendering
  applyZoomTier(tier, synapseCore);
}

function applyZoomTier(tier, synapseCore) {
  const { nodeEls } = synapseCore;
  if (!nodeEls) return;
  
  const tierConfig = config.zoom[tier];
  
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    
    // Skip current user (always visible)
    if (d.isCurrentUser) return;
    
    // Skip active node (always visible)
    if (d.id === state.activeNode) return;
    
    // Avatars
    if (tierConfig.showAvatars) {
      node.select('image').attr('opacity', 0.6);
    } else {
      node.select('image').attr('opacity', 0);
    }
    
    // Labels
    if (tierConfig.showLabels === false) {
      hideLabel(node, d);
    } else if (tierConfig.showLabels === 'selective') {
      // Only show labels for important nodes
      if (d.connection_count > 5 || d.isCurrentUser) {
        showLabel(node, d);
      } else {
        hideLabel(node, d);
      }
    }
    
    // Icons/badges only at close zoom
    if (tier === 'close') {
      if (d.id === state.activeNode) {
        showIconsAndBadges(node, d);
      }
    } else {
      hideIconsAndBadges(node);
    }
  });
}

/* ==========================================================================
   MODE SWITCHING
   ========================================================================== */

export function switchMode(modeName, synapseCore) {
  if (!config.modes[modeName]) {
    console.warn('⚠️ Unknown mode:', modeName);
    return;
  }
  
  console.log('🔄 Switching to mode:', modeName);
  
  state.currentMode = modeName;
  const mode = config.modes[modeName];
  
  // Save preference
  localStorage.setItem('synapse-mode', modeName);
  
  // Apply mode-specific filtering
  applyModeFiltering(mode, synapseCore);
  
  // Update UI
  updateModeSwitcherUI(modeName);
  
  // Show notification
  showModeNotification(mode);
}

function applyModeFiltering(mode, synapseCore) {
  const { nodes, nodeEls, linkEls } = synapseCore;
  if (!nodeEls) return;
  
  // Filter nodes based on mode
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    
    let shouldShow = true;
    
    // My Network mode: only show connections within maxDegree
    if (mode.maxDegree < Infinity) {
      shouldShow = d.isCurrentUser || (d.degree && d.degree <= mode.maxDegree);
    }
    
    // Focus mode: dim unrelated nodes
    if (mode.dimUnrelated && state.focusedNode) {
      shouldShow = d.id === state.focusedNode || d.connectedTo === state.focusedNode;
    }
    
    // Apply visibility
    node.transition()
      .duration(config.transitionDuration)
      .attr('opacity', shouldShow ? 1 : 0.1);
  });
  
  // Filter links
  if (linkEls) {
    linkEls.each(function(d) {
      const link = window.d3.select(this);
      
      let shouldShow = true;
      
      if (mode.maxDegree < Infinity) {
        // Only show links between visible nodes
        shouldShow = (d.source.degree <= mode.maxDegree) && 
                     (d.target.degree <= mode.maxDegree);
      }
      
      link.transition()
        .duration(config.transitionDuration)
        .attr('opacity', shouldShow ? 0.3 : 0.05);
    });
  }
  
  // Hide/show themes based on mode
  if (synapseCore.themeEls) {
    synapseCore.themeEls
      .transition()
      .duration(config.transitionDuration)
      .attr('opacity', mode.showThemes ? 0.6 : 0);
  }
}

/* ==========================================================================
   TOUCH & MOBILE INTERACTIONS
   ========================================================================== */

function setupEventListeners(synapseCore) {
  // Zoom events
  if (synapseCore.zoomBehavior) {
    synapseCore.svg.on('zoom', function(event) {
      handleZoomChange(event.transform.k, synapseCore);
    });
  }
  
  // Node interactions (will be attached to nodes when rendered)
  window.addEventListener('synapse:nodes-rendered', () => {
    attachNodeInteractions(synapseCore);
  });
  
  // Mode switching
  window.addEventListener('synapse:switch-mode', (e) => {
    switchMode(e.detail.mode, synapseCore);
  });
}

function attachNodeInteractions(synapseCore) {
  const { nodeEls } = synapseCore;
  if (!nodeEls) return;
  
  nodeEls.each(function(d) {
    const node = window.d3.select(this);
    const element = this;
    
    // Ensure minimum touch target size
    const circle = node.select('circle');
    const currentRadius = parseFloat(circle.attr('r')) || 20;
    if (currentRadius * 2 < config.minTouchTarget) {
      // Add invisible larger hit area
      node.insert('circle', ':first-child')
        .attr('r', config.minTouchTarget / 2)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all');
    }
    
    // Desktop: hover
    if (!('ontouchstart' in window)) {
      node.on('mouseenter', function() {
        if (d.id !== state.activeNode) {
          applyAwareState(node, d);
        }
      });
      
      node.on('mouseleave', function() {
        if (d.id !== state.activeNode) {
          applyDormantState(synapseCore);
        }
      });
    }
    
    // Mobile: tap and long-press
    node.on('touchstart', function(event) {
      state.touchStartTime = Date.now();
      state.touchTarget = d.id;
      
      // Long-press timer
      setTimeout(() => {
        if (state.touchTarget === d.id) {
          handleLongPress(d, synapseCore);
        }
      }, config.longPressDuration);
    });
    
    node.on('touchend', function(event) {
      const duration = Date.now() - state.touchStartTime;
      
      if (duration < config.longPressDuration && state.touchTarget === d.id) {
        handleTap(d, synapseCore);
      }
      
      state.touchStartTime = null;
      state.touchTarget = null;
    });
    
    // Click (works for both)
    node.on('click', function(event) {
      // Prevent if touch already handled it
      if (state.touchStartTime) return;
      
      handleTap(d, synapseCore);
    });
  });
}

function handleTap(nodeData, synapseCore) {
  console.log('👆 Tap on node:', nodeData.name);
  
  state.userHasInteracted = true;
  
  // Set as active
  state.activeNode = nodeData.id;
  
  // Apply active state
  const nodeEl = window.d3.selectAll('.node').filter(d => d.id === nodeData.id);
  applyActiveState(nodeEl, nodeData);
  
  // Reset other nodes to dormant
  window.d3.selectAll('.node').each(function(d) {
    if (d.id !== nodeData.id && !d.isCurrentUser) {
      applyDormantState(synapseCore);
    }
  });
}

function handleLongPress(nodeData, synapseCore) {
  console.log('👆🕐 Long-press on node:', nodeData.name);
  
  state.userHasInteracted = true;
  
  // Open node panel (full details)
  if (window.openNodePanel) {
    window.openNodePanel(nodeData.id);
  }
}

/* ==========================================================================
   MODE SWITCHER UI
   ========================================================================== */

function setupModeSwitcher() {
  // Check if mode switcher already exists
  if (document.getElementById('synapse-mode-switcher')) return;
  
  const switcher = document.createElement('div');
  switcher.id = 'synapse-mode-switcher';
  switcher.className = 'synapse-mode-switcher';
  
  // Create mode buttons
  Object.keys(config.modes).forEach(modeName => {
    const mode = config.modes[modeName];
    const button = document.createElement('button');
    button.className = 'mode-button';
    button.dataset.mode = modeName;
    button.innerHTML = `
      <span class="mode-name">${mode.name}</span>
      <span class="mode-description">${mode.description}</span>
    `;
    
    button.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('synapse:switch-mode', {
        detail: { mode: modeName }
      }));
    });
    
    switcher.appendChild(button);
  });
  
  // Add to DOM
  const synapseView = document.getElementById('synapse-main-view');
  if (synapseView) {
    synapseView.appendChild(switcher);
  }
  
  // Set initial active state
  updateModeSwitcherUI(state.currentMode);
}

function updateModeSwitcherUI(modeName) {
  const buttons = document.querySelectorAll('.mode-button');
  buttons.forEach(btn => {
    if (btn.dataset.mode === modeName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function showModeNotification(mode) {
  // Use existing notification system if available
  if (window.showSynapseNotification) {
    window.showSynapseNotification(`Switched to ${mode.name} mode`, 'info');
  }
}

/* ==========================================================================
   FIRST-TIME EXPERIENCE
   ========================================================================== */

function setupFirstTimeExperience(synapseCore) {
  // Check if user has seen the intro
  if (localStorage.getItem('synapse-intro-seen')) {
    state.firstLoad = false;
    return;
  }
  
  // Wait for nodes to be rendered
  setTimeout(() => {
    showFirstTimeIntro(synapseCore);
  }, 1000);
}

function showFirstTimeIntro(synapseCore) {
  // Find current user node
  const currentUserNode = synapseCore.nodes.find(n => n.isCurrentUser);
  if (!currentUserNode) return;
  
  // Pulse current user node once
  const nodeEl = window.d3.selectAll('.node').filter(d => d.isCurrentUser);
  
  if (!config.motionReduced) {
    nodeEl.select('circle')
      .transition()
      .duration(600)
      .attr('r', (currentUserNode.radius || 20) * 1.5)
      .transition()
      .duration(600)
      .attr('r', currentUserNode.radius || 20);
  }
  
  // Show helper text
  const helper = document.createElement('div');
  helper.className = 'synapse-first-time-helper';
  helper.innerHTML = `
    <div class="helper-content">
      <p>This is your network. Start here.</p>
      <button class="helper-dismiss">Got it</button>
    </div>
  `;
  
  document.body.appendChild(helper);
  
  // Position near current user node (responsive)
  positionHelper(helper, currentUserNode);
  
  // Fade in
  setTimeout(() => helper.classList.add('visible'), 100);
  
  // Dismiss on interaction or button click
  const dismiss = () => {
    helper.classList.remove('visible');
    setTimeout(() => helper.remove(), 300);
    localStorage.setItem('synapse-intro-seen', 'true');
    state.firstLoad = false;
  };
  
  helper.querySelector('.helper-dismiss').addEventListener('click', dismiss);
  
  // Auto-dismiss on first interaction
  const handleInteraction = () => {
    if (state.userHasInteracted) {
      dismiss();
      window.removeEventListener('synapse:user-interacted', handleInteraction);
    }
  };
  window.addEventListener('synapse:user-interacted', handleInteraction);
  
  // Auto-dismiss after 10 seconds
  setTimeout(dismiss, 10000);
}

function positionHelper(helper, nodeData) {
  // Position responsively based on screen size
  const isMobile = window.innerWidth < 768;
  
  if (isMobile) {
    // Bottom center on mobile
    helper.style.position = 'fixed';
    helper.style.bottom = '80px';
    helper.style.left = '50%';
    helper.style.transform = 'translateX(-50%)';
  } else {
    // Near node on desktop
    helper.style.position = 'fixed';
    helper.style.top = '50%';
    helper.style.left = '50%';
    helper.style.transform = 'translate(-50%, -50%)';
  }
}

/* ==========================================================================
   EXPORTS
   ========================================================================== */

export default {
  init: initProgressiveDisclosure,
  applyDormantState,
  applyAwareState,
  applyActiveState,
  handleZoomChange,
  switchMode,
  config,
  state
};
