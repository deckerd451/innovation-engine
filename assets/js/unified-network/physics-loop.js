// assets/js/unified-network/physics-loop.js
// Physics Loop with Adaptive Frame Rate
// Version: 1.0.0

import { PERFORMANCE_CONSTANTS } from './constants.js';

/**
 * Physics Loop
 * Manages animation loop with adaptive frame rate
 */
export class PhysicsLoop {
  constructor() {
    this._running = false;
    this._frameId = null;
    this._targetFPS = PERFORMANCE_CONSTANTS.activeFPS;
    this._frameInterval = 1000 / this._targetFPS;
    this._lastFrameTime = 0;
    this._updateCallbacks = [];
    this._frameCount = 0;
    this._fpsHistory = [];
    this._lastFPSUpdate = 0;
    this._currentFPS = 0;
    this._isPaused = false;
  }

  /**
   * Start physics loop
   */
  start() {
    if (this._running) {
      console.warn('PhysicsLoop already running');
      return;
    }

    this._running = true;
    this._lastFrameTime = performance.now();
    this._frameCount = 0;
    this._isPaused = false;

    // Setup visibility change detection for background pause
    this._setupVisibilityDetection();

    // Start loop
    this._loop();

    console.log(`🔄 PhysicsLoop started at ${this._targetFPS}fps`);
  }

  /**
   * Stop physics loop
   */
  stop() {
    if (!this._running) return;

    this._running = false;
    
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }

    // Cleanup visibility detection
    this._cleanupVisibilityDetection();

    console.log('⏹️ PhysicsLoop stopped');
  }

  /**
   * Main animation loop
   * @private
   */
  _loop() {
    if (!this._running) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this._lastFrameTime;

    // Adaptive frame rate: only update if enough time has passed
    if (elapsed >= this._frameInterval) {
      // Calculate actual delta time
      const deltaTime = elapsed;
      this._lastFrameTime = currentTime - (elapsed % this._frameInterval);

      // Update FPS tracking
      this._updateFPSTracking(deltaTime);

      // Call all update callbacks
      if (!this._isPaused) {
        this._updateCallbacks.forEach(callback => {
          try {
            callback(deltaTime);
          } catch (error) {
            console.error('Error in physics loop callback:', error);
          }
        });
      }

      this._frameCount++;
    }

    // Schedule next frame
    this._frameId = requestAnimationFrame(() => this._loop());
  }

  /**
   * Update FPS tracking
   * @private
   */
  _updateFPSTracking(deltaTime) {
    const now = performance.now();
    
    // Calculate instantaneous FPS
    const instantFPS = 1000 / deltaTime;
    this._fpsHistory.push(instantFPS);

    // Keep only last 60 frames
    if (this._fpsHistory.length > 60) {
      this._fpsHistory.shift();
    }

    // Update current FPS every second
    if (now - this._lastFPSUpdate > 1000) {
      const avgFPS = this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length;
      this._currentFPS = Math.round(avgFPS);
      this._lastFPSUpdate = now;
    }
  }

  /**
   * Set target frame rate
   * @param {60|30} fps - Target FPS
   */
  setFrameRate(fps) {
    if (fps !== 60 && fps !== 30) {
      console.warn(`Invalid FPS: ${fps}. Must be 60 or 30.`);
      return;
    }

    if (this._targetFPS === fps) return;

    this._targetFPS = fps;
    this._frameInterval = 1000 / fps;

    console.log(`🎯 Frame rate changed to ${fps}fps`);
  }

  /**
   * Get current target FPS
   * @returns {number}
   */
  getTargetFPS() {
    return this._targetFPS;
  }

  /**
   * Get current actual FPS
   * @returns {number}
   */
  getCurrentFPS() {
    return this._currentFPS;
  }

  /**
   * Register update callback
   * @param {Function} callback - Update callback (receives deltaTime)
   */
  onUpdate(callback) {
    if (typeof callback !== 'function') {
      console.warn('onUpdate: callback must be a function');
      return;
    }

    this._updateCallbacks.push(callback);
  }

  /**
   * Unregister update callback
   * @param {Function} callback - Callback to remove
   */
  offUpdate(callback) {
    const index = this._updateCallbacks.indexOf(callback);
    if (index > -1) {
      this._updateCallbacks.splice(index, 1);
    }
  }

  /**
   * Clear all update callbacks
   */
  clearCallbacks() {
    this._updateCallbacks = [];
  }

  /**
   * Setup visibility detection for background pause
   * @private
   */
  _setupVisibilityDetection() {
    this._visibilityHandler = () => {
      if (document.hidden) {
        this._isPaused = true;
        console.log('⏸️ PhysicsLoop paused (tab hidden)');
      } else {
        this._isPaused = false;
        this._lastFrameTime = performance.now(); // Reset timing
        console.log('▶️ PhysicsLoop resumed (tab visible)');
      }
    };

    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  /**
   * Cleanup visibility detection
   * @private
   */
  _cleanupVisibilityDetection() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  /**
   * Check if loop is running
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Check if loop is paused
   * @returns {boolean}
   */
  isPaused() {
    return this._isPaused;
  }

  /**
   * Get frame count
   * @returns {number}
   */
  getFrameCount() {
    return this._frameCount;
  }

  /**
   * Get performance stats
   * @returns {Object}
   */
  getStats() {
    return {
      running: this._running,
      paused: this._isPaused,
      targetFPS: this._targetFPS,
      currentFPS: this._currentFPS,
      frameCount: this._frameCount,
      callbackCount: this._updateCallbacks.length
    };
  }

  /**
   * Pause loop (without stopping)
   */
  pause() {
    this._isPaused = true;
    console.log('⏸️ PhysicsLoop paused');
  }

  /**
   * Resume loop
   */
  resume() {
    if (!this._running) {
      console.warn('Cannot resume - loop not running');
      return;
    }

    this._isPaused = false;
    this._lastFrameTime = performance.now(); // Reset timing
    console.log('▶️ PhysicsLoop resumed');
  }
}

