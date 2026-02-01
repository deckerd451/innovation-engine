// assets/js/unified-network/guided-node-decay.js
// Guided Node Decay System for Unified Network Discovery
// Version: 1.0.0

import { ANIMATION_TIMINGS } from './constants.js';

/**
 * Guided Node Decay Manager
 * Handles natural decay of ignored guided nodes
 * 
 * Responsibilities:
 * - Track time since node became guided
 * - Apply time-based effectivePull decay (0.1 per second after 30s)
 * - Trigger fade-out animation when effectivePull < 0.3
 * - Track dismissal cooldown (24 hours)
 * - Manage reintroduction logic (only if score increases > 0.3)
 */
export class GuidedNodeDecay {
  constructor() {
    this._guidedNodeTimestamps = new Map(); // nodeId -> timestamp when became guided
    this._dismissedNodes = new Map(); // nodeId -> dismissal timestamp
    this._decayIntervals = new Map(); // nodeId -> interval ID
    this._eventHandlers = new Map();
    
    // Configuration
    this._decayStartDelay = 30000; // 30 seconds before decay starts
    this._decayRate = 0.1; // effectivePull reduction per second
    this._decayInterval = 1000; // Check every second
    this._fadeThreshold = 0.3; // Fade when effectivePull < 0.3
    this._dismissalCooldown = 24 * 60 * 60 * 1000; // 24 hours
    this._reintroductionThreshold = 0.3; // Score must increase by this much
  }

  /**
   * Initialize decay manager
   * @param {AnimationEngine} animationEngine - Animation engine instance
   * @param {EffectivePullCalculator} effectivePullCalculator - effectivePull calculator
   */
  initialize(animationEngine, effectivePullCalculator) {
    this._animationEngine = animationEngine;
    this._effectivePullCalculator = effectivePullCalculator;
    
    console.log('✅ GuidedNodeDecay initialized');
  }

  /**
   * Register a node as guided
   * @param {string} nodeId - Node ID
   */
  registerGuidedNode(nodeId) {
    if (this._guidedNodeTimestamps.has(nodeId)) {
      return; // Already registered
    }

    const now = Date.now();
    this._guidedNodeTimestamps.set(nodeId, now);

    // Start decay timer
    this._startDecayTimer(nodeId);

    console.log(`📍 Registered guided node: ${nodeId}`);
  }

  /**
   * Unregister a guided node
   * @param {string} nodeId - Node ID
   */
  unregisterGuidedNode(nodeId) {
    this._guidedNodeTimestamps.delete(nodeId);
    this._stopDecayTimer(nodeId);

    console.log(`📍 Unregistered guided node: ${nodeId}`);
  }

  /**
   * Start decay timer for a node
   * @private
   */
  _startDecayTimer(nodeId) {
    // Clear existing timer if any
    this._stopDecayTimer(nodeId);

    // Start new timer
    const intervalId = setInterval(() => {
      this._checkAndApplyDecay(nodeId);
    }, this._decayInterval);

    this._decayIntervals.set(nodeId, intervalId);
  }

  /**
   * Stop decay timer for a node
   * @private
   */
  _stopDecayTimer(nodeId) {
    const intervalId = this._decayIntervals.get(nodeId);
    if (intervalId) {
      clearInterval(intervalId);
      this._decayIntervals.delete(nodeId);
    }
  }

  /**
   * Check and apply decay to a node
   * @private
   */
  _checkAndApplyDecay(nodeId) {
    const timestamp = this._guidedNodeTimestamps.get(nodeId);
    if (!timestamp) {
      this._stopDecayTimer(nodeId);
      return;
    }

    const now = Date.now();
    const elapsed = now - timestamp;

    // Only start decay after delay
    if (elapsed < this._decayStartDelay) {
      return;
    }

    // Calculate decay amount
    const decaySeconds = Math.floor((elapsed - this._decayStartDelay) / 1000);
    const decayAmount = decaySeconds * this._decayRate;

    // Emit decay event
    this.emit('node-decaying', {
      nodeId,
      elapsed,
      decayAmount
    });

    // Check if should fade out
    // Note: The actual effectivePull reduction is handled by the caller
    // This just triggers the fade animation when threshold is reached
  }

  /**
   * Apply decay to node's effectivePull
   * @param {Node} node - Node to decay
   * @returns {number} New effectivePull value
   */
  applyDecay(node) {
    if (!node || !this._guidedNodeTimestamps.has(node.id)) {
      return node.effectivePull;
    }

    const timestamp = this._guidedNodeTimestamps.get(node.id);
    const now = Date.now();
    const elapsed = now - timestamp;

    // Only decay after delay
    if (elapsed < this._decayStartDelay) {
      return node.effectivePull;
    }

    // Calculate decay
    const decaySeconds = Math.floor((elapsed - this._decayStartDelay) / 1000);
    const decayAmount = decaySeconds * this._decayRate;

    // Store original effectivePull if not already stored
    if (!node._originalEffectivePull) {
      node._originalEffectivePull = node.effectivePull;
    }

    // Apply decay
    const newEffectivePull = Math.max(0, node._originalEffectivePull - decayAmount);

    // Check if should trigger fade
    if (newEffectivePull < this._fadeThreshold && node.effectivePull >= this._fadeThreshold) {
      this._triggerFadeOut(node);
    }

    return newEffectivePull;
  }

