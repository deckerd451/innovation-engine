// assets/js/unified-network/effective-pull.js
// effectivePull Calculation System
// Version: 1.0.0

import { NodeCategory, getNodeCategory } from './types.js';
import { EFFECTIVE_PULL_THRESHOLDS } from './constants.js';

/**
 * Compute effectivePull for a node
 * Formula: effectivePull = relevanceScore × (1 + presenceEnergy)
 * 
 * @param {Node} node - Node with relevanceScore and presenceEnergy
 * @returns {number} Effective pull value [0, 2]
 */
export function computeEffectivePull(node) {
  if (!node) {
    console.warn('computeEffectivePull: node is null or undefined');
    return 0;
  }

  const relevanceScore = node.relevanceScore ?? 0;
  const presenceEnergy = node.presenceEnergy ?? 0;

  // Validate inputs
  if (relevanceScore < 0 || relevanceScore > 1) {
    console.warn(`Invalid relevanceScore: ${relevanceScore} for node ${node.id}`);
  }
  if (presenceEnergy < 0 || presenceEnergy > 1) {
    console.warn(`Invalid presenceEnergy: ${presenceEnergy} for node ${node.id}`);
  }

  // Compute effectivePull
  const effectivePull = relevanceScore * (1 + presenceEnergy);

  return effectivePull;
}

/**
 * Categorize node based on effectivePull value
 * 
 * @param {number} effectivePull - Effective pull value
 * @returns {string} Node category (NodeCategory enum)
 */
export function categorizeNode(effectivePull) {
  return getNodeCategory(effectivePull);
}

/**
 * Update effectivePull for a single node
 * Modifies the node in place
 * 
 * @param {Node} node - Node to update
 * @returns {number} Updated effectivePull value
 */
export function updateNodeEffectivePull(node) {
  if (!node) return 0;
  
  const effectivePull = computeEffectivePull(node);
  node.effectivePull = effectivePull;
  
  return effectivePull;
}

/**
 * Update effectivePull for all nodes
 * Modifies nodes in place
 * 
 * @param {Node[]} nodes - Array of nodes to update
 * @returns {Map<string, number>} Map of nodeId to effectivePull
 */
export function updateAllEffectivePull(nodes) {
  const pullMap = new Map();
  
  if (!Array.isArray(nodes)) {
    console.warn('updateAllEffectivePull: nodes is not an array');
    return pullMap;
  }

  for (const node of nodes) {
    if (!node || !node.id) continue;
    
    const effectivePull = updateNodeEffectivePull(node);
    pullMap.set(node.id, effectivePull);
  }

  return pullMap;
}

/**
 * Get nodes by category
 * 
 * @param {Node[]} nodes - Array of nodes
 * @param {string} category - Category to filter by (NodeCategory enum)
 * @returns {Node[]} Filtered nodes
 */
export function getNodesByCategory(nodes, category) {
  if (!Array.isArray(nodes)) return [];
  
  return nodes.filter(node => {
    if (!node) return false;
    const effectivePull = node.effectivePull ?? computeEffectivePull(node);
    return categorizeNode(effectivePull) === category;
  });
}

/**
 * Get static nodes (effectivePull < 0.3)
 * 
 * @param {Node[]} nodes - Array of nodes
 * @returns {Node[]} Static nodes
 */
export function getStaticNodes(nodes) {
  return getNodesByCategory(nodes, NodeCategory.Static);
}

/**
 * Get drifting nodes (effectivePull 0.3-0.6)
 * 
 * @param {Node[]} nodes - Array of nodes
 * @returns {Node[]} Drifting nodes
 */
export function getDriftingNodes(nodes) {
  return getNodesByCategory(nodes, NodeCategory.Drifting);
}

/**
 * Get actionable nodes (effectivePull 0.6-0.9)
 * 
 * @param {Node[]} nodes - Array of nodes
 * @returns {Node[]} Actionable nodes
 */
export function getActionableNodes(nodes) {
  return getNodesByCategory(nodes, NodeCategory.Actionable);
}

/**
 * Get priority nodes (effectivePull >= 0.9)
 * 
 * @param {Node[]} nodes - Array of nodes
 * @returns {Node[]} Priority nodes
 */
export function getPriorityNodes(nodes) {
  return getNodesByCategory(nodes, NodeCategory.Priority);
}

/**
 * Check if node should be in background (static)
 * 
 * @param {Node} node - Node to check
 * @returns {boolean} True if node should be static
 */
export function isStaticNode(node) {
  if (!node) return true;
  const effectivePull = node.effectivePull ?? computeEffectivePull(node);
  return effectivePull < EFFECTIVE_PULL_THRESHOLDS.static;
}

