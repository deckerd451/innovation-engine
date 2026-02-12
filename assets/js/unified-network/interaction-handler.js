// assets/js/unified-network/interaction-handler.js
// Interaction Handler for Unified Network Discovery
// Version: 1.0.1 (tap-safe pointer handling + mobile guards)

import { MOBILE_CONSTANTS, ANIMATION_TIMINGS } from "./constants.js";

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

    // Tap / gesture state
    this._lastTapTime = 0;
    this._doubleTapThreshold = 300; // ms
    this._touchStartTime = 0;
    this._touchStartPos = { x: 0, y: 0 };

    // Small tap tolerances
    this._tapMaxDurationMs = 300;
    this._tapMaxMovePx = 10;
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

    this._setupEventListeners();

    console.log("✅ InteractionHandler initialized");
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this._svg || !window.d3) return;

    const svgSelection = window.d3.select(this._svg);

    // Click (desktop)
    svgSelection.on("click", (event) => this._handleClick(event));

    // Touch (mobile)
    if ("ontouchstart" in window) {
      svgSelection.on("touchstart", (event) => this._handleTouchStart(event));
      svgSelection.on("touchend", (event) => this._handleTouchEnd(event));
    }

    // Prevent default context menu on long press / right click
    svgSelection.on("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  /**
   * Convert an event (mouse/touch) into SVG-local coordinates safely.
   * Returns [x, y] or null if coordinates are invalid.
   * @private
   */
  _getPointerInSvg(event) {
    if (!this._svg) return null;

    // Touch events: use changedTouches/touches (do NOT pass TouchEvent to d3.pointer)
    const touch = event?.changedTouches?.[0] || event?.touches?.[0];
    if (touch) {
      const rect = this._svg.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return [x, y];
    }

    // Mouse/Pointer events: safe d3 pointer relative to SVG
    if (window.d3?.pointer) {
      const pt = window.d3.pointer(event, this._svg);
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return null;
      return pt;
    }

    return null;
  }

  /**
   * Centralized interaction time update
   * @private
   */
  _markInteraction() {
    if (this._stateManager?.updateInteractionTime) {
      try {
        this._stateManager.updateInteractionTime();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Handle click event (mouse)
   * @private
   */
  _handleClick(event) {
    const pt = this._getPointerInSvg(event);
    if (!pt) return;

    const [x, y] = pt;
    const node = this._findNodeAtPosition(x, y);

    if (node) {
      this.handleNodeTap(node.id, event);
    } else {
      this.emit("background-clicked", { x, y });
    }

    this._markInteraction();
  }

  /**
   * Handle touch start
   * @private
   */
  _handleTouchStart(event) {
    const t = event?.touches?.[0];
    if (!t) return;

    this._touchStartTime = Date.now();
    this._touchStartPos = {
      x: t.clientX,
      y: t.clientY,
    };
  }

  /**
   * Handle touch end
   * @private
   */
  _handleTouchEnd(event) {
    const touch = event?.changedTouches?.[0];
    if (!touch) return;

    const touchDuration = Date.now() - (this._touchStartTime || 0);

    // Tap detection: short duration + minimal movement
    const dx = touch.clientX - (this._touchStartPos?.x ?? touch.clientX);
    const dy = touch.clientY - (this._touchStartPos?.y ?? touch.clientY);
    const distance = Math.sqrt(dx * dx + dy * dy);

    const isTap =
      touchDuration > 0 &&
      touchDuration < this._tapMaxDurationMs &&
      distance < this._tapMaxMovePx;

    if (!isTap) return;

    // Treat tap like a click at the touch location (but DO NOT call d3.pointer with TouchEvent)
    const pt = this._getPointerInSvg(event);
    if (!pt) return;

    const [x, y] = pt;
    const node = this._findNodeAtPosition(x, y);

    if (node) {
      this.handleNodeTap(node.id, event);
    } else {
      this.emit("background-clicked", { x, y });
    }

    this._markInteraction();
  }

  /**
   * Find node at position
   * @private
   */
  _findNodeAtPosition(x, y) {
    // NOTE: this file currently does not own the nodes array.
    // Return null to indicate "no node found" unless you wire in hit-testing.
    // The important part is: x/y are now guaranteed finite when this is called.
    return null;
  }

  /**
   * Handle node tap
   * @param {string} nodeId - Node ID
   * @param {Event} event - Event object
   */
  handleNodeTap(nodeId, event) {
    console.log(`👆 Node tapped: ${nodeId}`);

    this.provideHapticFeedback();

    const now = Date.now();
    const isDoubleTap = now - this._lastTapTime < this._doubleTapThreshold;
    this._lastTapTime = now;

    this.emit("node-tapped", {
      nodeId,
      isDoubleTap,
      event,
    });

    this._markInteraction();
  }

  /**
   * Handle node dismiss
   * @param {string} nodeId - Node ID
   */
  handleNodeDismiss(nodeId) {
    console.log(`❌ Node dismissed: ${nodeId}`);

    this.provideHapticFeedback();
    this.emit("node-dismissed", { nodeId });

    this._markInteraction();
  }

  /**
   * Provide haptic feedback (mobile)
   */
  provideHapticFeedback() {
    if (!("vibrate" in navigator)) return;

    try {
      navigator.vibrate(MOBILE_CONSTANTS?.hapticDuration ?? 10);
    } catch {
      // ignore
    }
  }

  /**
   * Present action for guided node
   * @param {Node} node - Node
   * @returns {string|null} Action type
   */
  presentAction(node) {
    if (!node) return null;

    if (node.type === "person") {
      return node.isMyNetwork ? "view-profile" : "connect";
    }
    if (node.type === "project") {
      return node.isMyNetwork ? "view-project" : "join-project";
    }
    if (node.type === "theme") return "explore-theme";
    if (node.type === "organization") return "view-organization";

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
      connect: "Connect",
      "join-project": "Join Project",
      "explore-theme": "Explore Theme",
      "view-profile": "View Profile",
      "view-project": "View Project",
      "view-organization": "View Organization",
    };

    return labels[action] || "View";
  }

  /**
   * Check if node is in thumb-reachable zone
   * @param {Node} node - Node
   * @returns {boolean}
   */
  isInThumbReachableZone(node) {
    if (!node || node.y === undefined) return false;

    const viewportHeight = window.innerHeight || 0;
    const thumbPct = MOBILE_CONSTANTS?.thumbReachablePercent ?? 0.35;
    const thumbZoneTop = viewportHeight * (1 - thumbPct);

    return node.y >= thumbZoneTop;
  }

  /**
   * Get nodes in thumb-reachable zone
   * @param {Node[]} nodes - All nodes
   * @returns {Node[]} Nodes in thumb zone
   */
  getNodesInThumbZone(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.filter((node) => this.isInThumbReachableZone(node));
  }

  /**
   * Prioritize actionable nodes by effectivePull
   * @param {Node[]} nodes - Nodes to prioritize
   * @returns {Node[]} Sorted nodes
   */
  prioritizeActionableNodes(nodes) {
    if (!Array.isArray(nodes)) return [];

    return [...nodes]
      .filter((node) => Number(node.effectivePull) >= 0.6)
      .sort((a, b) => Number(b.effectivePull) - Number(a.effectivePull));
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

    this.emit("action-menu-requested", {
      node,
      action,
      label,
      position: { x, y },
    });
  }

  /**
   * Hide action menu
   */
  hideActionMenu() {
    this.emit("action-menu-hidden");
  }

  /**
   * Execute action on node
   * @param {Node} node - Node
   * @param {string} action - Action type
   */
  async executeAction(node, action) {
    if (!node || !action) return;

    console.log(`⚡ Executing action: ${action} on node ${node.id}`);

    this.emit("action-executing", { node, action });

    try {
      this.emit(`action-${action}`, { node });
      this.provideHapticFeedback();

      console.log(`✅ Action completed: ${action}`);
      this.emit("action-completed", { node, action });
    } catch (error) {
      console.error(`❌ Action failed: ${action}`, error);
      this.emit("action-failed", { node, action, error });
    }
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, []);
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
    const idx = handlers.indexOf(handler);
    if (idx > -1) handlers.splice(idx, 1);
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
    handlers.forEach((handler) => {
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
    if (this._svg && window.d3) {
      const svgSelection = window.d3.select(this._svg);
      svgSelection.on("click", null);
      svgSelection.on("touchstart", null);
      svgSelection.on("touchend", null);
      svgSelection.on("contextmenu", null);
    }

    this._eventHandlers.clear();
    console.log("🧹 InteractionHandler destroyed");
  }
}

/**
 * Action Types
 */
export const ActionType = {
  Connect: "connect",
  JoinProject: "join-project",
  ExploreTheme: "explore-theme",
  ViewProfile: "view-profile",
  ViewProject: "view-project",
  ViewOrganization: "view-organization",
  Dismiss: "dismiss",
};

// Create singleton instance
export const interactionHandler = new InteractionHandler();
