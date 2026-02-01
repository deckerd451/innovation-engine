/**
 * Temporal Presence Manager
 * 
 * Manages time-sensitive presence boosts and collaborative presence:
 * - Deadline urgency detection (within 48 hours)
 * - Collaborative presence tracking (shared interests)
 * - Collective theme presence (> 3 active participants)
 * - Temporal priority logic (within 0.1 effectivePull)
 * - Immediate decay on expiration
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { PRESENCE_BOOSTS, TEMPORAL_THRESHOLDS } from './constants.js';
import { logger } from '../logger.js';

export class TemporalPresenceManager {
  constructor(graphDataStore, presenceTracker) {
    this.graphDataStore = graphDataStore;
    this.presenceTracker = presenceTracker;
    
    // Temporal boost tracking
    this.temporalBoosts = new Map(); // nodeId -> { boost, expiresAt, reason }
    this.collaborativeBoosts = new Map(); // nodeId -> { boost, reason }
    
    // Monitoring intervals
    this.checkInterval = null;
    this.cleanupInterval = null;
    
    logger.info('TemporalPresenceManager', 'Initialized');
  }
  
  /**
   * Start monitoring for temporal opportunities
   */
  start() {
    if (this.checkInterval) return;
    
    // Check for temporal opportunities every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkTemporalOpportunities();
    }, 30000);
    
    // Cleanup expired boosts every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredBoosts();
    }, 60000);
    
    // Initial check
    this.checkTemporalOpportunities();
    
    logger.debug('TemporalPresenceManager', 'Started monitoring');
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.debug('TemporalPresenceManager', 'Stopped monitoring');
  }
  
  /**
   * Check all temporal opportunities
   */
  checkTemporalOpportunities() {
    const nodes = this.graphDataStore.getAllNodes();
    const now = Date.now();
    
    for (const node of nodes) {
      // Check deadline urgency
      this.checkDeadlineUrgency(node, now);
      
      // Check collaborative presence
      this.checkCollaborativePresence(node);
      
      // Check collective theme presence
      if (node.type === 'theme') {
        this.checkCollectiveThemePresence(node);
      }
    }
  }
  
  /**
   * Check deadline urgency for a node
   * Requirement 13.1: Deadline within 48 hours increases presenceEnergy by 0.5
   */
  checkDeadlineUrgency(node, now) {
    if (!node.deadline) {
      // Remove any existing deadline boost
      if (this.temporalBoosts.has(node.id)) {
        const boost = this.temporalBoosts.get(node.id);
        if (boost.reason === 'deadline') {
          this.removeTemporalBoost(node.id);
        }
      }
      return;
    }
    
    const deadline = new Date(node.deadline).getTime();
    const timeUntilDeadline = deadline - now;
    
    // Check if within 48 hours
    const within48Hours = timeUntilDeadline > 0 && 
                          timeUntilDeadline <= TEMPORAL_THRESHOLDS.deadlineHours * 3600000;
    
    if (within48Hours) {
      // Apply deadline boost
      this.applyTemporalBoost(
        node.id,
        PRESENCE_BOOSTS.deadline,
        deadline,
        'deadline'
      );
    } else if (timeUntilDeadline <= 0) {
      // Deadline expired, remove boost immediately
      this.removeTemporalBoost(node.id);
    }
  }
  
  /**
   * Check collaborative presence
   * Requirement 13.2: Connection actively working on shared interest increases presenceEnergy by 0.4
   */
  checkCollaborativePresence(node) {
    if (node.type !== 'person') return;
    
    // Get user's active interests
    const userInterests = this.getUserActiveInterests();
    
    // Get node's active interests
    const nodeInterests = this.getNodeActiveInterests(node.id);
    
    // Find shared interests
    const sharedInterests = userInterests.filter(interest =>
      nodeInterests.includes(interest)
    );
    
    if (sharedInterests.length > 0) {
      // Apply collaborative boost
      this.applyCollaborativeBoost(
        node.id,
        PRESENCE_BOOSTS.sharedInterest,
        'shared-interest',
        sharedInterests
      );
    } else {
      // Remove collaborative boost if no longer sharing interests
      this.removeCollaborativeBoost(node.id);
    }
  }
  
  /**
   * Check collective theme presence
   * Requirement 13.3: Theme with > 3 active participants increases presenceEnergy by 0.3
   */
  checkCollectiveThemePresence(node) {
    // Get all participants for this theme
    const participants = this.getThemeParticipants(node.id);
    
    // Count active participants (presenceEnergy > 0.5)
    const activeParticipants = participants.filter(participantId => {
      const energy = this.presenceTracker.getEnergy(participantId);
      return energy > 0.5;
    });
    
    if (activeParticipants.length > TEMPORAL_THRESHOLDS.activeParticipants) {
      // Apply collective theme boost
      this.applyCollaborativeBoost(
        node.id,
        PRESENCE_BOOSTS.collectiveTheme,
        'collective-theme',
        { activeCount: activeParticipants.length }
      );
    } else {
      // Remove collective boost if not enough active participants
      this.removeCollaborativeBoost(node.id);
    }
  }
  
  /**
   * Apply temporal boost (with expiration)
   */
  applyTemporalBoost(nodeId, boost, expiresAt, reason) {
    const existing = this.temporalBoosts.get(nodeId);
    
    // Only update if boost changed or doesn't exist
    if (!existing || existing.boost !== boost || existing.expiresAt !== expiresAt) {
      this.temporalBoosts.set(nodeId, { boost, expiresAt, reason });
      
      logger.debug('TemporalPresenceManager', 'Applied temporal boost', {
        nodeId,
        boost,
        reason,
        expiresAt: new Date(expiresAt).toISOString()
      });
      
      this.emit('temporal-boost-applied', { nodeId, boost, expiresAt, reason });
      this.updateNodePresence(nodeId);
    }
  }
  
  /**
   * Remove temporal boost
   */
  removeTemporalBoost(nodeId) {
    if (this.temporalBoosts.has(nodeId)) {
      const boost = this.temporalBoosts.get(nodeId);
      this.temporalBoosts.delete(nodeId);
      
      logger.debug('TemporalPresenceManager', 'Removed temporal boost', {
        nodeId,
        reason: boost.reason
      });
      
      this.emit('temporal-boost-removed', { nodeId, reason: boost.reason });
      this.updateNodePresence(nodeId);
    }
  }
  
  /**
   * Apply collaborative boost (no expiration)
   */
  applyCollaborativeBoost(nodeId, boost, reason, metadata) {
    const existing = this.collaborativeBoosts.get(nodeId);
    
    // Only update if boost changed or doesn't exist
    if (!existing || existing.boost !== boost) {
      this.collaborativeBoosts.set(nodeId, { boost, reason, metadata });
      
      logger.debug('TemporalPresenceManager', 'Applied collaborative boost', {
        nodeId,
        boost,
        reason,
        metadata
      });
      
      this.emit('collaborative-boost-applied', { nodeId, boost, reason, metadata });
      this.updateNodePresence(nodeId);
    }
  }
  
  /**
   * Remove collaborative boost
   */
  removeCollaborativeBoost(nodeId) {
    if (this.collaborativeBoosts.has(nodeId)) {
      const boost = this.collaborativeBoosts.get(nodeId);
      this.collaborativeBoosts.delete(nodeId);
      
      logger.debug('TemporalPresenceManager', 'Removed collaborative boost', {
        nodeId,
        reason: boost.reason
      });
      
      this.emit('collaborative-boost-removed', { nodeId, reason: boost.reason });
      this.updateNodePresence(nodeId);
    }
  }
  
  /**
   * Update node presence with all boosts
   */
  updateNodePresence(nodeId) {
    const node = this.graphDataStore.getNode(nodeId);
    if (!node) return;
    
    // Get base presence energy
    let baseEnergy = this.presenceTracker.getEnergy(nodeId);
    
    // Add temporal boost
    const temporalBoost = this.temporalBoosts.get(nodeId);
    if (temporalBoost) {
      baseEnergy = Math.min(1.0, baseEnergy + temporalBoost.boost);
    }
    
    // Add collaborative boost
    const collaborativeBoost = this.collaborativeBoosts.get(nodeId);
    if (collaborativeBoost) {
      baseEnergy = Math.min(1.0, baseEnergy + collaborativeBoost.boost);
    }
    
    // Update node
    node.presenceEnergy = baseEnergy;
    
    // Recalculate effectivePull
    node.effectivePull = node.relevanceScore * (1 + node.presenceEnergy);
  }
  
  /**
   * Cleanup expired temporal boosts
   */
  cleanupExpiredBoosts() {
    const now = Date.now();
    const expired = [];
    
    for (const [nodeId, boost] of this.temporalBoosts.entries()) {
      if (boost.expiresAt <= now) {
        expired.push(nodeId);
      }
    }
    
    for (const nodeId of expired) {
      this.removeTemporalBoost(nodeId);
    }
    
    if (expired.length > 0) {
      logger.debug('TemporalPresenceManager', 'Cleaned up expired boosts', {
        count: expired.length
      });
    }
  }
  
  /**
   * Check if temporal priority should apply
   * Requirement 13.4: Prioritize temporal over static when effectivePull within 0.1
   */
  shouldPrioritizeTemporal(nodeA, nodeB) {
    const pullDiff = Math.abs(nodeA.effectivePull - nodeB.effectivePull);
    
    if (pullDiff > TEMPORAL_THRESHOLDS.priorityDelta) {
      return false; // Difference too large, use normal priority
    }
    
    // Check if either has temporal boost
    const aHasTemporal = this.temporalBoosts.has(nodeA.id);
    const bHasTemporal = this.temporalBoosts.has(nodeB.id);
    
    if (aHasTemporal && !bHasTemporal) {
      return true; // A should be prioritized
    }
    
    if (bHasTemporal && !aHasTemporal) {
      return false; // B should be prioritized
    }
    
    return false; // No temporal priority
  }
  
  /**
   * Get temporal boost for a node
   */
  getTemporalBoost(nodeId) {
    return this.temporalBoosts.get(nodeId);
  }
  
  /**
   * Get collaborative boost for a node
   */
  getCollaborativeBoost(nodeId) {
    return this.collaborativeBoosts.get(nodeId);
  }
  
  /**
   * Get all boosts for a node
   */
  getAllBoosts(nodeId) {
    return {
      temporal: this.temporalBoosts.get(nodeId),
      collaborative: this.collaborativeBoosts.get(nodeId)
    };
  }
  
  /**
   * Helper: Get user's active interests
   */
  getUserActiveInterests() {
    // TODO: Implement based on user's current activity
    // For now, return empty array
    return [];
  }
  
  /**
   * Helper: Get node's active interests
   */
  getNodeActiveInterests(nodeId) {
    // TODO: Implement based on node's current activity
    // For now, return empty array
    return [];
  }
  
  /**
   * Helper: Get theme participants
   */
  getThemeParticipants(themeId) {
    // TODO: Implement based on theme_interactions table
    // For now, return empty array
    return [];
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
    this.temporalBoosts.clear();
    this.collaborativeBoosts.clear();
    this.eventHandlers = {};
    logger.info('TemporalPresenceManager', 'Destroyed');
  }
}
