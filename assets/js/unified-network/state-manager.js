// assets/js/unified-network/state-manager.js
// State Manager for Unified Network Discovery
// Version: 1.0.0

import { SystemMode } from './types.js';
import { 
  MOTION_THRESHOLDS,
  DISCOVERY_LIMITS,
  PRESENCE_THRESHOLDS,
  PERFORMANCE_CONSTANTS 
} from './constants.js';

/**
 * State Manager
 * Manages system state transitions between My Network and Discovery
 */
export class StateManager {
  constructor() {
    this._state = {
      mode: SystemMode.MyNetwork,
      currentFocusedNodeId: null,
      isDefaultUserFocus: true,
      guidedNodes: [],
      presenceAmplifiedNode: null,
      lastInteractionTime: new Date(),
      averageVelocity: 0,
      isCalm: true,
      fps: PERFORMANCE_CONSTANTS.activeFPS,
      visibleNodeCount: 0
    };

    this._eventHandlers = new Map();
    this._lastTransitionTime = Date.now();
  }

  /**
   * Initialize state manager
   * @param {Object} config - Configuration options
   */
  initialize(config = {}) {
    console.log('🎯 Initializing StateManager');

    // Apply config overrides
    if (config.initialMode) {
      this._state.mode = config.initialMode;
    }

    console.log('✅ StateManager initialized');
    this.emit('initialized', this._state);
  }

  /**
   * Get current system state
   * @returns {SystemState}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Get current mode
   * @returns {string} Current mode
   */
  getMode() {
    return this._state.mode;
  }

  /**
   * Check if should transition to Discovery state
   * @param {Node[]} nodes - All nodes
   * @returns {boolean}
   */
  shouldTransitionToDiscovery(nodes) {
    // Don't transition if already in discovery or transitioning
    if (this._state.mode !== SystemMode.MyNetwork) {
      return false;
    }

    // Check rate limiting (minimum 2 minutes between transitions)
    const timeSinceLastTransition = Date.now() - this._lastTransitionTime;
    if (timeSinceLastTransition < DISCOVERY_LIMITS.minTransitionInterval) {
      return false;
    }

    // Check momentum
    const hasLowMomentum = this._checkLowMomentum();

    // Check for strong next action
    const hasStrongNextAction = this._checkStrongNextAction(nodes);

    // Check for relevant presence
    const hasRelevantPresence = this._checkRelevantPresence(nodes);

    // Check temporal opportunities
    const hasTemporalOpportunity = this._checkTemporalOpportunity(nodes);

    // Transition if:
    // (low momentum OR no strong action) AND (relevant presence OR temporal opportunity)
    const shouldTransition = 
      (hasLowMomentum || !hasStrongNextAction) && 
      (hasRelevantPresence || hasTemporalOpportunity);

    if (shouldTransition) {
      console.log('🔍 Discovery transition conditions met:', {
        hasLowMomentum,
        hasStrongNextAction,
        hasRelevantPresence,
        hasTemporalOpportunity
      });
    }

    return shouldTransition;
  }

  /**
   * Check if has low momentum
   * @private
   */
  _checkLowMomentum() {
    const timeSinceInteraction = Date.now() - this._state.lastInteractionTime.getTime();
    return (
      this._state.averageVelocity < MOTION_THRESHOLDS.lowMomentum &&
      timeSinceInteraction > 5000 // 5 seconds
    );
  }

  /**
   * Check if has strong next action
   * @private
   */
  _checkStrongNextAction(nodes) {
    return nodes.some(node => 
      node.effectivePull > MOTION_THRESHOLDS.strongAction
    );
  }

  /**
   * Check if has relevant presence
   * @private
   */
  _checkRelevantPresence(nodes) {
    return nodes.some(node => 
      !node.isMyNetwork && 
      node.presenceEnergy > PRESENCE_THRESHOLDS.relevant
    );
  }

  /**
   * Check if has temporal opportunity
   * @private
   */
  _checkTemporalOpportunity(nodes) {
    return nodes.some(node => 
      !node.isMyNetwork && 
      (node.deadline || node.activeCollaboration)
    );
  }