/**
 * Adaptive Frame Rate Manager
 * Automatically adjusts frame rate based on activity
 */
export class AdaptiveFrameRateManager {
  constructor(physicsLoop) {
    this._physicsLoop = physicsLoop;
    this._isActive = false;
    this._lastActivityTime = Date.now();
    this._checkInterval = null;
    this._activityThreshold = 10000; // 10 seconds
  }

  /**
   * Start adaptive frame rate management
   */
  start() {
    if (this._isActive) return;

    this._isActive = true;
    this._lastActivityTime = Date.now();

    // Check every 2 seconds
    this._checkInterval = setInterval(() => {
      this._checkActivity();
    }, 2000);

    console.log('🎯 Adaptive frame rate manager started');
  }

  /**
   * Stop adaptive frame rate management
   */
  stop() {
    if (!this._isActive) return;

    this._isActive = false;

    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }

    console.log('🎯 Adaptive frame rate manager stopped');
  }

  /**
   * Mark activity (user interaction)
   */
  markActivity() {
    this._lastActivityTime = Date.now();

    // Immediately switch to active FPS
    if (this._physicsLoop.getTargetFPS() !== PERFORMANCE_CONSTANTS.activeFPS) {
      this._physicsLoop.setFrameRate(PERFORMANCE_CONSTANTS.activeFPS);
    }
  }

  /**
   * Check activity and adjust frame rate
   * @private
   */
  _checkActivity() {
    const timeSinceActivity = Date.now() - this._lastActivityTime;

    if (timeSinceActivity > this._activityThreshold) {
      // Switch to calm FPS
      if (this._physicsLoop.getTargetFPS() !== PERFORMANCE_CONSTANTS.calmFPS) {
        this._physicsLoop.setFrameRate(PERFORMANCE_CONSTANTS.calmFPS);
        console.log('😌 Switched to calm frame rate (30fps)');
      }
    } else {
      // Switch to active FPS
      if (this._physicsLoop.getTargetFPS() !== PERFORMANCE_CONSTANTS.activeFPS) {
        this._physicsLoop.setFrameRate(PERFORMANCE_CONSTANTS.activeFPS);
        console.log('⚡ Switched to active frame rate (60fps)');
      }
    }
  }

  /**
   * Set activity threshold
   * @param {number} threshold - Threshold in milliseconds
   */
  setActivityThreshold(threshold) {
    this._activityThreshold = threshold;
  }
}

// Create singleton instance
export const physicsLoop = new PhysicsLoop();
