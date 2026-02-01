// assets/js/unified-network/animation-engine.js
// Animation Engine for Unified Network Discovery
// Version: 1.0.0

import { ANIMATION_TIMINGS, EASING_COEFFICIENTS } from './constants.js';

/**
 * Cubic-bezier easing function
 * @param {number} t - Progress [0, 1]
 * @returns {number} Eased value
 */
function cubicBezier(t) {
  // Using coefficients from constants: (0.4, 0.0, 0.2, 1.0)
  const { x1, y1, x2, y2 } = EASING_COEFFICIENTS;
  
  // Simplified cubic-bezier calculation
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return (
    3 * mt2 * t * y1 +
    3 * mt * t2 * y2 +
    t3
  );
}

/**
 * Cubic-out easing for smooth deceleration
 * @param {number} t - Progress [0, 1]
 * @returns {number} Eased value
 */
function cubicOut(t) {
  const f = t - 1;
  return f * f * f + 1;
}

/**
 * Animation Engine
 * Handles smooth transitions and animations
 */
export class AnimationEngine {
  constructor() {
    this._activeAnimations = new Map();
    this._animationId = 0;
  }

  /**
   * Animate node position
   * @param {Node} node - Node to animate
   * @param {number} targetX - Target X position
   * @param {number} targetY - Target Y position
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  animatePosition(node, targetX, targetY, duration = ANIMATION_TIMINGS.positionTransition) {
    if (!node) return Promise.resolve();

    const animId = this._animationId++;
    const startX = node.x ?? targetX;
    const startY = node.y ?? targetY;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = cubicOut(progress);

        node.x = startX + (targetX - startX) * eased;
        node.y = startY + (targetY - startY) * eased;

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          this._activeAnimations.set(animId, { frameId, resolve });
        } else {
          this._activeAnimations.delete(animId);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animate);
      this._activeAnimations.set(animId, { frameId, resolve });
    });
  }

  /**
   * Fade in node
   * @param {string} nodeId - Node ID
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  fadeIn(nodeId, duration = ANIMATION_TIMINGS.discoveryFadeIn) {
    return this._animateOpacity(nodeId, 0, 1, duration);
  }

  /**
   * Fade out node
   * @param {string} nodeId - Node ID
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  fadeOut(nodeId, duration = ANIMATION_TIMINGS.discoveryFadeOut) {
    return this._animateOpacity(nodeId, 1, 0, duration);
  }

  /**
   * Animate opacity
   * @private
   */
  _animateOpacity(nodeId, startOpacity, endOpacity, duration) {
    const animId = this._animationId++;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = cubicBezier(progress);

        const opacity = startOpacity + (endOpacity - startOpacity) * eased;

        // Apply to DOM element
        const element = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (element) {
          element.style.opacity = opacity;
        }

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          this._activeAnimations.set(animId, { frameId, resolve });
        } else {
          this._activeAnimations.delete(animId);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animate);
      this._activeAnimations.set(animId, { frameId, resolve });
    });
  }

  /**
   * Pulse glow animation
   * @param {string} nodeId - Node ID
   * @param {number} cycles - Number of pulse cycles (default: 1)
   * @returns {Promise<void>}
   */
  pulseGlow(nodeId, cycles = 1) {
    const duration = ANIMATION_TIMINGS.glowPulse;
    const animId = this._animationId++;
    const startTime = performance.now();
    const totalDuration = duration * cycles;

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / totalDuration);
        
        // Sine wave for pulsing effect
        const cycle = (elapsed / duration) % 1;
        const intensity = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;

        // Apply to glow element
        const glowElement = document.querySelector(`[data-node-id="${nodeId}"] .node-glow`);
        if (glowElement) {
          const baseOpacity = parseFloat(glowElement.getAttribute('data-base-opacity') || '0.5');
          glowElement.style.opacity = baseOpacity * (0.5 + intensity * 0.5);
        }

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          this._activeAnimations.set(animId, { frameId, resolve });
        } else {
          // Reset to base opacity
          if (glowElement) {
            const baseOpacity = parseFloat(glowElement.getAttribute('data-base-opacity') || '0.5');
            glowElement.style.opacity = baseOpacity;
          }
          this._activeAnimations.delete(animId);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animate);
      this._activeAnimations.set(animId, { frameId, resolve });
    });
  }

  /**
   * Animate presence decay
   * @param {string} nodeId - Node ID
   * @param {number} startIntensity - Start glow intensity
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  animatePresenceDecay(nodeId, startIntensity, duration = ANIMATION_TIMINGS.presenceDecay) {
    const animId = this._animationId++;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = cubicBezier(progress);

        const intensity = startIntensity * (1 - eased);

        // Apply to glow element
        const glowElement = document.querySelector(`[data-node-id="${nodeId}"] .node-glow`);
        if (glowElement) {
          glowElement.style.opacity = intensity;
        }

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          this._activeAnimations.set(animId, { frameId, resolve });
        } else {
          this._activeAnimations.delete(animId);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animate);
      this._activeAnimations.set(animId, { frameId, resolve });
    });
  }

  /**
   * Stagger animations for multiple nodes
   * @param {string[]} nodeIds - Array of node IDs
   * @param {Function} animationFn - Animation function to apply
   * @param {number} staggerDelay - Delay between animations in ms
   * @returns {Promise<void>}
   */
  async staggerAnimations(nodeIds, animationFn, staggerDelay = ANIMATION_TIMINGS.guidedNodeStagger) {
    if (!nodeIds || nodeIds.length === 0) return;

    const promises = nodeIds.map((nodeId, index) => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          await animationFn(nodeId);
          resolve();
        }, index * staggerDelay);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Animate scale
   * @param {string} nodeId - Node ID
   * @param {number} startScale - Start scale
   * @param {number} endScale - End scale
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  animateScale(nodeId, startScale, endScale, duration = ANIMATION_TIMINGS.positionTransition) {
    const animId = this._animationId++;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = cubicBezier(progress);

        const scale = startScale + (endScale - startScale) * eased;

        // Apply to DOM element
        const element = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (element) {
          const currentTransform = element.style.transform || '';
          const newTransform = currentTransform.replace(/scale\([^)]*\)/, '') + ` scale(${scale})`;
          element.style.transform = newTransform.trim();
        }

        if (progress < 1) {
          const frameId = requestAnimationFrame(animate);
          this._activeAnimations.set(animId, { frameId, resolve });
        } else {
          this._activeAnimations.delete(animId);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animate);
      this._activeAnimations.set(animId, { frameId, resolve });
    });
  }

  /**
   * Cancel animation
   * @param {number} animId - Animation ID
   */
  cancelAnimation(animId) {
    const anim = this._activeAnimations.get(animId);
    if (anim) {
      cancelAnimationFrame(anim.frameId);
      anim.resolve();
      this._activeAnimations.delete(animId);
    }
  }

  /**
   * Cancel all animations
   */
  cancelAllAnimations() {
    for (const [animId, anim] of this._activeAnimations.entries()) {
      cancelAnimationFrame(anim.frameId);
      anim.resolve();
    }
    this._activeAnimations.clear();
    console.log('🛑 Cancelled all animations');
  }

  /**
   * Get active animation count
   * @returns {number}
   */
  getActiveAnimationCount() {
    return this._activeAnimations.size;
  }

  /**
   * Check if any animations are active
   * @returns {boolean}
   */
  hasActiveAnimations() {
    return this._activeAnimations.size > 0;
  }
}

// Create singleton instance
export const animationEngine = new AnimationEngine();

/**
 * Utility: Animate multiple properties simultaneously
 * @param {Object} options - Animation options
 * @returns {Promise<void>}
 */
export async function animateMultiple(options) {
  const { nodeId, position, opacity, scale, duration } = options;
  const promises = [];

  if (position) {
    promises.push(animationEngine.animatePosition(
      { x: position.startX, y: position.startY },
      position.endX,
      position.endY,
      duration
    ));
  }

  if (opacity !== undefined) {
    promises.push(animationEngine._animateOpacity(
      nodeId,
      opacity.start,
      opacity.end,
      duration
    ));
  }

  if (scale !== undefined) {
    promises.push(animationEngine.animateScale(
      nodeId,
      scale.start,
      scale.end,
      duration
    ));
  }

  await Promise.all(promises);
}
