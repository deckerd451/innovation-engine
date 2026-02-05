// ================================================================
// START SEQUENCE - SYNAPSE INTEGRATION
// ================================================================
// Maps START sequence data to synapse visualization
// Highlights nodes, draws connections, and provides visual feedback
// ================================================================

console.log('%c🧠 START-Synapse Integration - Loading', 'color:#0f8; font-weight:bold;');

// ================================================================
// SYNAPSE HIGHLIGHTER
// ================================================================

class SynapseHighlighter {
  constructor() {
    this.activeHighlights = new Map();
    this.animationFrames = new Map();
  }

  /**
   * Apply highlights from START sequence data
   */
  async applyStartHighlights() {
    try {
      // Get synapse data from START sequence
      const synapseData = await window.getStartSynapseData();
      
      if (!synapseData || !synapseData.highlights) {
        return;
      }

      // Clear existing highlights
      this.clearAllHighlights();

      // Apply each highlight
      synapseData.highlights.forEach(highlight => {
        this.applyHighlight(highlight);
      });

      // Store for reference
      this.activeHighlights.set('start_sequence', synapseData.highlights);

      return synapseData;

    } catch (error) {
      console.error('❌ Failed to apply START highlights:', error);
    }
  }

  /**
   * Apply a single highlight to a node
   */
  applyHighlight(highlight) {
    const { id, type, reason, priority, animation, badge, matchedSkills } = highlight;

    // Find the node in the synapse
    const node = this.findNode(id, type);
    
    if (!node) {
      console.warn(`Node not found: ${type} ${id}`);
      return;
    }

    // Apply visual styling based on priority
    const style = this.getHighlightStyle(priority, reason);
    
    // Apply to SVG element
    if (node.element) {
      this.applyNodeStyle(node.element, style);
    }

    // Apply animation
    if (animation) {
      this.applyAnimation(node.element, animation);
    }

    // Add badge if specified
    if (badge) {
      this.addBadge(node.element, badge);
    }

    // Store highlight info
    node.highlightInfo = {
      reason,
      priority,
      matchedSkills,
      appliedAt: Date.now()
    };
  }

  /**
   * Find a node in the synapse visualization
   */
  findNode(id, type) {
    // Try to find in D3 data first
    if (window.synapseNodes) {
      const node = window.synapseNodes.find(n => n.id === id);
      if (node) return node;
    }

    // Try to find SVG element directly
    const selector = `[data-node-id="${id}"]`;
    const element = document.querySelector(selector);
    
    if (element) {
      return { id, type, element };
    }

    // Try alternative selectors
    const altSelectors = [
      `#node-${id}`,
      `.node-${type}[data-id="${id}"]`,
      `circle[data-id="${id}"]`,
      `g[data-id="${id}"]`
    ];

    for (const sel of altSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        return { id, type, element: el };
      }
    }

