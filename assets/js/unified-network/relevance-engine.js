// assets/js/unified-network/relevance-engine.js
// Relevance Score Engine
// Version: 1.0.0

import { 
  RELEVANCE_WEIGHTS, 
  INTERACTION_THRESHOLDS,
  TEMPORAL_THRESHOLDS 
} from './constants.js';

/**
 * Relevance Score Engine
 * Computes persistent relevance scores based on user relationships
 */
export class RelevanceScoreEngine {
  constructor() {
    this._graphDataStore = null;
    this._scoreCache = new Map();
    this._sharedThemesCache = new Map();
    this._sharedProjectsCache = new Map();
  }

  /**
   * Initialize with graph data store
   * @param {GraphDataStore} graphDataStore - Graph data store instance
   */
  initialize(graphDataStore) {
    this._graphDataStore = graphDataStore;
    console.log('✅ RelevanceScoreEngine initialized');
  }

  /**
   * Compute relevance score for a target node
   * @param {string} userId - Current user ID
   * @param {string} targetNodeId - Target node ID
   * @returns {number} Relevance score [0, 1]
   */
  computeScore(userId, targetNodeId) {
    if (!this._graphDataStore) {
      console.warn('RelevanceScoreEngine not initialized');
      return 0;
    }

    // Check cache
    const cacheKey = `${userId}:${targetNodeId}`;
    if (this._scoreCache.has(cacheKey)) {
      return this._scoreCache.get(cacheKey);
    }

    let score = 0;

    // 1. Connection history (0.15 weight)
    score += this._computeConnectionHistoryScore(userId, targetNodeId);

    // 2. Shared projects (0.3 weight)
    score += this._computeSharedProjectsScore(userId, targetNodeId);

    // 3. Shared themes (0.2 weight)
    score += this._computeSharedThemesScore(userId, targetNodeId);

    // 4. Interaction frequency (0.15 weight)
    score += this._computeInteractionFrequencyScore(userId, targetNodeId);

    // 5. Temporal opportunities (0.2 weight)
    score += this._computeTemporalOpportunityScore(targetNodeId);

    // Normalize to [0, 1]
    score = Math.min(1.0, Math.max(0.0, score));

    // Cache result
    this._scoreCache.set(cacheKey, score);

    return score;
  }

  /**
   * Compute connection history score
   * @private
   */
  _computeConnectionHistoryScore(userId, targetNodeId) {
    const interactions = this.getInteractionHistory(userId, targetNodeId);
    
    if (!interactions || interactions.length === 0) {
      return 0;
    }

    // Check if interacted recently (within 7 days)
    const now = Date.now();
    const recentThreshold = INTERACTION_THRESHOLDS.recentDays * 24 * 60 * 60 * 1000;
    
    const hasRecentInteraction = interactions.some(interaction => {
      const interactionTime = interaction.createdAt instanceof Date 
        ? interaction.createdAt.getTime()
        : new Date(interaction.createdAt).getTime();
      return (now - interactionTime) < recentThreshold;
    });

    return hasRecentInteraction ? RELEVANCE_WEIGHTS.connectionHistory : 0;
  }

  /**
   * Compute shared projects score
   * @private
   */
  _computeSharedProjectsScore(userId, targetNodeId) {
    const sharedProjects = this.getSharedProjects(userId, targetNodeId);
    
    if (!sharedProjects || sharedProjects.length === 0) {
      return 0;
    }

    // If 1 or more shared projects, add full weight
    return sharedProjects.length >= 1 ? RELEVANCE_WEIGHTS.sharedProjects : 0;
  }

  /**
   * Compute shared themes score
   * @private
   */
  _computeSharedThemesScore(userId, targetNodeId) {
    const sharedThemes = this.getSharedThemes(userId, targetNodeId);
    
    if (!sharedThemes || sharedThemes.length === 0) {
      return 0;
    }

    // 2+ themes: full weight (0.2)
    // 1 theme: half weight (0.1)
    if (sharedThemes.length >= 2) {
      return RELEVANCE_WEIGHTS.sharedThemes;
    } else if (sharedThemes.length === 1) {
      return RELEVANCE_WEIGHTS.sharedThemes * 0.5;
    }

    return 0;
  }

  /**
   * Compute interaction frequency score
   * @private
   */
  _computeInteractionFrequencyScore(userId, targetNodeId) {
    const interactions = this.getInteractionHistory(userId, targetNodeId);
    
    if (!interactions || interactions.length === 0) {
      return 0;
    }

    const count = interactions.length;

    // 5+ interactions: full weight (0.15)
    // 2-4 interactions: partial weight (0.08)
    if (count >= INTERACTION_THRESHOLDS.highFrequency) {
      return RELEVANCE_WEIGHTS.interactionFrequency;
    } else if (count >= INTERACTION_THRESHOLDS.mediumFrequency) {
      return RELEVANCE_WEIGHTS.interactionFrequency * 0.53; // ~0.08
    }

    return 0;
  }

  /**
   * Compute temporal opportunity score
   * @private
   */
  _computeTemporalOpportunityScore(targetNodeId) {
    const hasTemporalOpportunity = this._checkTemporalOpportunity(targetNodeId);
    return hasTemporalOpportunity ? RELEVANCE_WEIGHTS.temporalOpportunity : 0;
  }