  /**
   * Trigger fade-out animation for a node
   * @private
   */
  _triggerFadeOut(node) {
    console.log(`🌫️ Fading out node: ${node.id}`);

    // Trigger fade animation
    if (this._animationEngine) {
      this._animationEngine.fadeOut(node, 2000); // 2 second fade
    }

    // Emit fade event
    this.emit('node-fading-out', {
      nodeId: node.id,
      finalEffectivePull: node.effectivePull
    });

    // Unregister after fade completes
    setTimeout(() => {
      this.unregisterGuidedNode(node.id);
      this.emit('node-faded-out', { nodeId: node.id });
    }, 2000);
  }

  /**
   * Dismiss a guided node
   * @param {string} nodeId - Node ID
   * @param {Node} node - Node object
   */
  dismissNode(nodeId, node) {
    console.log(`❌ Dismissing node: ${nodeId}`);

    // Record dismissal
    const now = Date.now();
    this._dismissedNodes.set(nodeId, {
      timestamp: now,
      originalRelevanceScore: node.relevanceScore,
      originalPresenceEnergy: node.presenceEnergy
    });

    // Trigger fade-out
    this._triggerFadeOut(node);

    // Unregister
    this.unregisterGuidedNode(nodeId);

    // Emit dismissal event
    this.emit('node-dismissed', {
      nodeId,
      cooldownUntil: now + this._dismissalCooldown
    });
  }

  /**
   * Check if a node is in dismissal cooldown
   * @param {string} nodeId - Node ID
   * @returns {boolean}
   */
  isInCooldown(nodeId) {
    const dismissal = this._dismissedNodes.get(nodeId);
    if (!dismissal) return false;

    const now = Date.now();
    const cooldownEnd = dismissal.timestamp + this._dismissalCooldown;

    return now < cooldownEnd;
  }

  /**
   * Get remaining cooldown time
   * @param {string} nodeId - Node ID
   * @returns {number} Milliseconds remaining, or 0 if not in cooldown
   */
  getRemainingCooldown(nodeId) {
    const dismissal = this._dismissedNodes.get(nodeId);
    if (!dismissal) return 0;

    const now = Date.now();
    const cooldownEnd = dismissal.timestamp + this._dismissalCooldown;
    const remaining = cooldownEnd - now;

    return Math.max(0, remaining);
  }

  /**
   * Check if a node can be reintroduced
   * @param {string} nodeId - Node ID
   * @param {number} currentRelevanceScore - Current relevance score
   * @param {number} currentPresenceEnergy - Current presence energy
   * @returns {boolean}
   */
  canReintroduce(nodeId, currentRelevanceScore, currentPresenceEnergy) {
    // Not dismissed, can introduce
    if (!this._dismissedNodes.has(nodeId)) {
      return true;
    }

    // Check cooldown
    if (this.isInCooldown(nodeId)) {
      const dismissal = this._dismissedNodes.get(nodeId);
      
      // Calculate score increase
      const relevanceIncrease = currentRelevanceScore - dismissal.originalRelevanceScore;
      const presenceIncrease = currentPresenceEnergy - dismissal.originalPresenceEnergy;
      const maxIncrease = Math.max(relevanceIncrease, presenceIncrease);

      // Can reintroduce if score increased significantly
      if (maxIncrease >= this._reintroductionThreshold) {
        console.log(`✅ Node ${nodeId} can be reintroduced (score increased by ${maxIncrease.toFixed(2)})`);
        this._dismissedNodes.delete(nodeId); // Clear dismissal
        return true;
      }

      return false;
    }

    // Cooldown expired
    this._dismissedNodes.delete(nodeId);
    return true;
  }

  /**
   * Update node interaction (resets decay timer)
   * @param {string} nodeId - Node ID
   */
  onNodeInteraction(nodeId) {
    if (this._guidedNodeTimestamps.has(nodeId)) {
      // Reset timestamp
      this._guidedNodeTimestamps.set(nodeId, Date.now());
      
      // Reset original effectivePull
      // This will be handled by the caller updating the node
      
      console.log(`🔄 Reset decay timer for ${nodeId}`);
    }
  }

  /**
   * Get all guided nodes being tracked
   * @returns {string[]} Array of node IDs
   */
  getGuidedNodes() {
    return Array.from(this._guidedNodeTimestamps.keys());
  }

  /**
   * Get all dismissed nodes
   * @returns {Map} Map of nodeId -> dismissal info
   */
  getDismissedNodes() {
    return new Map(this._dismissedNodes);
  }

  /**
   * Clear expired dismissals
   */
  clearExpiredDismissals() {
    const now = Date.now();
    let cleared = 0;

    for (const [nodeId, dismissal] of this._dismissedNodes.entries()) {
      const cooldownEnd = dismissal.timestamp + this._dismissalCooldown;
      if (now >= cooldownEnd) {
        this._dismissedNodes.delete(nodeId);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`🧹 Cleared ${cleared} expired dismissals`);
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
   */
  emit(event, data) {
    if (!this._eventHandlers.has(event)) return;
    
    const handlers = this._eventHandlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup
   */
  cleanup() {
    // Stop all timers
    for (const nodeId of this._decayIntervals.keys()) {
      this._stopDecayTimer(nodeId);
    }

    this._guidedNodeTimestamps.clear();
    this._dismissedNodes.clear();
    this._decayIntervals.clear();
    this._eventHandlers.clear();

    console.log('🧹 GuidedNodeDecay cleaned up');
  }
}

// Create singleton instance
export const guidedNodeDecay = new GuidedNodeDecay();
