// ================================================================
// CENTRALIZED LOGGING UTILITY
// ================================================================
// Provides environment-aware logging with debug gating, log-once,
// and throttling capabilities to reduce console noise while
// preserving strong debuggability.
//
// Usage:
//   import log from './assets/js/logger.js';
//   log.debug('Verbose data:', data);
//   log.info('Milestone reached');
//   log.warn('Warning message');
//   log.error('Error occurred', error);
//   log.once('key', 'This prints only once per session');
//   log.throttle('key', 5000, 'This prints max once per 5 seconds');
//
// Debug mode enabled when:
//   - window.appFlags?.debugSignals === true
//   - localStorage.DEBUG === "1"
//   - URL contains ?debug=1
// ================================================================

const log = (() => {
  'use strict';

  // ================================================================
  // DEBUG MODE DETECTION
  // ================================================================
  
  function isDebugMode() {
    // Check window.appFlags
    if (window.appFlags?.debugSignals === true) {
      return true;
    }
    
    // Check localStorage
    try {
      if (localStorage.getItem('DEBUG') === '1') {
        return true;
      }
    } catch (e) {
      // localStorage might not be available
    }
    
    // Check URL parameter
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('debug') === '1') {
        return true;
      }
    } catch (e) {
      // URL parsing might fail
    }
    
    return false;
  }

  // ================================================================
  // LOG-ONCE TRACKING
  // ================================================================
  
  const logOnceKeys = new Set();
  
  function hasLoggedOnce(key) {
    return logOnceKeys.has(key);
  }
  
  function markLoggedOnce(key) {
    logOnceKeys.add(key);
  }

  // ================================================================
  // THROTTLE TRACKING
  // ================================================================
  
  const throttleTimestamps = new Map();
  
  function shouldThrottle(key, intervalMs) {
    const now = Date.now();
    const lastLog = throttleTimestamps.get(key);
    
    if (!lastLog || (now - lastLog) >= intervalMs) {
      throttleTimestamps.set(key, now);
      return false;
    }
    
    return true;
  }

  // ================================================================
  // MODULE LOAD TRACKING (Duplicate Detection)
  // ================================================================
  
  const loadedModules = new Map();
  
  function trackModuleLoad(moduleName) {
    const count = (loadedModules.get(moduleName) || 0) + 1;
    loadedModules.set(moduleName, count);
    
    if (count > 1) {
      console.warn(
        `⚠️ Module "${moduleName}" loaded ${count} times! Check for duplicate script tags.`
      );
    }
  }

  // ================================================================
  // FORMATTING HELPERS
  // ================================================================
  
  function formatArgs(args) {
    return args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          // Limit object depth in production
          if (!isDebugMode()) {
            return JSON.stringify(arg, null, 0);
          }
          return arg;
        } catch (e) {
          return '[Circular or non-serializable object]';
        }
      }
      return arg;
    });
  }

  // ================================================================
  // CORE LOGGING FUNCTIONS
  // ================================================================
  
  const logger = {
    /**
     * Debug logs - verbose, data-heavy logs
     * Only shown when debug mode is enabled
     */
    debug(...args) {
      if (!isDebugMode()) return;
      console.log(...formatArgs(args));
    },
    
    /**
     * Info logs - lifecycle milestones
     * Always shown, but should be used sparingly for major events only
     */
    info(...args) {
      console.log(...formatArgs(args));
    },
    
    /**
     * Warning logs - always shown
     */
    warn(...args) {
      console.warn(...formatArgs(args));
    },
    
    /**
     * Error logs - always shown
     */
    error(...args) {
      console.error(...formatArgs(args));
    },
    
    /**
     * Log once per session
     * @param {string} key - Unique identifier for this log
     * @param {...any} args - Arguments to log
     */
    once(key, ...args) {
      if (hasLoggedOnce(key)) return;
      markLoggedOnce(key);
      console.log(...formatArgs(args));
    },
    
    /**
     * Throttled logging - limits repeated logs
     * @param {string} key - Unique identifier for this log
     * @param {number} intervalMs - Minimum time between logs in milliseconds
     * @param {...any} args - Arguments to log
     */
    throttle(key, intervalMs, ...args) {
      if (shouldThrottle(key, intervalMs)) return;
      console.log(...formatArgs(args));
    },
    
    /**
     * Track module loading and warn on duplicates
     * @param {string} moduleName - Name of the module being loaded
     */
    moduleLoad(moduleName) {
      trackModuleLoad(moduleName);
      this.debug(`📦 Module loaded: ${moduleName}`);
    },
    
    /**
     * Performance timing helper
     * @param {string} label - Label for the timing
     * @param {number} startTime - Start time from performance.now()
     * @param {number} endTime - End time from performance.now()
     */
    perf(label, startTime, endTime) {
      const duration = (endTime - startTime).toFixed(2);
      this.info(`⚡ ${label}: ${duration}ms`);
    },
    
    /**
     * Grouped debug logs - only shown in debug mode
     * @param {string} groupLabel - Label for the group
     * @param {Function} fn - Function that logs within the group
     */
    debugGroup(groupLabel, fn) {
      if (!isDebugMode()) return;
      console.group(groupLabel);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    },
    
    /**
     * Check if debug mode is currently enabled
     * @returns {boolean}
     */
    isDebugMode() {
      return isDebugMode();
    },
    
    /**
     * Enable debug mode programmatically
     */
    enableDebug() {
      try {
        localStorage.setItem('DEBUG', '1');
        console.log('🐛 Debug mode enabled');
      } catch (e) {
        console.warn('Failed to enable debug mode:', e);
      }
    },
    
    /**
     * Disable debug mode programmatically
     */
    disableDebug() {
      try {
        localStorage.removeItem('DEBUG');
        console.log('🐛 Debug mode disabled');
      } catch (e) {
        console.warn('Failed to disable debug mode:', e);
      }
    }
  };

  // ================================================================
  // EXPORT
  // ================================================================
  
  // Make available globally for non-module scripts
  window.log = logger;
  
  // Also support CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = logger;
  }
  
  // Initial debug mode status
  if (isDebugMode()) {
    console.log('🐛 Debug mode is ENABLED');
    console.log('   To disable: log.disableDebug() or remove ?debug=1 from URL');
  } else {
    // Only show this once per session
    logger.once('debug-mode-info', 
      '💡 Debug mode is OFF. To enable: log.enableDebug() or add ?debug=1 to URL'
    );
  }
  
  logger.info('✅ Centralized logger initialized');
  
  // Return logger for ES6 module export
  return logger;
})();

// ES6 module exports (outside IIFE)
// Export both named and default for maximum compatibility
export { log as logger };
export default log;