  /**
   * Check if should transition to My Network state
   * @param {Node[]} nodes - All nodes
   * @returns {boolean}
   */
  shouldTransitionToMyNetwork(nodes) {
    // Don't transition if already in my network or transitioning
    if (this._state.mode !== SystemMode.Discovery) {
      return false;
    }

    // User interaction resets to My Network
    const timeSinceInteraction = Date.now() - this._state.lastInteractionTime.getTime();
    const recentInteraction = timeSinceInteraction < 3000; // 3 seconds

    // All guided nodes faded
    const allGuidedNodesFaded = this._state.guidedNodes.every(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return !node || node.effectivePull < 0.3;
    });

    // No presence energy
    const noPresenceEnergy = nodes.every(n => n.presenceEnergy === 0);

    const shouldTransition = recentInteraction || (allGuidedNodesFaded && noPresenceEnergy);

    if (shouldTransition) {
      console.log('🏠 My Network transition conditions met:', {
        recentInteraction,
        allGuidedNodesFaded,
        noPresenceEnergy
      });
    }

    return shouldTransition;
  }

  /**
   * Transition to Discovery state
   */
  transitionToDiscovery() {
    if (this._state.mode === SystemMode.Discovery) {
      console.warn('Already in Discovery mode');
      return;
    }

    const currentFocus = this._state.currentFocusedNodeId;
    console.log('🔍 Transitioning to Discovery state',
      currentFocus ? `(preserving focus: ${currentFocus})` : '(no focus)');

    this._state.mode = SystemMode.Transitioning;
    this.emit('mode-changing', { from: SystemMode.MyNetwork, to: SystemMode.Discovery });

    // Simulate transition delay
    setTimeout(() => {
      this._state.mode = SystemMode.Discovery;
      this._lastTransitionTime = Date.now();
      this.emit('mode-changed', { mode: SystemMode.Discovery });

      // ✅ Log focus preservation
      if (this._state.currentFocusedNodeId) {
        console.log(`✅ Transitioned to Discovery (focus preserved: ${this._state.currentFocusedNodeId})`);
      } else {
        console.log('✅ Transitioned to Discovery state');
      }
    }, 100);
  }

  /**
   * Transition to My Network state
   */
  transitionToMyNetwork() {
    if (this._state.mode === SystemMode.MyNetwork) {
      console.warn('Already in My Network mode');
      return;
    }

    const currentFocus = this._state.currentFocusedNodeId;
    console.log('🏠 Transitioning to My Network state',
      currentFocus ? `(preserving focus: ${currentFocus})` : '(no focus)');

    this._state.mode = SystemMode.Transitioning;
    this.emit('mode-changing', { from: SystemMode.Discovery, to: SystemMode.MyNetwork });

    // Clear guided nodes
    this._state.guidedNodes = [];
    this._state.presenceAmplifiedNode = null;

    // Simulate transition delay
    setTimeout(() => {
      this._state.mode = SystemMode.MyNetwork;
      this._lastTransitionTime = Date.now();
      this.emit('mode-changed', { mode: SystemMode.MyNetwork });

      // ✅ Log focus preservation
      if (this._state.currentFocusedNodeId) {
        console.log(`✅ Transitioned to My Network (focus preserved: ${this._state.currentFocusedNodeId})`);
      } else {
        console.log('✅ Transitioned to My Network state');
      }
    }, 100);
  }

  /**
   * Update guided nodes
   * Enforces max 3 guided nodes and max 1 presence-amplified
   * @param {Node[]} nodes - All nodes
   */
  updateGuidedNodes(nodes) {
    if (this._state.mode !== SystemMode.Discovery) {
      return;
    }

    // Find actionable nodes (effectivePull >= 0.6)
    const actionableNodes = nodes
      .filter(node => node.effectivePull >= 0.6 && !node.isMyNetwork)
      .sort((a, b) => b.effectivePull - a.effectivePull);

    // Select top 3 as guided nodes
    const newGuidedNodes = actionableNodes
      .slice(0, DISCOVERY_LIMITS.maxGuidedNodes)
      .map(node => node.id);

    // Find presence-amplified node (presenceEnergy > 0.8)
    const presenceAmplifiedNodes = actionableNodes
      .filter(node => node.presenceEnergy > PRESENCE_THRESHOLDS.amplified);

    const newPresenceAmplified = presenceAmplifiedNodes.length > 0 
      ? presenceAmplifiedNodes[0].id 
      : null;

    // Update state
    const guidedChanged = JSON.stringify(this._state.guidedNodes) !== JSON.stringify(newGuidedNodes);
    const presenceChanged = this._state.presenceAmplifiedNode !== newPresenceAmplified;

    if (guidedChanged || presenceChanged) {
      this._state.guidedNodes = newGuidedNodes;
      this._state.presenceAmplifiedNode = newPresenceAmplified;

      this.emit('guided-nodes-updated', {
        guidedNodes: newGuidedNodes,
        presenceAmplifiedNode: newPresenceAmplified
      });

      console.log('📍 Guided nodes updated:', {
        count: newGuidedNodes.length,
        hasPresenceAmplified: !!newPresenceAmplified
      });
    }
  }

  /**
   * Update last interaction time
   */
  updateInteractionTime() {
    this._state.lastInteractionTime = new Date();
    this.emit('interaction', { time: this._state.lastInteractionTime });
  }

  /**
   * Update average velocity
   * @param {number} velocity - Average velocity
   */
  updateAverageVelocity(velocity) {
    this._state.averageVelocity = velocity;

    // Check if should enter calm state
    const shouldBeCalm = velocity < MOTION_THRESHOLDS.nearZero;
    if (shouldBeCalm !== this._state.isCalm) {
      this.setCalm(shouldBeCalm);
    }
  }

  /**
   * Set calm state
   * @param {boolean} isCalm - Is calm
   */
  setCalm(isCalm) {
    if (this._state.isCalm === isCalm) return;

    this._state.isCalm = isCalm;

    // Adjust FPS based on calm state
    const newFPS = isCalm 
      ? PERFORMANCE_CONSTANTS.calmFPS 
      : PERFORMANCE_CONSTANTS.activeFPS;

    if (this._state.fps !== newFPS) {
      this._state.fps = newFPS;
      this.emit('fps-changed', { fps: newFPS, isCalm });
    }

    this.emit('calm-state-changed', { isCalm });
    console.log(isCalm ? '😌 Entered calm state' : '⚡ Exited calm state');
  }

  /**
   * Set focused node
   * @param {string|null} nodeId - Node ID or null
   */
  setFocusedNode(nodeId) {
    if (this._state.currentFocusedNodeId === nodeId) return;

    const previousNodeId = this._state.currentFocusedNodeId;
    this._state.currentFocusedNodeId = nodeId;
    this._state.isDefaultUserFocus = false;

    // ✅ Guarded logging: Track focus changes
    if (nodeId) {
      console.log(`🎯 [StateManager] Focus SET: ${nodeId} (was: ${previousNodeId || 'none'})`);
    } else {
      console.log(`🔄 [StateManager] Focus CLEARED (was: ${previousNodeId || 'none'})`);
    }

    this.emit('focus-changed', {
      nodeId,
      previousNodeId,
      isDefaultUserFocus: false
    });
  }

  /**
   * Reset to default user focus
   */
  resetToDefaultUserFocus() {
    this._state.currentFocusedNodeId = null;
    this._state.isDefaultUserFocus = true;

    this.emit('focus-changed', { 
      nodeId: null, 
      isDefaultUserFocus: true 
    });
  }

  /**
   * Update visible node count
   * @param {number} count - Visible node count
   */
  updateVisibleNodeCount(count) {
    this._state.visibleNodeCount = count;
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
        console.error(`Error in StateManager event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Get state statistics
   * @returns {Object} State stats
   */
  getStats() {
    return {
      mode: this._state.mode,
      guidedNodeCount: this._state.guidedNodes.length,
      hasPresenceAmplified: !!this._state.presenceAmplifiedNode,
      averageVelocity: this._state.averageVelocity,
      isCalm: this._state.isCalm,
      fps: this._state.fps,
      timeSinceLastInteraction: Date.now() - this._state.lastInteractionTime.getTime(),
      timeSinceLastTransition: Date.now() - this._lastTransitionTime
    };
  }
}

// Create singleton instance
export const stateManager = new StateManager();