    return null;
  }

  /**
   * Get highlight style based on priority and reason
   */
  getHighlightStyle(priority, reason) {
    const styles = {
      high: {
        pending_request: {
          stroke: '#00e0ff',
          strokeWidth: 4,
          fill: 'rgba(0, 224, 255, 0.3)',
          filter: 'drop-shadow(0 0 10px rgba(0, 224, 255, 0.8))'
        },
        unread_message: {
          stroke: '#00e0ff',
          strokeWidth: 3,
          fill: 'rgba(0, 224, 255, 0.25)',
          filter: 'drop-shadow(0 0 8px rgba(0, 224, 255, 0.6))'
        }
      },
      medium: {
        skill_match: {
          stroke: '#00ff88',
          strokeWidth: 3,
          fill: 'rgba(0, 255, 136, 0.2)',
          filter: 'drop-shadow(0 0 8px rgba(0, 255, 136, 0.5))'
        },
        active: {
          stroke: '#ffaa00',
          strokeWidth: 2,
          fill: 'rgba(255, 170, 0, 0.2)',
          filter: 'drop-shadow(0 0 6px rgba(255, 170, 0, 0.4))'
        }
      },
      low: {
        default: {
          stroke: 'rgba(255, 255, 255, 0.5)',
          strokeWidth: 2,
          fill: 'rgba(255, 255, 255, 0.1)',
          filter: 'none'
        }
      }
    };

    return styles[priority]?.[reason] || styles.low.default;
  }

  /**
   * Apply style to SVG node element
   */
  applyNodeStyle(element, style) {
    if (!element) return;

    // Find the circle or main shape
    const shape = element.tagName === 'circle' ? element : element.querySelector('circle');
    
    if (shape) {
      shape.style.stroke = style.stroke;
      shape.style.strokeWidth = style.strokeWidth + 'px';
      shape.style.fill = style.fill;
      shape.style.filter = style.filter;
      shape.style.transition = 'all 0.3s ease';
    }

    // Also apply to parent group if exists
    if (element.tagName === 'g') {
      element.style.filter = style.filter;
    }
  }

  /**
   * Apply animation to node
   */
  applyAnimation(element, animationType) {
    if (!element) return;

    const animations = {
      pulse: this.createPulseAnimation,
      glow: this.createGlowAnimation,
      highlight: this.createHighlightAnimation,
      'subtle-glow': this.createSubtleGlowAnimation
    };

    const animationFn = animations[animationType];
    if (animationFn) {
      const animationId = animationFn.call(this, element);
      this.animationFrames.set(element, animationId);
    }
  }

  /**
   * Create pulse animation
   * ✅ PERFORMANCE: Lifecycle-controlled animation
   */
  createPulseAnimation(element) {
    const shape = element.tagName === 'circle' ? element : element.querySelector('circle');
    if (!shape) return null;

    const originalRadius = parseFloat(shape.getAttribute('r')) || 10;
    let phase = 0;
    let frameId = null;

    const animate = () => {
      // ✅ Stop animation when idle or hidden
      if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
        frameId = null;
        return;
      }

      phase += 0.05;
      const scale = 1 + Math.sin(phase) * 0.15;
      shape.setAttribute('r', originalRadius * scale);
      
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return frameId;
  }

  /**
   * Create glow animation
   * ✅ PERFORMANCE: Lifecycle-controlled animation
   */
  createGlowAnimation(element) {
    let phase = 0;
    let frameId = null;

    const animate = () => {
      // ✅ Stop animation when idle or hidden
      if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
        frameId = null;
        return;
      }

      phase += 0.03;
      const intensity = 0.5 + Math.sin(phase) * 0.5;
      const color = `rgba(0, 224, 255, ${intensity})`;
      
      element.style.filter = `drop-shadow(0 0 ${8 + intensity * 8}px ${color})`;
      
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return frameId;
  }

  /**
   * Create highlight animation
   * ✅ PERFORMANCE: Lifecycle-controlled animation
   */
  createHighlightAnimation(element) {
    let phase = 0;
    let frameId = null;

    const animate = () => {
      // ✅ Stop animation when idle or hidden
      if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
        frameId = null;
        return;
      }

      phase += 0.02;
      const intensity = 0.3 + Math.sin(phase) * 0.2;
      const color = `rgba(0, 255, 136, ${intensity})`;
      
      element.style.filter = `drop-shadow(0 0 ${6 + intensity * 6}px ${color})`;
      
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return frameId;
  }

  /**
   * Create subtle glow animation
   * ✅ PERFORMANCE: Lifecycle-controlled animation
   */
  createSubtleGlowAnimation(element) {
    let phase = 0;
    let frameId = null;

    const animate = () => {
      // ✅ Stop animation when idle or hidden
      if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
        frameId = null;
        return;
      }

      phase += 0.01;
      const intensity = 0.2 + Math.sin(phase) * 0.1;
      const color = `rgba(255, 170, 0, ${intensity})`;
      
      element.style.filter = `drop-shadow(0 0 ${4 + intensity * 4}px ${color})`;
      
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return frameId;
  }

  /**
   * Add badge to node (for unread counts, etc.)
   */
  addBadge(element, count) {
    if (!element || count <= 0) return;

    // Find or create badge group
    let badgeGroup = element.querySelector('.node-badge');
    
    if (!badgeGroup) {
      badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badgeGroup.classList.add('node-badge');
      element.appendChild(badgeGroup);
    }

    // Clear existing badge
    badgeGroup.innerHTML = '';

    // Create badge circle
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badge.setAttribute('cx', 15);
    badge.setAttribute('cy', -15);
    badge.setAttribute('r', 8);
    badge.setAttribute('fill', '#ff3b30');
    badge.setAttribute('stroke', '#fff');
    badge.setAttribute('stroke-width', 2);

    // Create badge text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', 15);
    text.setAttribute('y', -11);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', 'bold');
    text.textContent = count > 9 ? '9+' : count;

    badgeGroup.appendChild(badge);
    badgeGroup.appendChild(text);
  }

  /**
   * Clear all highlights
   */
  clearAllHighlights() {
    // Stop all animations
    this.animationFrames.forEach((frameId, element) => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    });
    this.animationFrames.clear();

    // Remove all badges
    document.querySelectorAll('.node-badge').forEach(badge => {
      badge.remove();
    });

    // Reset node styles
    document.querySelectorAll('[data-node-id]').forEach(node => {
      const shape = node.tagName === 'circle' ? node : node.querySelector('circle');
      if (shape) {
        shape.style.stroke = '';
        shape.style.strokeWidth = '';
        shape.style.fill = '';
        shape.style.filter = '';
      }
      if (node.tagName === 'g') {
        node.style.filter = '';
      }
    });

    this.activeHighlights.clear();
  }

  /**
   * Clear highlights for a specific node
   */
  clearNodeHighlight(id) {
    const node = this.findNode(id);
    if (!node || !node.element) return;

    // Stop animation
    const frameId = this.animationFrames.get(node.element);
    if (frameId) {
      cancelAnimationFrame(frameId);
      this.animationFrames.delete(node.element);
    }

    // Remove badge
    const badge = node.element.querySelector('.node-badge');
    if (badge) badge.remove();

    // Reset style
    const shape = node.element.tagName === 'circle' ? node.element : node.element.querySelector('circle');
    if (shape) {
      shape.style.stroke = '';
      shape.style.strokeWidth = '';
      shape.style.fill = '';
      shape.style.filter = '';
    }
  }

  /**
   * Get active highlights
   */
  getActiveHighlights() {
    return Array.from(this.activeHighlights.values()).flat();
  }
}