  /**
   * Check if node has temporal opportunity
   * @private
   */
  _checkTemporalOpportunity(targetNodeId) {
    if (!this._graphDataStore) return false;

    const node = this._graphDataStore.getNode(targetNodeId);
    if (!node) return false;

    // Check for deadline within 48 hours
    if (node.deadline) {
      const deadline = node.deadline instanceof Date 
        ? node.deadline 
        : new Date(node.deadline);
      const now = Date.now();
      const hoursUntilDeadline = (deadline.getTime() - now) / (1000 * 60 * 60);
      
      if (hoursUntilDeadline > 0 && hoursUntilDeadline <= TEMPORAL_THRESHOLDS.deadlineHours) {
        return true;
      }
    }

    // Check for active collaboration
    if (node.activeCollaboration) {
      return true;
    }

    return false;
  }

  /**
   * Get shared themes between users
   * @param {string} userId - User ID
   * @param {string} targetId - Target user ID
   * @returns {string[]} Shared theme IDs
   */
  getSharedThemes(userId, targetId) {
    const cacheKey = `${userId}:${targetId}`;
    if (this._sharedThemesCache.has(cacheKey)) {
      return this._sharedThemesCache.get(cacheKey);
    }

    if (!this._graphDataStore) return [];

    const userNode = this._graphDataStore.getNode(userId);
    const targetNode = this._graphDataStore.getNode(targetId);

    if (!userNode || !targetNode) return [];

    const userThemes = userNode.sharedThemes || [];
    const targetThemes = targetNode.sharedThemes || [];

    // Find intersection
    const shared = userThemes.filter(theme => targetThemes.includes(theme));

    // Cache result
    this._sharedThemesCache.set(cacheKey, shared);

    return shared;
  }

  /**
   * Get shared projects between users
   * @param {string} userId - User ID
   * @param {string} targetId - Target user ID
   * @returns {string[]} Shared project IDs
   */
  getSharedProjects(userId, targetId) {
    const cacheKey = `${userId}:${targetId}`;
    if (this._sharedProjectsCache.has(cacheKey)) {
      return this._sharedProjectsCache.get(cacheKey);
    }

    if (!this._graphDataStore) return [];

    const userNode = this._graphDataStore.getNode(userId);
    const targetNode = this._graphDataStore.getNode(targetId);

    if (!userNode || !targetNode) return [];

    const userProjects = userNode.sharedProjects || [];
    const targetProjects = targetNode.sharedProjects || [];

    // Find intersection
    const shared = userProjects.filter(project => targetProjects.includes(project));

    // Cache result
    this._sharedProjectsCache.set(cacheKey, shared);

    return shared;
  }

  /**
   * Get interaction history for a node
   * @param {string} userId - User ID
   * @param {string} targetId - Target node ID
   * @returns {InteractionRecord[]} Interaction records
   */
  getInteractionHistory(userId, targetId) {
    if (!this._graphDataStore) return [];

    // Get from cached data or query
    const cached = this._graphDataStore.getCached(`interactions:${userId}:${targetId}`);
    if (cached) return cached;

    // TODO: Query from database when GraphDataStore is implemented
    // For now, return empty array
    return [];
  }

  /**
   * Recalculate all relevance scores for a user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async recalculateAll(userId) {
    if (!this._graphDataStore) {
      console.warn('RelevanceScoreEngine not initialized');
      return;
    }

    console.log(`🔄 Recalculating relevance scores for user ${userId}`);

    const allNodes = this._graphDataStore.getAllNodes();
    let recalculated = 0;

    for (const node of allNodes) {
      if (node.id === userId) continue; // Skip self
      
      // Invalidate cache
      const cacheKey = `${userId}:${node.id}`;
      this._scoreCache.delete(cacheKey);
      this._sharedThemesCache.delete(cacheKey);
      this._sharedProjectsCache.delete(cacheKey);

      // Recompute
      const score = this.computeScore(userId, node.id);
      node.relevanceScore = score;
      recalculated++;
    }

    console.log(`✅ Recalculated ${recalculated} relevance scores`);
  }

  /**
   * Invalidate cache for a user pair
   * @param {string} userId - User ID
   * @param {string} targetId - Target ID
   */
  invalidateCache(userId, targetId) {
    const cacheKey = `${userId}:${targetId}`;
    this._scoreCache.delete(cacheKey);
    this._sharedThemesCache.delete(cacheKey);
    this._sharedProjectsCache.delete(cacheKey);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this._scoreCache.clear();
    this._sharedThemesCache.clear();
    this._sharedProjectsCache.clear();
    console.log('🧹 RelevanceScoreEngine caches cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      scores: this._scoreCache.size,
      sharedThemes: this._sharedThemesCache.size,
      sharedProjects: this._sharedProjectsCache.size,
      total: this._scoreCache.size + this._sharedThemesCache.size + this._sharedProjectsCache.size
    };
  }
}

// Create singleton instance
export const relevanceScoreEngine = new RelevanceScoreEngine();
