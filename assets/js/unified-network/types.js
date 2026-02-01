// assets/js/unified-network/types.js
// Type definitions and enums for Unified Network Discovery System
// Version: 1.0.0

/**
 * @typedef {Object} Node
 * @property {string} id - Unique identifier
 * @property {'person'|'project'|'theme'|'organization'} type - Node type
 * @property {string} name - Display name
 * @property {string} [imageUrl] - Optional image URL
 * 
 * @property {number} x - X position (managed by D3)
 * @property {number} y - Y position (managed by D3)
 * @property {number} vx - Velocity X (managed by D3)
 * @property {number} vy - Velocity Y (managed by D3)
 * @property {number} [fx] - Fixed X position (optional)
 * @property {number} [fy] - Fixed Y position (optional)
 * 
 * @property {number} relevanceScore - Persistent relevance [0, 1]
 * @property {number} presenceEnergy - Ephemeral presence [0, 1]
 * @property {number} effectivePull - Computed: relevanceScore × (1 + presenceEnergy)
 * 
 * @property {boolean} isMyNetwork - Existing connection
 * @property {boolean} isDiscovery - Discovery candidate
 * @property {boolean} isFocused - Currently focused
 * @property {boolean} isGuided - High effectivePull, in actionable proximity
 * 
 * @property {Date} [lastInteraction] - Last interaction timestamp
 * @property {Date} [presenceTTL] - Presence expiration timestamp
 * @property {string[]} sharedThemes - Shared theme IDs
 * @property {string[]} sharedProjects - Shared project IDs
 */

/**
 * @typedef {Object} Edge
 * @property {string|Node} source - Source node ID or reference
 * @property {string|Node} target - Target node ID or reference
 * @property {'connection'|'project'|'theme'} type - Edge type
 * @property {number} strength - Link strength [0, 1]
 * @property {Date} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} SystemState
 * @property {'my-network'|'discovery'|'transitioning'} mode - Current state
 * @property {string|null} currentFocusedNodeId - Currently focused node
 * @property {boolean} isDefaultUserFocus - Is default user focused
 * 
 * @property {string[]} guidedNodes - Guided node IDs (max 3)
 * @property {string|null} presenceAmplifiedNode - Presence-amplified node (max 1)
 * 
 * @property {Date} lastInteractionTime - Last user interaction
 * @property {number} averageVelocity - Average node velocity
 * @property {boolean} isCalm - Is in calm state
 * 
 * @property {60|30} fps - Current frame rate
 * @property {number} visibleNodeCount - Number of visible nodes
 */

/**
 * @typedef {Object} VisualState
 * @property {number} radius - Node radius
 * @property {number} opacity - Node opacity
 * @property {number} glowIntensity - Glow intensity [0, 1]
 * @property {string} glowColor - Glow color (hex)
 * @property {number} scale - Scale factor
 */

/**
 * @typedef {Object} FocusOptions
 * @property {number} [duration] - Animation duration in ms
 * @property {boolean} [smooth] - Use smooth animation
 */

/**
 * @typedef {Object} InteractionRecord
 * @property {string} userId - User ID
 * @property {string} nodeId - Node ID
 * @property {string} nodeType - Node type
 * @property {string} interactionType - Interaction type
 * @property {Date} createdAt - Creation timestamp
 */

/**
 * Presence tier enumeration
 * @enum {number}
 */
export const PresenceTier = {
  None: 0,       // presenceEnergy = 0
  Ambient: 1,    // presenceEnergy 0.1-0.3
  Relevant: 2,   // presenceEnergy 0.3-0.6
  Actionable: 3  // presenceEnergy 0.6-1.0
};

/**
 * Node behavior category based on effectivePull
 * @enum {string}
 */
export const NodeCategory = {
  Static: 'static',       // effectivePull < 0.3
  Drifting: 'drifting',   // effectivePull 0.3-0.6
  Actionable: 'actionable', // effectivePull 0.6-0.9
  Priority: 'priority'    // effectivePull >= 0.9
};

/**
 * System mode enumeration
 * @enum {string}
 */
export const SystemMode = {
  MyNetwork: 'my-network',
  Discovery: 'discovery',
  Transitioning: 'transitioning'
};

/**
 * Get presence tier from energy value
 * @param {number} presenceEnergy - Presence energy [0, 1]
 * @returns {number} Presence tier
 */
export function getPresenceTier(presenceEnergy) {
  if (presenceEnergy === 0) return PresenceTier.None;
  if (presenceEnergy < 0.3) return PresenceTier.Ambient;
  if (presenceEnergy < 0.6) return PresenceTier.Relevant;
  return PresenceTier.Actionable;
}

/**
 * Get node category from effectivePull value
 * @param {number} effectivePull - Effective pull [0, 2]
 * @returns {string} Node category
 */
export function getNodeCategory(effectivePull) {
  if (effectivePull < 0.3) return NodeCategory.Static;
  if (effectivePull < 0.6) return NodeCategory.Drifting;
  if (effectivePull < 0.9) return NodeCategory.Actionable;
  return NodeCategory.Priority;
}
