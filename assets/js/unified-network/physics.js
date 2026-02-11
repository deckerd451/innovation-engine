// assets/js/unified-network/physics.js
// D3 Physics Integration for Unified Network Discovery
// Version: 1.0.0

import { 
  FORCE_STRENGTHS, 
  MOBILE_CONSTANTS,
  MOTION_THRESHOLDS 
} from './constants.js';
import { computeEffectivePull } from './effective-pull.js';

/**
 * Apply effectivePull-based force adjustments to D3 simulation
 * @param {d3.ForceSimulation} simulation - D3 force simulation
 * @param {Node[]} nodes - Array of nodes
 * @param {Edge[]} links - Array of links
 */
export function applyEffectivePullForces(simulation, nodes, links) {
  if (!simulation || !nodes) {
    console.warn('applyEffectivePullForces: invalid simulation or nodes');
    return;
  }

  // 1. Modify link strength based on effectivePull
  const linkForce = simulation.force('link');
  if (linkForce) {
    linkForce.strength(link => {
      const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target : nodes.find(n => n.id === link.target);
      
      if (!source || !target) return FORCE_STRENGTHS.linkMin;
      
      const sourcePull = source.effectivePull ?? computeEffectivePull(source);
      const targetPull = target.effectivePull ?? computeEffectivePull(target);
      const avgPull = (sourcePull + targetPull) / 2;
      
      // Range [0.1, 0.5]
      return FORCE_STRENGTHS.linkMin + (avgPull * (FORCE_STRENGTHS.linkMax - FORCE_STRENGTHS.linkMin));
    });
  }

  // 2. Apply radial force for guided nodes (thumb-reachable positioning)
  let guidedForce = simulation.force('guided');
  if (!guidedForce) {
    guidedForce = window.d3.forceRadial()
      .x(0)
      .y(0);
    simulation.force('guided', guidedForce);
  }

  guidedForce
    .radius(node => {
      if (node.isGuided) {
        return FORCE_STRENGTHS.thumbReachableRadius;
      }
      return 0;
    })
    .strength(node => {
      if (node.isGuided) {
        const pull = node.effectivePull ?? computeEffectivePull(node);
        return pull * FORCE_STRENGTHS.guidedRadial;
      }
      return 0;
    });

  // 3. Adjust charge force based on effectivePull
  const chargeForce = simulation.force('charge');
  if (chargeForce) {
    chargeForce.strength(node => {
      const pull = node.effectivePull ?? computeEffectivePull(node);
      
      if (pull < 0.3) return FORCE_STRENGTHS.chargeWeak;
      if (pull < 0.6) return FORCE_STRENGTHS.chargeMedium;
      return FORCE_STRENGTHS.chargeStrong;
    });
  }

  console.log('⚡ Applied effectivePull-based forces to simulation');
}

/**
 * Position guided nodes in thumb-reachable zone (mobile)
 * @param {Node[]} nodes - Array of nodes
 * @param {number} viewportWidth - Viewport width
 * @param {number} viewportHeight - Viewport height
 */
export function positionGuidedNodesInThumbZone(nodes, viewportWidth, viewportHeight) {
  if (!nodes || !Array.isArray(nodes)) return;

  const guidedNodes = nodes.filter(n => n.isGuided);
  if (guidedNodes.length === 0) return;

  // Calculate thumb-reachable zone (bottom 60% of screen)
  const thumbZoneTop = viewportHeight * (1 - MOBILE_CONSTANTS.thumbReachablePercent);
  const thumbZoneBottom = viewportHeight;
  const thumbZoneHeight = thumbZoneBottom - thumbZoneTop;

  const centerX = viewportWidth / 2;
  const centerY = thumbZoneTop + (thumbZoneHeight / 2);

  // Position guided nodes in a small cluster within thumb zone
  guidedNodes.forEach((node, index) => {
    const angle = (index / guidedNodes.length) * 2 * Math.PI;
    const radius = 50; // Small radius for clustering
    
    node.fx = centerX + Math.cos(angle) * radius;
    node.fy = centerY + Math.sin(angle) * radius;
  });

  console.log(`📍 Positioned ${guidedNodes.length} guided nodes in thumb-reachable zone`);
}

/**
 * Release fixed positions for nodes that are no longer guided
 * @param {Node[]} nodes - Array of nodes
 */
export function releaseNonGuidedNodes(nodes) {
  if (!nodes || !Array.isArray(nodes)) return;

  let released = 0;
  nodes.forEach(node => {
    if (!node.isGuided && (node.fx !== undefined || node.fy !== undefined)) {
      node.fx = undefined;
      node.fy = undefined;
      released++;
    }
  });

  if (released > 0) {
    console.log(`🔓 Released ${released} non-guided nodes`);
  }
}

/**
 * Apply velocity decay for calm state
 * @param {Node[]} nodes - Array of nodes
 * @param {number} decayFactor - Decay factor [0, 1]
 */
