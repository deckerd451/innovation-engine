// assets/js/unified-network/index.js
// Unified Network Discovery - Main Export
// Version: 1.0.0

// Core API
export { UnifiedNetworkAPI, unifiedNetworkApi } from './api.js';

// Types and Constants
export * from './types.js';
export * from './constants.js';

// Core Components
export { 
  computeEffectivePull,
  categorizeNode,
  updateNodeEffectivePull,
  updateAllEffectivePull,
  getNodesByCategory,
  effectivePullCalculator,
  EffectivePullCalculator
} from './effective-pull.js';

export {
  RelevanceScoreEngine,
  relevanceScoreEngine
} from './relevance-engine.js';

export {
  PresenceEnergyTracker,
  presenceEnergyTracker
} from './presence-tracker.js';

export {
  StateManager,
  stateManager
} from './state-manager.js';

export {
  GraphDataStore,
  graphDataStore
} from './graph-data-store.js';

// Physics and Rendering
export {
  applyEffectivePullForces,
  positionGuidedNodesInThumbZone,
  releaseNonGuidedNodes,
  applyVelocityDecay,
  calculateAverageVelocity,
  isSimulationCalm,
  integrateDiscoveryNodes,
  enforceSettleTimeLimit,
  getViewportDimensions,
  PhysicsConfig,
  createDefaultPhysicsConfig
} from './physics.js';

export {
  NodeRenderer,
  nodeRenderer
} from './node-renderer.js';

export {
  AnimationEngine,
  animationEngine,
  animateMultiple
} from './animation-engine.js';

export {
  PhysicsLoop,
  AdaptiveFrameRateManager,
  physicsLoop
} from './physics-loop.js';

// Interaction
export {
  InteractionHandler,
  ActionType,
  interactionHandler
} from './interaction-handler.js';

export {
  ActionResolver
} from './action-resolver.js';

export {
  GuidedNodeDecay,
  guidedNodeDecay
} from './guided-node-decay.js';

// Interfaces (for reference)
export * from './interfaces.js';

console.log('📦 Unified Network Discovery modules loaded');
