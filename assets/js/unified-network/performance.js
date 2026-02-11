/**
 * Performance Optimization Module
 * 
 * Provides performance optimizations for the Unified Network Discovery system:
 * - DOM update batching
 * - Viewport-based spatial culling (already in node-renderer.js)
 * - Memory management for large graphs
 * - Background pause detection
 * - Performance monitoring
 * 
 * Requirements: 15.3, 15.5, 15.7
 */

import { logger } from '../logger.js';

export class PerformanceManager {
  constructor() {
    this.isBackgrounded = false;
    this.performanceMetrics = {
      fps: 60,
      frameTime: 0,
      nodeCount: 0,
      renderTime: 0,
      updateTime: 0,
      memoryUsage: 0
    };
    
    // DOM update batching
    this.pendingDOMUpdates = [];
    this.batchUpdateScheduled = false;
    
    // Memory management
    this.nodeCache = new Map();
    this.maxCacheSize = 1000;
    
    // Performance monitoring
    this.frameTimestamps = [];
    this.maxFrameTimestamps = 60; // Track last 60 frames
    
    logger.info('PerformanceManager', 'Initialized');
  }
  
  /**
   * Initialize performance monitoring
   */
  initialize() {
    // Setup background detection
    this.setupBackgroundDetection();
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring();
    
    // Setup memory monitoring
    this.setupMemoryMonitoring();
    
    logger.info('PerformanceManager', 'Performance monitoring enabled');
  }
  
  /**
   * Setup background detection
   * Requirement 15.3
   */
  setupBackgroundDetection() {
    // Page Visibility API
    document.addEventListener('visibilitychange', () => {
      this.isBackgrounded = document.hidden;
      
      if (this.isBackgrounded) {
        logger.info('PerformanceManager', 'App backgrounded - pausing updates');
        this.emit('background-pause');
      } else {
        logger.info('PerformanceManager', 'App foregrounded - resuming updates');
        this.emit('background-resume');
      }
    });
    
    // Blur/focus events as fallback
    window.addEventListener('blur', () => {
      if (!this.isBackgrounded) {
        this.isBackgrounded = true;
        logger.debug('PerformanceManager', 'Window blurred');
        this.emit('background-pause');
      }
    });
    
    window.addEventListener('focus', () => {
      if (this.isBackgrounded) {
        this.isBackgrounded = false;
        logger.debug('PerformanceManager', 'Window focused');
        this.emit('background-resume');
      }
    });
    
    logger.debug('PerformanceManager', 'Background detection enabled');
  }
  
  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor frame rate
    let lastTime = performance.now();
    
    const measureFrame = () => {
      const now = performance.now();
      const frameTime = now - lastTime;
      lastTime = now;
      
      // Track frame timestamps
      this.frameTimestamps.push(now);
      if (this.frameTimestamps.length > this.maxFrameTimestamps) {
        this.frameTimestamps.shift();
      }
      
      // Calculate FPS
      if (this.frameTimestamps.length >= 2) {
        const timeSpan = this.frameTimestamps[this.frameTimestamps.length - 1] - 
                        this.frameTimestamps[0];
        const fps = (this.frameTimestamps.length - 1) / (timeSpan / 1000);
        this.performanceMetrics.fps = Math.round(fps);
      }
      
      this.performanceMetrics.frameTime = frameTime;
      
      // ✅ PERFORMANCE: Stop monitoring when idle or hidden
      if (!this.isBackgrounded && !document.hidden && 
          (!window.AnimationLifecycle || window.AnimationLifecycle.isActive())) {
        requestAnimationFrame(measureFrame);
      }
    };
    
    requestAnimationFrame(measureFrame);
    