export function applyVelocityDecay(nodes, decayFactor = 0.95) {
  if (!nodes || !Array.isArray(nodes)) return;

  nodes.forEach(node => {
    if (node.vx !== undefined) node.vx *= decayFactor;
    if (node.vy !== undefined) node.vy *= decayFactor;
  });
}

/**
 * Calculate average velocity of all nodes
 * @param {Node[]} nodes - Array of nodes
 * @returns {number} Average velocity
 */
export function calculateAverageVelocity(nodes) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return 0;

  let totalVelocity = 0;
  let count = 0;

  nodes.forEach(node => {
    if (node.vx !== undefined && node.vy !== undefined) {
      const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      totalVelocity += velocity;
      count++;
    }
  });

  return count > 0 ? totalVelocity / count : 0;
}

/**
 * Check if simulation is in calm state
 * @param {Node[]} nodes - Array of nodes
 * @returns {boolean} True if calm
 */
export function isSimulationCalm(nodes) {
  const avgVelocity = calculateAverageVelocity(nodes);
  return avgVelocity < MOTION_THRESHOLDS.nearZero;
}

/**
 * Apply spatial integration for discovery nodes
 * Ensures discovery nodes enter the same coordinate space as My Network nodes
 * @param {Node[]} discoveryNodes - Discovery nodes to integrate
 * @param {Node[]} networkNodes - Existing network nodes
 * @param {number} viewportWidth - Viewport width
 * @param {number} viewportHeight - Viewport height
 */
export function integrateDiscoveryNodes(discoveryNodes, networkNodes, viewportWidth, viewportHeight) {
  if (!discoveryNodes || discoveryNodes.length === 0) return;

  // Calculate center of existing network
  let centerX = viewportWidth / 2;
  let centerY = viewportHeight / 2;

  if (networkNodes && networkNodes.length > 0) {
    let sumX = 0, sumY = 0, count = 0;
    networkNodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        sumX += node.x;
        sumY += node.y;
        count++;
      }
    });
    if (count > 0) {
      centerX = sumX / count;
      centerY = sumY / count;
    }
  }

  // Position discovery nodes around the periphery
  discoveryNodes.forEach((node, index) => {
    const angle = (index / discoveryNodes.length) * 2 * Math.PI;
    const radius = 200; // Distance from center
    
    // Set initial position (not fixed)
    node.x = centerX + Math.cos(angle) * radius;
    node.y = centerY + Math.sin(angle) * radius;
    
    // Give them a small initial velocity toward center
    node.vx = -Math.cos(angle) * 0.5;
    node.vy = -Math.sin(angle) * 0.5;
  });

  console.log(`🌊 Integrated ${discoveryNodes.length} discovery nodes into graph space`);
}

/**
 * Enforce motion settle time limit
 * If nodes haven't settled after max time, force them to calm
 * @param {Node[]} nodes - Array of nodes
 * @param {number} startTime - Start time of motion (timestamp)
 * @param {number} maxSettleTime - Maximum settle time in ms
 * @returns {boolean} True if forced to settle
 */
export function enforceSettleTimeLimit(nodes, startTime, maxSettleTime = MOTION_THRESHOLDS.settleTime) {
  const elapsed = Date.now() - startTime;
  
  if (elapsed > maxSettleTime) {
    // Force all nodes to near-zero velocity
    nodes.forEach(node => {
      node.vx = 0;
      node.vy = 0;
    });
    
    console.log('⏱️ Enforced settle time limit - forced nodes to calm');
    return true;
  }
  
  return false;
}

/**
 * Get viewport dimensions
 * @returns {{width: number, height: number}}
 */
export function getViewportDimensions() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

/**
 * Physics configuration for unified network
 */
export class PhysicsConfig {
  constructor() {
    this.linkDistance = 100;
    this.linkStrength = 0.3;
    this.chargeStrength = -50;
    this.centerStrength = 0.05;
    this.collisionRadius = 30;
    this.alphaDecay = 0.02;
    this.velocityDecay = 0.4;
  }

  /**
   * Apply configuration to D3 simulation
   * @param {d3.ForceSimulation} simulation - D3 simulation
   */
  apply(simulation) {
    if (!simulation) return;

    // Link force
    const linkForce = simulation.force('link');
    if (linkForce) {
      linkForce.distance(this.linkDistance);
    }

    // Charge force
    const chargeForce = simulation.force('charge');
    if (chargeForce) {
      chargeForce.strength(this.chargeStrength);
    }

    // Center force
    const centerForce = simulation.force('center');
    if (centerForce) {
      centerForce.strength(this.centerStrength);
    }

    // Collision force
    const collisionForce = simulation.force('collision');
    if (collisionForce) {
      collisionForce.radius(this.collisionRadius);
    }

    // Alpha decay
    simulation.alphaDecay(this.alphaDecay);
    simulation.velocityDecay(this.velocityDecay);

    console.log('⚙️ Applied physics configuration to simulation');
  }
}

/**
 * Create default physics configuration
 * @returns {PhysicsConfig}
 */
export function createDefaultPhysicsConfig() {
  return new PhysicsConfig();
}
