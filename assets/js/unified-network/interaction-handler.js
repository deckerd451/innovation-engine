// assets/js/unified-network/interaction-handler.js
// Interaction Handler for Unified Network Discovery
// Version: 1.0.0

import { MOBILE_CONSTANTS, ANIMATION_TIMINGS } from './constants.js';

/**
 * Interaction Handler
 * Handles user interactions with nodes
 */
export class InteractionHandler {
  constructor() {
    this._svg = null;
    this._nodeRenderer = null;
    this._stateManager = null;
    this._eventHandlers = new Map();
    this._lastTapTime = 0;
    this._doubleTapThreshold = 300; // ms
  }

  /**
   * Initialize interaction handler
   * @param {SVGElement} svg - SVG element
   * @param {NodeRenderer} nodeRenderer - Node renderer instance
   * @param {StateManager} stateManager - State manager instance
   */
  initialize(svg, nodeRenderer, stateManager) {
    this._svg = svg;
    this._nodeRenderer = nodeRenderer;
    this._stateManager = stateManager;

    // Setup event listeners
    this._setupEventListeners();

    console.log('✅ InteractionHandler initialized');
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this._svg) return;

    // Use D3 for event handling
    const svgSelection = window.d3.select(this._svg);

    // Click/tap events
    svgSelection.on('click', (event) => this._handleClick(event));

    // Touch events for mobile
    if ('ontouchstart' in window) {
      svgSelection.on('touchstart', (event) => this._handleTouchStart(event));
      svgSelection.on('touchend', (event) => this._handleTouchEnd(event));
    }