/**
 * Check if node should drift into peripheral awareness
 * 
 * @param {Node} node - Node to check
 * @returns {boolean} True if node should drift
 */
export function isDriftingNode(node) {
  if (!node) return false;
  const effectivePull = node.effectivePull ?? computeEffectivePull(node);
  return effectivePull >= EFFECTIVE_PULL_THRESHOLDS.static && 
         effectivePull < EFFECTIVE_PULL_THRESHOLDS.drifting;
}

/**
 * Check if node should enter actionable proximity
 * 
 * @param {Node} node - Node to check
 * @returns {boolean} True if node should be actionable
 */
export function isActionableNode(node) {
  if (!node) return false;
  const effectivePull = node.effectivePull ?? computeEffectivePull(node);
  return effectivePull >= EFFECTIVE_PULL_THRESHOLDS.drifting && 
         effectivePull < EFFECTIVE_PULL_THRESHOLDS.actionable;
}

/**
 * Check if node is priority
 * 
 * @param {Node} node - Node to check
 * @returns {boolean} True if node is priority
 */
export function isPriorityNode(node) {
  if (!node) return false;
  const effectivePull = node.effectivePull ?? computeEffectivePull(node);
  return effectivePull >= EFFECTIVE_PULL_THRESHOLDS.priority;
}

/**
 * Sort nodes by effectivePull (descending)
 * 
 * @param {Node[]} nodes - Array of nodes
 * @returns {Node[]} Sorted nodes (new array)
 */
export function sortByEffectivePull(nodes) {
  if (!Array.isArray(nodes)) return [];
  
  return [...nodes].sort((a, b) => {
    const pullA = a.effectivePull ?? computeEffectivePull(a);
    const pullB = b.effectivePull ?? computeEffectivePull(b);
    return pullB - pullA; // Descending order
  });
}

/**
 * Get top N nodes by effectivePull
 * 
 * @param {Node[]} nodes - Array of nodes
 * @param {number} n - Number of nodes to return
 * @returns {Node[]} Top N nodes
 */
export function getTopNodes(nodes, n) {
  const sorted = sortByEffectivePull(nodes);
  return sorted.slice(0, n);
}

/**
 * effectivePull Calculator with caching
 */
export class EffectivePullCalculator {
  constructor() {
    this._cache = new Map();
    this._cacheEnabled = true;
  }

  /**
   * Enable or disable caching
   * @param {boolean} enabled - Enable caching
   */
  setCacheEnabled(enabled) {
    this._cacheEnabled = enabled;
    if (!enabled) {
      this._cache.clear();
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Compute effectivePull with caching
   * @param {Node} node - Node
   * @returns {number} Effective pull
   */
  compute(node) {
    if (!node || !node.id) return 0;

    // Check cache
    if (this._cacheEnabled && this._cache.has(node.id)) {
      const cached = this._cache.get(node.id);
      // Validate cache is still valid
      if (cached.relevanceScore === node.relevanceScore && 
          cached.presenceEnergy === node.presenceEnergy) {
        return cached.effectivePull;
      }
    }

    // Compute
    const effectivePull = computeEffectivePull(node);

    // Cache
    if (this._cacheEnabled) {
      this._cache.set(node.id, {
        relevanceScore: node.relevanceScore,
        presenceEnergy: node.presenceEnergy,
        effectivePull
      });
    }

    return effectivePull;
  }

  /**
   * Update and cache effectivePull for node
   * @param {Node} node - Node to update
   * @returns {number} Updated effectivePull
   */
  update(node) {
    const effectivePull = this.compute(node);
    node.effectivePull = effectivePull;
    return effectivePull;
  }

  /**
   * Update all nodes
   * @param {Node[]} nodes - Nodes to update
   * @returns {Map<string, number>} Map of nodeId to effectivePull
   */
  updateAll(nodes) {
    const pullMap = new Map();
    
    if (!Array.isArray(nodes)) return pullMap;

    for (const node of nodes) {
      if (!node || !node.id) continue;
      const effectivePull = this.update(node);
      pullMap.set(node.id, effectivePull);
    }

    return pullMap;
  }

  /**
   * Invalidate cache for a node
   * @param {string} nodeId - Node ID
   */
  invalidate(nodeId) {
    this._cache.delete(nodeId);
  }

  /**
   * Get cache size
   * @returns {number} Number of cached entries
   */
  getCacheSize() {
    return this._cache.size;
  }
}

// Create singleton instance
export const effectivePullCalculator = new EffectivePullCalculator();