// ================================================================
// CONNECTION DRAWER
// ================================================================

class SynapseConnectionDrawer {
  /**
   * Draw connections between user and highlighted nodes
   */
  drawStartConnections(synapseData) {
    if (!synapseData || !synapseData.highlights) return;

    // Get user node
    const userNode = this.findUserNode();
    if (!userNode) {
      console.warn('User node not found in synapse');
      return;
    }

    // Draw connections to highlighted nodes
    synapseData.highlights.forEach(highlight => {
      if (highlight.priority === 'high') {
        this.drawConnection(userNode, highlight.id, highlight.reason);
      }
    });
  }

  /**
   * Find the user's node in the synapse
   */
  findUserNode() {
    // Try multiple methods to find user node
    const selectors = [
      '[data-node-type="user"]',
      '[data-is-current-user="true"]',
      '.current-user-node',
      '#user-node'
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }

    return null;
  }

  /**
   * Draw a connection line between two nodes
   */
  drawConnection(fromNode, toNodeId, reason) {
    // Implementation depends on your synapse visualization library
    // This is a placeholder
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.SynapseHighlighter = new SynapseHighlighter();
window.SynapseConnectionDrawer = new SynapseConnectionDrawer();

// ================================================================
// CONVENIENCE FUNCTIONS
// ================================================================

/**
 * Apply START highlights to synapse
 */
async function applyStartHighlights() {
  return await window.SynapseHighlighter.applyStartHighlights();
}

/**
 * Clear all START highlights
 */
function clearStartHighlights() {
  window.SynapseHighlighter.clearAllHighlights();
}

/**
 * Refresh highlights (useful after user actions)
 */
async function refreshStartHighlights() {
  window.clearStartSequenceCache();
  return await applyStartHighlights();
}

// Export functions
window.applyStartHighlights = applyStartHighlights;
window.clearStartHighlights = clearStartHighlights;
window.refreshStartHighlights = refreshStartHighlights;

// ================================================================
// AUTO-APPLY ON SYNAPSE READY
// ================================================================

// Listen for synapse ready event
document.addEventListener('synapse-ready', async () => {
  await applyStartHighlights();
});

// Also try to apply if synapse is already ready
if (window.isSynapseReady && window.isSynapseReady()) {
  setTimeout(() => applyStartHighlights(), 1000);
}

console.log('✅ START-Synapse Integration ready');
