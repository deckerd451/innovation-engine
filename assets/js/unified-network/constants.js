// assets/js/unified-network/constants.js
// Constants and thresholds for Unified Network Discovery System
// Version: 1.0.0

/**
 * Animation timing constants (in milliseconds)
 */
export const ANIMATION_TIMINGS = {
  // State transitions
  discoveryFadeIn: 1500,
  discoveryFadeOut: 2000,
  myNetworkRecenter: 1000,
  
  // Node animations
  positionTransition: 1000,
  glowPulse: 2000,
  presenceDecay: 2000,
  
  // Interaction feedback
  tapResponse: 50,
  focusTransition: 750,
  
  // Performance
  calmStateDelay: 10000,
  motionSettleTime: 15000,
  
  // Discovery timing
  guidedNodeStagger: 100,
  dismissalCooldown: 86400000 // 24 hours
};

/**
 * effectivePull thresholds for node behavior
 */
export const EFFECTIVE_PULL_THRESHOLDS = {
  static: 0.3,      // Below this: static background
  drifting: 0.6,    // 0.3-0.6: peripheral awareness
  actionable: 0.9,  // 0.6-0.9: actionable proximity
  priority: 0.9     // 0.9+: priority handling
};

/**
 * Presence energy thresholds for tiers
 */
export const PRESENCE_THRESHOLDS = {
  ambient: 0.1,     // 0.1-0.3: ambient presence
  relevant: 0.3,    // 0.3-0.6: relevant presence
  actionable: 0.6,  // 0.6-1.0: actionable presence
  amplified: 0.8    // 0.8+: presence-amplified node
};

/**
 * Discovery state limits
 */
export const DISCOVERY_LIMITS = {
  maxGuidedNodes: 3,
  maxPresenceAmplified: 1,
  minTransitionInterval: 120000 // 2 minutes
};

/**
 * Motion and velocity thresholds
 */
export const MOTION_THRESHOLDS = {
  lowMomentum: 0.1,
  nearZero: 0.05,
  strongAction: 0.7,
  calmDelay: 10000,
  settleTime: 15000
};

/**
 * Relevance score weights
 */
export const RELEVANCE_WEIGHTS = {
  connectionHistory: 0.15,
  sharedProjects: 0.3,
  sharedThemes: 0.2,
  interactionFrequency: 0.15,
  temporalOpportunity: 0.2
};

/**
 * Interaction scoring thresholds
 */
export const INTERACTION_THRESHOLDS = {
  recentDays: 7,
  highFrequency: 5,
  mediumFrequency: 2
};

/**
 * Temporal opportunity thresholds
 */
export const TEMPORAL_THRESHOLDS = {
  deadlineHours: 48,
  activeParticipants: 3,
  priorityDelta: 0.1
};

/**
 * Mobile interaction constants
 */
export const MOBILE_CONSTANTS = {
  thumbReachablePercent: 0.6, // Bottom 60% of screen
  minTapSize: 44,              // 44x44 pixels
  hapticDuration: 50           // 50ms
};

/**
 * Performance constants
 */
export const PERFORMANCE_CONSTANTS = {
  activeFPS: 60,
  calmFPS: 30,
  spatialCullingMargin: 100,
  spatialCullingThreshold: 50
};

/**
 * Decay rates
 */
export const DECAY_RATES = {
  presenceDecay: 0.5,        // 0.5 per second
  guidedNodeDecay: 0.1,      // 0.1 per second after 30s
  idlePresenceDecay: 0.5,    // 0.5 after 5 minutes idle
  guidedNodeTimeout: 30000   // 30 seconds
};

/**
 * Glow intensity by presence tier
 */
export const GLOW_INTENSITY = {
  none: 0,
  ambient: 0.3,
  relevant: 0.5,
  actionable: 0.8
};

/**
 * Glow colors by presence tier
 */
export const GLOW_COLORS = {
  ambient: '#6666ff',
  relevant: '#4488ff',
  actionable: '#00ffff'
};

/**
 * Physics force strengths
 */
export const FORCE_STRENGTHS = {
  linkMin: 0.1,
  linkMax: 0.5,
  chargeWeak: -30,
  chargeMedium: -50,
  chargeStrong: -80,
  guidedRadial: 0.3,
  thumbReachableRadius: 150
};

/**
 * Easing function coefficients (cubic-bezier)
 */
export const EASING_COEFFICIENTS = {
  x1: 0.4,
  y1: 0.0,
  x2: 0.2,
  y2: 1.0
};

/**
 * Discovery trigger thresholds
 */
export const DISCOVERY_TRIGGERS = {
  lowMomentumDuration: 5000,    // 5 seconds
  relevantPresence: 0.6,
  smallGraphSize: 5,
  longActivityDuration: 1800000, // 30 minutes
  minTransitionInterval: 120000  // 2 minutes
};

/**
 * Context-aware presence boosts
 */
export const PRESENCE_BOOSTS = {
  projectMilestone: 0.4,
  themeView: 0.3,
  deadline: 0.5,
  sharedInterest: 0.4,
  collectiveTheme: 0.3
};

/**
 * Dismissal and reintroduction thresholds
 */
export const DISMISSAL_THRESHOLDS = {
  cooldownHours: 24,
  significantChange: 0.3
};

/**
 * Visual state constants
 */
export const VISUAL_CONSTANTS = {
  baseRadius: 20,
  baseOpacity: 1.0,
  dimmedOpacity: 0.3,
  maxDistance: 500,
  scaleMin: 1.0,
  scaleMax: 1.5
};