    logger.debug('PerformanceManager', 'Performance monitoring started');
  }
  
  /**
   * Setup memory monitoring
   */
  setupMemoryMonitoring() {
    // Check if Performance Memory API is available
    if (performance.memory) {
      setInterval(() => {
        this.performanceMetrics.memoryUsage = performance.memory.usedJSHeapSize;
        
        // Warn if memory usage is high
        const memoryMB = this.performanceMetrics.memoryUsage / (1024 * 1024);
        if (memoryMB > 100) {
          logger.warn('PerformanceManager', 'High memory usage', { memoryMB });
        }
      }, 10000); // Check every 10 seconds
      
      logger.debug('PerformanceManager', 'Memory monitoring enabled');
    } else {
      logger.debug('PerformanceManager', 'Memory API not available');
    }
  }
  
  /**
   * Batch DOM update
   * Requirement 15.5
   */
  batchDOMUpdate(updateFn) {
    this.pendingDOMUpdates.push(updateFn);
    
    if (!this.batchUpdateScheduled) {
      this.batchUpdateScheduled = true;
      
      requestAnimationFrame(() => {
        this.flushDOMUpdates();
      });
    }
  }
  
  /**
   * Flush pending DOM updates
   */
  flushDOMUpdates() {
    const startTime = performance.now();
    
    // Execute all pending updates
    for (const updateFn of this.pendingDOMUpdates) {
      try {
        updateFn();
      } catch (error) {
        logger.error('PerformanceManager', 'DOM update failed', error);
      }
    }
    
    const updateTime = performance.now() - startTime;
    this.performanceMetrics.updateTime = updateTime;
    
    // Clear pending updates
    this.pendingDOMUpdates = [];
    this.batchUpdateScheduled = false;
    
    if (updateTime > 16) {
      logger.warn('PerformanceManager', 'Slow DOM update', { updateTime });
    }
  }
  
  /**
   * Manage node cache for large graphs
   * Requirement 15.7
   */
  cacheNode(nodeId, nodeData) {
    // Check cache size
    if (this.nodeCache.size >= this.maxCacheSize) {
      // Remove oldest entry (LRU)
      const firstKey = this.nodeCache.keys().next().value;
      this.nodeCache.delete(firstKey);
    }
    
    this.nodeCache.set(nodeId, {
      data: nodeData,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get cached node
   */
  getCachedNode(nodeId) {
    const cached = this.nodeCache.get(nodeId);
    
    if (cached) {
      // Update timestamp (LRU)
      cached.timestamp = Date.now();
      return cached.data;
    }
    
    return null;
  }
  
  /**
   * Clear node cache
   */
  clearNodeCache() {
    this.nodeCache.clear();
    logger.debug('PerformanceManager', 'Node cache cleared');
  }
  
  /**
   * Optimize for large graphs
   */
  optimizeForLargeGraph(nodeCount) {
    if (nodeCount > 100) {
      logger.info('PerformanceManager', 'Large graph detected, applying optimizations', { nodeCount });
      
      // Increase cache size
      this.maxCacheSize = Math.min(2000, nodeCount * 2);
      
      // Emit event for other components to optimize
      this.emit('large-graph-detected', { nodeCount });
    }
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return { ...this.performanceMetrics };
  }
  
  /**
   * Get FPS
   */
  getFPS() {
    return this.performanceMetrics.fps;
  }
  
  /**
   * Check if backgrounded
   */
  isBackgrounded() {
    return this.isBackgrounded;
  }
  
  /**
   * Get memory usage (MB)
   */
  getMemoryUsageMB() {
    return this.performanceMetrics.memoryUsage / (1024 * 1024);
  }
  
  /**
   * Log performance report
   */
  logPerformanceReport() {
    const metrics = this.getMetrics();
    const memoryMB = this.getMemoryUsageMB();
    
    logger.info('PerformanceManager', 'Performance Report', {
      fps: metrics.fps,
      frameTime: `${metrics.frameTime.toFixed(2)}ms`,
      nodeCount: metrics.nodeCount,
      renderTime: `${metrics.renderTime.toFixed(2)}ms`,
      updateTime: `${metrics.updateTime.toFixed(2)}ms`,
      memoryUsage: `${memoryMB.toFixed(2)}MB`,
      cacheSize: this.nodeCache.size
    });
  }
  
  /**
   * Throttle function execution
   */
  throttle(fn, delay) {
    let lastCall = 0;
    
    return function(...args) {
      const now = Date.now();
      
      if (now - lastCall >= delay) {
        lastCall = now;
        return fn.apply(this, args);
      }
    };
  }
  
  /**
   * Debounce function execution
   */
  debounce(fn, delay) {
    let timeoutId;
    
    return function(...args) {
      clearTimeout(timeoutId);
      
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
      }, delay);
    };
  }
  
  /**
   * Request idle callback with fallback
   */
  requestIdleCallback(callback, options = {}) {
    if (window.requestIdleCallback) {
      return window.requestIdleCallback(callback, options);
    } else {
      // Fallback to setTimeout
      return setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => 50
        });
      }, 1);
    }
  }
  
  /**
   * Cancel idle callback
   */
  cancelIdleCallback(id) {
    if (window.cancelIdleCallback) {
      window.cancelIdleCallback(id);
    } else {
      clearTimeout(id);
    }
  }
  
  /**
   * Measure performance of a function
   */
  measure(name, fn) {
    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    logger.debug('PerformanceManager', `Performance: ${name}`, { duration: `${duration.toFixed(2)}ms` });
    
    return result;
  }
  
  /**
   * Async measure performance
   */
  async measureAsync(name, fn) {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    logger.debug('PerformanceManager', `Performance: ${name}`, { duration: `${duration.toFixed(2)}ms` });
    
    return result;
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
    this.clearNodeCache();
    this.pendingDOMUpdates = [];
    this.frameTimestamps = [];
    this.eventHandlers = {};
    
    logger.info('PerformanceManager', 'Destroyed');
  }
}

// Create singleton instance
export const performanceManager = new PerformanceManager();

/**
 * Performance utilities
 */
export const PerformanceUtils = {
  /**
   * Check if device is low-end
   */
  isLowEndDevice() {
    // Check hardware concurrency
    const cores = navigator.hardwareConcurrency || 2;
    
    // Check device memory (if available)
    const memory = navigator.deviceMemory || 4;
    
    // Low-end: < 4 cores or < 4GB RAM
    return cores < 4 || memory < 4;
  },
  
  /**
   * Check if on mobile
   */
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },
  
  /**
   * Get device pixel ratio
   */
  getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
  },
  
  /**
   * Check if battery saver mode (if available)
   */
  async isBatterySaverMode() {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        // Consider battery saver if < 20% and not charging
        return battery.level < 0.2 && !battery.charging;
      } catch (error) {
        return false;
      }
    }
    return false;
  }
};
