/**
 * Discovery Trigger Manager
 * 
 * Manages when and how often discovery mode activates based on:
 * - Momentum detection (low velocity)
 * - Strong action absence (no high effectivePull nodes)
 * - Relevant presence (high presenceEnergy)
 * - Temporal opportunities (deadlines, active collaboration)
 * - Rate limiting and adaptive frequency
 * 
 * Requirements: 3.1, 3.2, 3.3, 10.5, 12.3, 12.4, 12.5, 13.1
 */

import { DISCOVERY_TRIGGERS, DISCOVERY_FREQUENCY } from './constants.js';
import { logger } from '../logger.js';

export class DiscoveryTriggerManager {
  constructor(stateManager, graphDataStore, presenceTracker) {
    this.stateManager = stateManager;
    this.graphDataStore = graphDataStore;
    this.presenceTracker = presenceTracker;
    
    // Trigger state
    this.lastDiscoveryTime = 0;
    this.lowMomentumStartTime = null;
    this.lastInteractionTime = Date.now();
    this.userPreferences = {
      frequency: 'normal', // 'low', 'normal', 'high', 'off'
      enabled: true
    };
    
    // Monitoring intervals
    this.checkInterval = null;
    
    logger.info('DiscoveryTriggerManager', 'Initialized');
  }
  