    // Prevent default context menu on long press
    svgSelection.on('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  /**
   * Handle click event
   * @private
   */
  _handleClick(event) {
    const [x, y] = window.d3.pointer(event);
    const node = this._findNodeAtPosition(x, y);

    if (node) {
      this.handleNodeTap(node.id, event);
    } else {
      // Clicked on empty space
      this.emit('background-clicked', { x, y });
    }

    // Update interaction time in state manager
    if (this._stateManager) {
      this._stateManager.updateInteractionTime();
    }
  }

  /**
   * Handle touch start
   * @private
   */
  _handleTouchStart(event) {
    // Store touch start time for tap detection
    this._touchStartTime = Date.now();
    this._touchStartPos = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }

  /**
   * Handle touch end
   * @private
   */
  _handleTouchEnd(event) {
    const touchDuration = Date.now() - this._touchStartTime;
    const touch = event.changedTouches[0];
    
    // Check if it's a tap (short duration, minimal movement)
    const dx = touch.clientX - this._touchStartPos.x;
    const dy = touch.clientY - this._touchStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (touchDuration < 300 && distance < 10) {
      // It's a tap
      this._handleClick(event);
    }
  }

  /**
   * Find node at position
   * @private
   */
  _findNodeAtPosition(x, y) {
    // This would need access to the nodes array
    // For now, we'll emit an event and let the caller handle it
    return null;
  }

  /**
   * Handle node tap
   * @param {string} nodeId - Node ID
   * @param {Event} event - Event object
   */
  handleNodeTap(nodeId, event) {
    console.log(`👆 Node tapped: ${nodeId}`);

    // Provide haptic feedback
    this.provideHapticFeedback();

    // Check for double tap
    const now = Date.now();
    const isDoubleTap = (now - this._lastTapTime) < this._doubleTapThreshold;
    this._lastTapTime = now;

    // Emit tap event
    this.emit('node-tapped', {
      nodeId,
      isDoubleTap,
      event
    });

    // Update interaction time
    if (this._stateManager) {
      this._stateManager.updateInteractionTime();
    }
  }

  /**
   * Handle node dismiss
   * @param {string} nodeId - Node ID
   */
  handleNodeDismiss(nodeId) {
    console.log(`❌ Node dismissed: ${nodeId}`);

    // Provide haptic feedback
    this.provideHapticFeedback();

    // Emit dismiss event
    this.emit('node-dismissed', { nodeId });

    // Update interaction time
    if (this._stateManager) {
      this._stateManager.updateInteractionTime();
    }
  }

  /**
   * Provide haptic feedback (mobile)
   */
  provideHapticFeedback() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(MOBILE_CONSTANTS.hapticDuration);
      } catch (error) {
        // Silently fail if vibration not supported
      }
    }
  }

  /**
   * Present action for guided node
   * @param {Node} node - Node
   * @returns {string} Action type
   */
  presentAction(node) {
    if (!node) return null;

    // Determine action based on node type and state
    if (node.type === 'person') {
      if (node.isMyNetwork) {
        return 'view-profile';
      } else {
        return 'connect';
      }
    } else if (node.type === 'project') {
      if (node.isMyNetwork) {
        return 'view-project';
      } else {
        return 'join-project';
      }
    } else if (node.type === 'theme') {
      return 'explore-theme';
    } else if (node.type === 'organization') {
      return 'view-organization';
    }

    return null;
  }

  /**
   * Get action label for node
   * @param {Node} node - Node
   * @returns {string} Action label
   */
  getActionLabel(node) {
    const action = this.presentAction(node);

    const labels = {
      'connect': 'Connect',
      'join-project': 'Join Project',
      'explore-theme': 'Explore Theme',
      'view-profile': 'View Profile',
      'view-project': 'View Project',
      'view-organization': 'View Organization'
    };

    return labels[action] || 'View';
  }

  /**
   * Check if node is in thumb-reachable zone
   * @param {Node} node - Node
   * @returns {boolean}
   */
  isInThumbReachableZone(node) {
    if (!node || node.y === undefined) return false;

    const viewportHeight = window.innerHeight;
    const thumbZoneTop = viewportHeight * (1 - MOBILE_CONSTANTS.thumbReachablePercent);

    return node.y >= thumbZoneTop;
  }

  /**
   * Get nodes in thumb-reachable zone
   * @param {Node[]} nodes - All nodes
   * @returns {Node[]} Nodes in thumb zone
   */
  getNodesInThumbZone(nodes) {
    if (!nodes || !Array.isArray(nodes)) return [];

    return nodes.filter(node => this.isInThumbReachableZone(node));
  }

  /**
   * Prioritize actionable nodes by effectivePull
   * @param {Node[]} nodes - Nodes to prioritize
   * @returns {Node[]} Sorted nodes
   */
  prioritizeActionableNodes(nodes) {
    if (!nodes || !Array.isArray(nodes)) return [];

    return [...nodes]
      .filter(node => node.effectivePull >= 0.6)
      .sort((a, b) => b.effectivePull - a.effectivePull);
  }

  /**
   * Get best actionable node
   * @param {Node[]} nodes - All nodes
   * @returns {Node|null} Best actionable node
   */
  getBestActionableNode(nodes) {
    const thumbZoneNodes = this.getNodesInThumbZone(nodes);
    const actionableNodes = this.prioritizeActionableNodes(thumbZoneNodes);

    return actionableNodes.length > 0 ? actionableNodes[0] : null;
  }

  /**
   * Show action menu for node
   * @param {Node} node - Node
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  showActionMenu(node, x, y) {
    const action = this.presentAction(node);
    const label = this.getActionLabel(node);

    this.emit('action-menu-requested', {
      node,
      action,
      label,
      position: { x, y }
    });
  }

  /**
   * Hide action menu
   */
  hideActionMenu() {
    this.emit('action-menu-hidden');
  }

  /**
   * Execute action on node
   * @param {Node} node - Node
   * @param {string} action - Action type
   */
  async executeAction(node, action) {
    console.log(`⚡ Executing action: ${action} on node ${node.id}`);

    this.emit('action-executing', { node, action });

    try {
      // Emit action-specific event
      this.emit(`action-${action}`, { node });

      // Provide feedback
      this.provideHapticFeedback();

      console.log(`✅ Action completed: ${action}`);
      this.emit('action-completed', { node, action });
    } catch (error) {
      console.error(`❌ Action failed: ${action}`, error);
      this.emit('action-failed', { node, action, error });
    }
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  /**
   * Unregister event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (!this._eventHandlers.has(event)) return;

    const handlers = this._eventHandlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @private
   */
  emit(event, data) {
    if (!this._eventHandlers.has(event)) return;

    const handlers = this._eventHandlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in InteractionHandler event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._svg) {
      const svgSelection = window.d3.select(this._svg);
      svgSelection.on('click', null);
      svgSelection.on('touchstart', null);
      svgSelection.on('touchend', null);
      svgSelection.on('contextmenu', null);
    }

    this._eventHandlers.clear();
    console.log('🧹 InteractionHandler destroyed');
  }
}

/**
 * Action Types
 */
export const ActionType = {
  Connect: 'connect',
  JoinProject: 'join-project',
  ExploreTheme: 'explore-theme',
  ViewProfile: 'view-profile',
  ViewProject: 'view-project',
  ViewOrganization: 'view-organization',
  Dismiss: 'dismiss'
};

// Create singleton instance
export const interactionHandler = new InteractionHandler();
