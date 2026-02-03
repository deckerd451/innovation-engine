// assets/js/logger-config.js
// Centralized logging configuration for performance optimization

/**
 * Logging levels:
 * - 0: Silent (no logs)
 * - 1: Errors only
 * - 2: Errors + Warnings
 * - 3: Errors + Warnings + Info (default for production)
 * - 4: All logs including debug (development only)
 */

const LOG_LEVEL = parseInt(localStorage.getItem('log-level') || '2'); // Default: Errors + Warnings only

// Override console methods based on log level
const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Disable verbose logging in production
if (LOG_LEVEL < 4) {
  console.debug = function() {}; // Disable debug logs
}

if (LOG_LEVEL < 3) {
  console.info = function() {}; // Disable info logs
  // Also disable verbose console.log calls (those with emojis)
  console.log = function(...args) {
    const firstArg = String(args[0] || '');
    // Skip logs with success/info emojis
    if (/[✅🔄📊🎯🔍💬📨🤝💡🧠ℹ️]/.test(firstArg)) {
      return;
    }
    // Allow other logs through
    originalConsole.log.apply(console, args);
  };
}

if (LOG_LEVEL < 2) {
  console.warn = function() {}; // Disable warnings
}

if (LOG_LEVEL < 1) {
  console.error = function() {}; // Disable errors (not recommended)
}

// Expose original console for debugging
window._originalConsole = originalConsole;

// Expose function to change log level at runtime
window.setLogLevel = function(level) {
  localStorage.setItem('log-level', level);
  console.warn('⚠️ Log level changed. Reload page for changes to take effect.');
};

// Log current configuration (only if level >= 2)
if (LOG_LEVEL >= 2) {
  const levels = ['Silent', 'Errors', 'Errors+Warnings', 'Info', 'Debug'];
  originalConsole.log(`📝 Logging level: ${levels[LOG_LEVEL] || 'Unknown'} (${LOG_LEVEL})`);
  originalConsole.log('💡 Change with: setLogLevel(0-4) then reload');
}

export { LOG_LEVEL };