  /**
   * Start monitoring for discovery triggers
   */
  start() {
    if (this.checkInterval) return;
    
    // Check for triggers every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkTriggers();
    }, 2000);
    
    logger.debug('DiscoveryTriggerManager', 'Started monitoring');
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.debug('DiscoveryTriggerManager', 'Stopped monitoring');
  }
  
  /**
   * Check all trigger conditions
   */
  checkTriggers() {
    // Skip if discovery is disabled
    if (!this.userPreferences.enabled || this.userPreferences.frequency === 'off') {
      return;
    }
    
    // Skip if already in discovery state
    const currentState = this.stateManager.getState();
    if (currentState === 'discovery' || currentState === 'transitioning') {
      return;
    }
    
    // Check rate limiting
    if (!this.canTriggerDiscovery()) {
      return;
    }
    
    // Check all trigger conditions
    const triggers = {
      momentum: this.checkMomentumTrigger(),
      strongAction: this.checkStrongActionAbsence(),
      presence: this.checkRelevantPresence(),
      temporal: this.checkTemporalOpportunities(),
      inactivity: this.checkInactivityTrigger(),
      smallGraph: this.checkSmallGraphTrigger()
    };
    
    // Log trigger state
    const activeTriggers = Object.entries(triggers)
      .filter(([_, active]) => active)
      .map(([name]) => name);
    
    if (activeTriggers.length > 0) {
      logger.debug('DiscoveryTriggerManager', 'Active triggers', { triggers: activeTriggers });
      
      // Trigger discovery
      this.triggerDiscovery(activeTriggers);
    }
  }
  
  /**
   * Check if enough time has passed since last discovery
   */
  canTriggerDiscovery() {
    const now = Date.now();
    const minInterval = this.getMinimumInterval();
    const timeSinceLastDiscovery = now - this.lastDiscoveryTime;
    
    return timeSinceLastDiscovery >= minInterval;
  }
  
  /**
   * Get minimum interval based on user preferences
   */
  getMinimumInterval() {
    const baseInterval = DISCOVERY_FREQUENCY.RATE_LIMIT_MS; // 2 minutes
    
    switch (this.userPreferences.frequency) {
      case 'low':
        return baseInterval * 2; // 4 minutes
      case 'normal':
        return baseInterval; // 2 minutes
      case 'high':
        return baseInterval * 0.5; // 1 minute
      default:
        return baseInterval;
    }
  }
  
  /**
   * Check momentum trigger: velocity < 0.1 for 5 seconds
   * Requirement 3.1
   */
  checkMomentumTrigger() {
    const nodes = this.graphDataStore.getAllNodes();
    const avgVelocity = this.calculateAverageVelocity(nodes);
    
    const now = Date.now();
    
    if (avgVelocity < DISCOVERY_TRIGGERS.LOW_MOMENTUM_THRESHOLD) {
      if (!this.lowMomentumStartTime) {
        this.lowMomentumStartTime = now;
      }
      
      const lowMomentumDuration = now - this.lowMomentumStartTime;
      return lowMomentumDuration >= DISCOVERY_TRIGGERS.LOW_MOMENTUM_DURATION_MS;
    } else {
      this.lowMomentumStartTime = null;
      return false;
    }
  }
  
  /**
   * Calculate average velocity of all nodes
   */
  calculateAverageVelocity(nodes) {
    if (nodes.length === 0) return 0;
    
    const totalVelocity = nodes.reduce((sum, node) => {
      const vx = node.vx || 0;
      const vy = node.vy || 0;
      return sum + Math.sqrt(vx * vx + vy * vy);
    }, 0);
    
    return totalVelocity / nodes.length;
  }
  
  /**
   * Check strong action absence: no nodes with effectivePull > 0.7
   * Requirement 3.2
   */
  checkStrongActionAbsence() {
    const nodes = this.graphDataStore.getAllNodes();
    const hasStrongAction = nodes.some(node => 
      node.effectivePull > DISCOVERY_TRIGGERS.STRONG_ACTION_THRESHOLD
    );
    
    return !hasStrongAction;
  }
  
  /**
   * Check relevant presence: any node with presenceEnergy > 0.6
   * Requirement 3.3
   */
  checkRelevantPresence() {
    const nodes = this.graphDataStore.getAllNodes();
    const hasRelevantPresence = nodes.some(node =>
      node.presenceEnergy > DISCOVERY_TRIGGERS.RELEVANT_PRESENCE_THRESHOLD
    );
    
    return hasRelevantPresence;
  }
  
  /**
   * Check temporal opportunities: deadlines within 48 hours
   * Requirement 13.1
   */
  checkTemporalOpportunities() {
    const nodes = this.graphDataStore.getAllNodes();
    const now = Date.now();
    
    const hasTemporalOpportunity = nodes.some(node => {
      if (!node.deadline) return false;
      
      const deadline = new Date(node.deadline).getTime();
      const timeUntilDeadline = deadline - now;
      
      return timeUntilDeadline > 0 && 
             timeUntilDeadline <= DISCOVERY_TRIGGERS.TEMPORAL_WINDOW_MS;
    });
    
    return hasTemporalOpportunity;
  }
  
  /**
   * Check inactivity trigger: 30+ minutes without new connections
   * Requirement 12.4
   */
  checkInactivityTrigger() {
    const now = Date.now();
    const timeSinceInteraction = now - this.lastInteractionTime;
    
    return timeSinceInteraction >= DISCOVERY_FREQUENCY.INACTIVITY_THRESHOLD_MS;
  }
  
  /**
   * Check small graph trigger: < 5 nodes increases frequency
   * Requirement 12.3
   */
  checkSmallGraphTrigger() {
    const nodes = this.graphDataStore.getAllNodes();
    const isSmallGraph = nodes.length < DISCOVERY_FREQUENCY.SMALL_GRAPH_THRESHOLD;
    
    if (!isSmallGraph) return false;
    
    // For small graphs, use a shorter interval
    const now = Date.now();
    const timeSinceLastDiscovery = now - this.lastDiscoveryTime;
    const smallGraphInterval = this.getMinimumInterval() * 0.5;
    
    return timeSinceLastDiscovery >= smallGraphInterval;
  }
  
  /**
   * Trigger discovery mode
   */
  triggerDiscovery(reasons) {
    logger.info('DiscoveryTriggerManager', 'Triggering discovery', { reasons });
    
    this.lastDiscoveryTime = Date.now();
    
    // Emit event with trigger reasons
    this.emit('discovery-triggered', { reasons, timestamp: Date.now() });
    
    // Request state transition
    this.stateManager.requestTransition('discovery', {
      trigger: 'automatic',
      reasons
    });
  }
  
  /**
   * Record user interaction (resets inactivity timer)
   */
  recordInteraction() {
    this.lastInteractionTime = Date.now();
    this.lowMomentumStartTime = null; // Reset momentum timer
  }
  
  /**
   * Set user preferences for discovery frequency
   * Requirement 10.5
   */
  setPreferences(preferences) {
    this.userPreferences = {
      ...this.userPreferences,
      ...preferences
    };
    
    logger.info('DiscoveryTriggerManager', 'Updated preferences', this.userPreferences);
    this.emit('preferences-updated', this.userPreferences);
  }
  
  /**
   * Get current preferences
   */
  getPreferences() {
    return { ...this.userPreferences };
  }
  
  /**
   * Force trigger discovery (for manual activation)
   */
  forceDiscovery() {
    logger.info('DiscoveryTriggerManager', 'Manual discovery trigger');
    this.triggerDiscovery(['manual']);
  }
  
  /**
   * Event system
   */
  on(event, handler) {
    if (!this.eventHandlers) this.eventHandlers = {};
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }
  
  off(event, handler) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
  }
  
  emit(event, data) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event].forEach(handler => handler(data));
  }
  
  /**
   * Cleanup
   */
  destroy() {
    this.stop();
    this.eventHandlers = {};
    logger.info('DiscoveryTriggerManager', 'Destroyed');
  }
}
