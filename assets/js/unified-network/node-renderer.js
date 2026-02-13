// assets/js/unified-network/node-renderer.js
// Node Renderer for Unified Network Discovery
// Version: 1.0.0

import { getPresenceTier, PresenceTier } from './types.js';
import { 
  VISUAL_CONSTANTS, 
  GLOW_INTENSITY, 
  GLOW_COLORS,
  MOBILE_CONSTANTS 
} from './constants.js';
import { computeEffectivePull } from './effective-pull.js';

/**
 * Node Renderer
 * Renders nodes with visual states based on effectivePull and presence
 */
export class NodeRenderer {
  constructor() {
    this._svg = null;
    this._nodeGroup = null;
    this._viewport = { width: window.innerWidth, height: window.innerHeight };
    this._cullingMargin = 100;

    // Throttled logging state
    this._lastLogTime = 0;
    this._lastLoggedVisible = -1;
    this._lastLoggedTotal = -1;
    this._logThrottleMs = 2000; // Log at most once per 2 seconds
    this._lastTierLogTime = 0; // For tier filtering logs
  }

  /**
   * Initialize renderer
   * @param {SVGElement} svg - SVG element
   */
  initialize(svg) {
    this._svg = svg;
    
    // Create or get node group
    this._nodeGroup = window.d3.select(svg).select('.nodes');
    if (this._nodeGroup.empty()) {
      this._nodeGroup = window.d3.select(svg).append('g').attr('class', 'nodes');
    }

    // Update viewport on resize
    const updateViewport = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._viewport = {
          width: rect.width,
          height: rect.height
        };
      }
    };
    
    window.addEventListener('resize', updateViewport);
    
    // Update viewport on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateViewport();
      }
    });
    
    // Initial viewport update
    updateViewport();

    console.log('✅ NodeRenderer initialized');
  }

  /**
   * Get visual state for a node
   * @param {Node} node - Node
   * @param {SystemState} state - System state
   * @returns {VisualState}
   */
  getVisualState(node, state) {
    if (!node) {
      return this._getDefaultVisualState();
    }

    const baseRadius = VISUAL_CONSTANTS.baseRadius;
    let opacity = VISUAL_CONSTANTS.baseOpacity;
    let glowIntensity = 0;
    let glowColor = '#ffffff';
    let scale = VISUAL_CONSTANTS.scaleMin;

    // Determine glow based on presence tier
    const presenceTier = getPresenceTier(node.presenceEnergy || 0);
    
    if (presenceTier === PresenceTier.Actionable) {
      glowIntensity = GLOW_INTENSITY.actionable;
      glowColor = GLOW_COLORS.actionable;
    } else if (presenceTier === PresenceTier.Relevant) {
      glowIntensity = GLOW_INTENSITY.relevant;
      glowColor = GLOW_COLORS.relevant;
    } else if (presenceTier === PresenceTier.Ambient) {
      glowIntensity = GLOW_INTENSITY.ambient;
      glowColor = GLOW_COLORS.ambient;
    }

    // Apply dimming if another node is focused
    if (state && state.currentFocusedNodeId && state.currentFocusedNodeId !== node.id) {
      const focusedNode = this._findNodeById(state.currentFocusedNodeId);
      if (focusedNode && node.x !== undefined && node.y !== undefined) {
        const distance = Math.hypot(node.x - focusedNode.x, node.y - focusedNode.y);
        const maxDistance = VISUAL_CONSTANTS.maxDistance;
        const dimFactor = Math.min(1, distance / maxDistance);
        opacity = VISUAL_CONSTANTS.dimmedOpacity + (0.7 * (1 - dimFactor));
      }
    }

    // Scale based on effectivePull
    const effectivePull = node.effectivePull ?? computeEffectivePull(node);
    scale = VISUAL_CONSTANTS.scaleMin + (effectivePull * (VISUAL_CONSTANTS.scaleMax - VISUAL_CONSTANTS.scaleMin));

    return {
      radius: baseRadius * scale,
      opacity,
      glowIntensity,
      glowColor,
      scale
    };
  }

  /**
   * Get default visual state
   * @private
   */
  _getDefaultVisualState() {
    return {
      radius: VISUAL_CONSTANTS.baseRadius,
      opacity: VISUAL_CONSTANTS.baseOpacity,
      glowIntensity: 0,
      glowColor: '#ffffff',
      scale: 1.0
    };
  }

  /**
   * Find node by ID (helper)
   * @private
   */
  _findNodeById(nodeId) {
    // This would need to be provided by the graph data store
    // For now, return null
    return null;
  }

  /**
   * Render nodes
   * @param {Node[]} nodes - Nodes to render
   * @param {SystemState} state - System state
   */
  render(nodes, state) {
    if (!this._nodeGroup || !nodes) return;

    // ✅ VIEWPORT READINESS CHECK: Skip if container not measurable
    const containerRect = this._svg?.getBoundingClientRect();
    if (!containerRect || containerRect.width < 2 || containerRect.height < 2) {
      // Container not ready - skip render without logging spam
      return;
    }

    // Update viewport dimensions from actual container
    this._viewport = {
      width: containerRect.width,
      height: containerRect.height
    };

    // ✅ PERFORMANCE: Only render if active OR if this is a forced render
    // Skip continuous rendering when idle to reduce CPU usage
    const forceRender = state?.forceRender || false;
    if (!forceRender && window.AnimationLifecycle && !window.AnimationLifecycle.isActive()) {
      return;
    }

    // Apply spatial culling
    let visibleNodes = this._cullOffscreenNodes(nodes);

    // Apply tier visibility filtering (mobile-only)
    // Feature flag: localStorage["ie_unified_mobile_tiers"] = "true"
    const tierFlagEnabled = localStorage.getItem('ie_unified_mobile_tiers') === 'true';
    if (tierFlagEnabled) {
      // Filter by _tierVisible flag if set (from applyTier() method)
      const hasTierFlags = visibleNodes.some(n => typeof n._tierVisible === 'boolean');
      if (hasTierFlags) {
        const beforeCount = visibleNodes.length;
        visibleNodes = visibleNodes.filter(n => n._tierVisible !== false);
        const afterCount = visibleNodes.length;

        // Throttled logging (only log if count changed, max once per 2s)
        if (beforeCount !== afterCount && Date.now() - this._lastTierLogTime > 2000) {
          console.log(`🎨 Tier filter: ${afterCount}/${beforeCount} nodes visible`);
          this._lastTierLogTime = Date.now();
        }
      }
    }

    // Bind data
    const nodeSelection = this._nodeGroup
      .selectAll('.node')
      .data(visibleNodes, d => d.id);

    // Enter
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-node-id', d => d.id);

    // Add circle
    nodeEnter.append('circle')
      .attr('class', 'node-circle');

    // Add glow filter
    nodeEnter.append('circle')
      .attr('class', 'node-glow')
      .attr('filter', 'url(#glow)');

    // Add image or text
    nodeEnter.append('image')
      .attr('class', 'node-image')
      .attr('xlink:href', d => d.imageUrl || '')
      .attr('clip-path', 'circle()');

    // Merge enter + update
    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Update positions with GPU acceleration (CSS transforms)
    nodeMerge.each((d, i, nodes) => {
      const element = nodes[i];
      const visualState = this.getVisualState(d, state);
      
      // Use CSS transform for GPU acceleration
      element.style.transform = `translate(${d.x}px, ${d.y}px) scale(${visualState.scale})`;
      element.style.opacity = visualState.opacity;
    });

    // Update visual properties
    nodeMerge.select('.node-circle')
      .attr('r', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.radius;
      })
      .attr('fill', d => d.color || '#4488ff')
      .attr('stroke', d => d.isGuided ? '#00ffff' : '#ffffff')
      .attr('stroke-width', d => d.isGuided ? 3 : 1);

    // Update glow
    nodeMerge.select('.node-glow')
      .attr('r', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.radius * 1.2;
      })
      .attr('fill', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.glowColor;
      })
      .attr('opacity', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.glowIntensity;
      });

    // Update image
    nodeMerge.select('.node-image')
      .attr('x', d => {
        const visualState = this.getVisualState(d, state);
        return -visualState.radius;
      })
      .attr('y', d => {
        const visualState = this.getVisualState(d, state);
        return -visualState.radius;
      })
      .attr('width', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.radius * 2;
      })
      .attr('height', d => {
        const visualState = this.getVisualState(d, state);
        return visualState.radius * 2;
      });

    // Exit
    nodeSelection.exit().remove();

    // ✅ THROTTLED LOGGING: Only log when debug mode enabled or significant change
    this._logRenderStats(visibleNodes.length, nodes.length);
  }

  /**
   * Update visual state for a single node
   * @param {string} nodeId - Node ID
   * @param {VisualState} visualState - Visual state
   */
  updateNodeVisual(nodeId, visualState) {
    if (!this._nodeGroup) return;

    const nodeElement = this._nodeGroup.select(`[data-node-id="${nodeId}"]`);
    if (nodeElement.empty()) return;

    // Update transform
    nodeElement.style('transform', `scale(${visualState.scale})`);
    nodeElement.style('opacity', visualState.opacity);

    // Update circle
    nodeElement.select('.node-circle')
      .attr('r', visualState.radius);

    // Update glow
    nodeElement.select('.node-glow')
      .attr('r', visualState.radius * 1.2)
      .attr('fill', visualState.glowColor)
      .attr('opacity', visualState.glowIntensity);
  }

  /**
   * Apply distance-based dimming for focused nodes
   * @param {Node[]} nodes - All nodes
   * @param {string} focusedNodeId - Focused node ID
   */
  applyFocusDimming(nodes, focusedNodeId) {
    if (!focusedNodeId || !nodes) return;

    const focusedNode = nodes.find(n => n.id === focusedNodeId);
    if (!focusedNode) return;

    nodes.forEach(node => {
      if (node.id === focusedNodeId) return;

      const distance = Math.hypot(
        node.x - focusedNode.x,
        node.y - focusedNode.y
      );

      const maxDistance = VISUAL_CONSTANTS.maxDistance;
      const dimFactor = Math.min(1, distance / maxDistance);
      const opacity = VISUAL_CONSTANTS.dimmedOpacity + (0.7 * (1 - dimFactor));

      const nodeElement = this._nodeGroup.select(`[data-node-id="${node.id}"]`);
      if (!nodeElement.empty()) {
        nodeElement.style('opacity', opacity);
      }
    });
  }

  /**
   * Cull off-screen nodes for performance
   * @param {Node[]} nodes - All nodes
   * @returns {Node[]} Visible nodes
   * @private
   */
  _cullOffscreenNodes(nodes) {
    if (!nodes || !Array.isArray(nodes)) return [];

    // ✅ DISABLE CULLING: For now, render all nodes to avoid coordinate space issues
    // The real issue is that nodes are in world space but culling uses viewport space
    // Without proper transform tracking, culling will incorrectly hide visible nodes
    // TODO: Implement proper world-to-screen coordinate transformation for culling
    return nodes.filter(node => {
      // Only filter out nodes with invalid positions
      return node.x !== undefined && 
             node.y !== undefined && 
             !isNaN(node.x) && 
             !isNaN(node.y) &&
             isFinite(node.x) &&
             isFinite(node.y);
    });
  }

  /**
   * Log render statistics (throttled)
   * @param {number} visibleCount - Number of visible nodes
   * @param {number} totalCount - Total number of nodes
   * @private
   */
  _logRenderStats(visibleCount, totalCount) {
    const now = Date.now();
    const timeSinceLastLog = now - this._lastLogTime;
    
    // Check if debug mode is enabled
    const debugMode = window.location.search.includes('debug=1') || 
                     window.localStorage.getItem('debug_mode') === 'true';
    
    // Only log if:
    // 1. Debug mode is enabled, OR
    // 2. Significant change in visible nodes (>10% difference), OR
    // 3. Enough time has passed since last log (throttle)
    const significantChange = Math.abs(visibleCount - this._lastLoggedVisible) > (totalCount * 0.1);
    const shouldLog = debugMode || significantChange || timeSinceLastLog > this._logThrottleMs;
    
    if (shouldLog) {
      const culledCount = totalCount - visibleCount;
      
      // Only log if there are actually nodes to render
      if (totalCount > 0) {
        if (visibleCount === 0 && culledCount > 0) {
          console.warn(`⚠️ Rendered 0 nodes (${culledCount} culled) - possible viewport/transform issue`);
        } else {
          console.log(`🎨 Rendered ${visibleCount} nodes (${culledCount} culled)`);
        }
      }
      
      this._lastLogTime = now;
      this._lastLoggedVisible = visibleCount;
      this._lastLoggedTotal = totalCount;
    }
  }

  /**
   * Ensure minimum tap target size
   * @param {Node} node - Node
   * @returns {number} Effective tap radius
   */
  getEffectiveTapRadius(node) {
    const visualState = this.getVisualState(node, null);
    const visualRadius = visualState.radius;
    const minRadius = MOBILE_CONSTANTS.minTapSize / 2;
    
    return Math.max(minRadius, visualRadius);
  }

  /**
   * Check if point is within node tap target
   * @param {Node} node - Node
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if within tap target
   */
  isPointInTapTarget(node, x, y) {
    if (!node || node.x === undefined || node.y === undefined) return false;

    const effectiveRadius = this.getEffectiveTapRadius(node);
    const distance = Math.hypot(x - node.x, y - node.y);
    
    return distance <= effectiveRadius;
  }

  /**
   * Setup glow filter definition
   * @param {SVGElement} svg - SVG element
   */
  static setupGlowFilter(svg) {
    const defs = window.d3.select(svg).select('defs');
    if (defs.empty()) {
      window.d3.select(svg).append('defs');
    }

    // Remove existing glow filter
    defs.select('#glow').remove();

    // Create glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    console.log('✨ Glow filter setup complete');
  }

  /**
   * Get viewport dimensions
   * @returns {{width: number, height: number}}
   */
  getViewport() {
    return { ...this._viewport };
  }

  /**
   * Set culling margin
   * @param {number} margin - Margin in pixels
   */
  setCullingMargin(margin) {
    this._cullingMargin = margin;
  }
}

// Create singleton instance
export const nodeRenderer = new NodeRenderer();
