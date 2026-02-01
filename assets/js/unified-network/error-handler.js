/**
 * Unified Network - Error Handler
 * 
 * Comprehensive error handling and recovery system for the unified network.
 * Provides graceful degradation, user notifications, and automatic recovery.
 */

import { logger } from '../logger.js';

// Error types
export const ErrorType = {
  DATA_LOADING: 'data-loading',
  PHYSICS_SIMULATION: 'physics-simulation',
  PRESENCE_TRACKING: 'presence-tracking',
  RENDERING: 'rendering',
  USER_ACTION: 'user-action',
  INITIALIZATION: 'initialization',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

// Error severity levels
export const ErrorSeverity = {
  CRITICAL: 'critical',  // System cannot continue
  HIGH: 'high',          // Major feature broken
  MEDIUM: 'medium',      // Minor feature broken
  LOW: 'low'             // Cosmetic issue
};

// Recovery strategies
export const RecoveryStrategy = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  IGNORE: 'ignore',
  RELOAD: 'reload',
  NOTIFY: 'notify'
};

/**
 * Error Handler Class
 */
export class ErrorHandler {
  constructor() {
    this.errors = [];
    this.recoveryAttempts = new Map();
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
    this.notificationCallback = null;
    this.fallbackCallback = null;
  }
  
  /**
   * Set notification callback
   */
  setNotificationCallback(callback) {
    this.notificationCallback = callback;
  }
  
  /**
   * Set fallback callback (e.g., switch to legacy synapse)
   */
  setFallbackCallback(callback) {
    this.fallbackCallback = callback;
  }
  
  /**
   * Handle an error
   */
  async handleError(error, context = {}) {
    const errorInfo = this.categorizeError(error, context);
    
    // Log the error
    this.logError(errorInfo);
    
    // Store error for debugging
    this.errors.push({
      ...errorInfo,
      timestamp: Date.now()
    });
    
    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors.shift();
    }
    
    // Determine recovery strategy
    const strategy = this.determineRecoveryStrategy(errorInfo);
    
    // Execute recovery
    await this.executeRecovery(errorInfo, strategy);
    
    return errorInfo;
  }
  
  /**
   * Categorize error by type and severity
   */
  categorizeError(error, context) {
    const errorInfo = {
      error,
      message: error.message || String(error),
      stack: error.stack,
      context,
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true
    };
    
    // Categorize by error message or context
    const msg = errorInfo.message.toLowerCase();
    
    // Data loading errors
    if (msg.includes('fetch') || msg.includes('load') || msg.includes('data') || 
        context.operation === 'data-loading') {
      errorInfo.type = ErrorType.DATA_LOADING;
      errorInfo.severity = ErrorSeverity.HIGH;
      errorInfo.recoverable = true;
    }
    
    // Physics simulation errors
    else if (msg.includes('simulation') || msg.includes('physics') || msg.includes('force') ||
             context.operation === 'physics') {
      errorInfo.type = ErrorType.PHYSICS_SIMULATION;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.recoverable = true;
    }
    
    // Presence tracking errors
    else if (msg.includes('presence') || msg.includes('realtime') || msg.includes('subscription') ||
             context.operation === 'presence') {
      errorInfo.type = ErrorType.PRESENCE_TRACKING;
      errorInfo.severity = ErrorSeverity.LOW;
      errorInfo.recoverable = true;
    }
    
    // Rendering errors
    else if (msg.includes('render') || msg.includes('dom') || msg.includes('canvas') ||
             context.operation === 'rendering') {
      errorInfo.type = ErrorType.RENDERING;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.recoverable = true;
    }
    
    // User action errors
    else if (msg.includes('action') || msg.includes('connect') || msg.includes('join') ||
             context.operation === 'user-action') {
      errorInfo.type = ErrorType.USER_ACTION;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.recoverable = true;
    }
    
    // Initialization errors
    else if (msg.includes('init') || msg.includes('initialize') || context.operation === 'initialization') {
      errorInfo.type = ErrorType.INITIALIZATION;
      errorInfo.severity = ErrorSeverity.CRITICAL;
      errorInfo.recoverable = false;
    }
    
    // Network errors
    else if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
      errorInfo.type = ErrorType.NETWORK;
      errorInfo.severity = ErrorSeverity.HIGH;
      errorInfo.recoverable = true;
    }
    
    return errorInfo;
  }
  
  /**
   * Log error with appropriate level
   */
  logError(errorInfo) {
    const logMessage = `[${errorInfo.type}] ${errorInfo.message}`;
    
    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('ErrorHandler', logMessage, errorInfo.error);
        break;
      case ErrorSeverity.HIGH:
        logger.error('ErrorHandler', logMessage, errorInfo.error);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('ErrorHandler', logMessage);
        break;
      case ErrorSeverity.LOW:
        logger.info('ErrorHandler', logMessage);
        break;
    }
  }
  
  /**
   * Determine recovery strategy based on error type and severity
   */
  determineRecoveryStrategy(errorInfo) {
    const { type, severity, recoverable } = errorInfo;
    
    // Critical errors require fallback or reload
    if (severity === ErrorSeverity.CRITICAL) {
      return recoverable ? RecoveryStrategy.FALLBACK : RecoveryStrategy.RELOAD;
    }
    
    // Strategy by error type
    switch (type) {
      case ErrorType.DATA_LOADING:
        return RecoveryStrategy.RETRY;
        
      case ErrorType.PHYSICS_SIMULATION:
        return RecoveryStrategy.FALLBACK;
        
      case ErrorType.PRESENCE_TRACKING:
        return RecoveryStrategy.RETRY; // Will fall back to polling
        
      case ErrorType.RENDERING:
        return RecoveryStrategy.RETRY;
        
      case ErrorType.USER_ACTION:
        return RecoveryStrategy.NOTIFY;
        
      case ErrorType.NETWORK:
        return RecoveryStrategy.RETRY;
        
      default:
        return RecoveryStrategy.NOTIFY;
    }
  }
  
  /**
   * Execute recovery strategy
   */
  async executeRecovery(errorInfo, strategy) {
    logger.info('ErrorHandler', `Executing recovery strategy: ${strategy}`);
    
    switch (strategy) {
      case RecoveryStrategy.RETRY:
        await this.retryOperation(errorInfo);
        break;
        
      case RecoveryStrategy.FALLBACK:
        await this.executeFallback(errorInfo);
        break;
        
      case RecoveryStrategy.IGNORE:
        // Do nothing, error is non-critical
        break;
        
      case RecoveryStrategy.RELOAD:
        this.notifyUser(
          'A critical error occurred. Please reload the page.',
          'error',
          { action: 'reload' }
        );
        break;
        
      case RecoveryStrategy.NOTIFY:
        this.notifyUser(
          this.getUserFriendlyMessage(errorInfo),
          'error'
        );
        break;
    }
  }
  
  /**
   * Retry an operation
   */
  async retryOperation(errorInfo) {
    const key = `${errorInfo.type}-${errorInfo.context.operation || 'unknown'}`;
    const attempts = this.recoveryAttempts.get(key) || 0;
    
    if (attempts >= this.maxRetries) {
      logger.warn('ErrorHandler', `Max retries reached for ${key}, falling back`);
      await this.executeFallback(errorInfo);
      return;
    }
    
    this.recoveryAttempts.set(key, attempts + 1);
    
    logger.info('ErrorHandler', `Retry attempt ${attempts + 1}/${this.maxRetries} for ${key}`);
    
    // Wait before retrying (exponential backoff)
    const delay = this.retryDelay * Math.pow(2, attempts);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Attempt to retry the operation
    if (errorInfo.context.retryCallback) {
      try {
        await errorInfo.context.retryCallback();
        logger.info('ErrorHandler', `Retry successful for ${key}`);
        this.recoveryAttempts.delete(key);
      } catch (error) {
        logger.error('ErrorHandler', `Retry failed for ${key}`, error);
        await this.handleError(error, errorInfo.context);
      }
    }
  }
  
  /**
   * Execute fallback strategy
   */
  async executeFallback(errorInfo) {
    logger.warn('ErrorHandler', 'Executing fallback strategy');
    
    // Call fallback callback if set (e.g., switch to legacy synapse)
    if (this.fallbackCallback) {
      try {
        await this.fallbackCallback(errorInfo);
        this.notifyUser(
          'Switched to fallback mode due to an error.',
          'info'
        );
      } catch (error) {
        logger.error('ErrorHandler', 'Fallback failed', error);
        this.notifyUser(
          'Unable to recover. Please reload the page.',
          'error',
          { action: 'reload' }
        );
      }
    } else {
      this.notifyUser(
        this.getUserFriendlyMessage(errorInfo),
        'error'
      );
    }
  }
  
  /**
   * Notify user of error
   */
  notifyUser(message, type = 'error', options = {}) {
    if (this.notificationCallback) {
      this.notificationCallback(message, type, options);
    } else {
      // Fallback to console
      console.error('ErrorHandler:', message);
    }
  }
  
  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(errorInfo) {
    const messages = {
      [ErrorType.DATA_LOADING]: 'Unable to load network data. Please check your connection.',
      [ErrorType.PHYSICS_SIMULATION]: 'Network visualization encountered an issue.',
      [ErrorType.PRESENCE_TRACKING]: 'Real-time presence updates are temporarily unavailable.',
      [ErrorType.RENDERING]: 'Display issue detected. Attempting to recover.',
      [ErrorType.USER_ACTION]: 'Action failed. Please try again.',
      [ErrorType.INITIALIZATION]: 'Failed to initialize network visualization.',
      [ErrorType.NETWORK]: 'Network connection issue. Please check your internet.',
      [ErrorType.UNKNOWN]: 'An unexpected error occurred.'
    };
    
    return messages[errorInfo.type] || messages[ErrorType.UNKNOWN];
  }
  
  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      total: this.errors.length,
      byType: {},
      bySeverity: {},
      recent: this.errors.slice(-10)
    };
    
    this.errors.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    });
    
    return stats;
  }
  
  /**
   * Clear error history
   */
  clearErrors() {
    this.errors = [];
    this.recoveryAttempts.clear();
    logger.info('ErrorHandler', 'Error history cleared');
  }
  
  /**
   * Check if system is healthy
   */
  isHealthy() {
    // System is unhealthy if there are recent critical errors
    const recentCritical = this.errors
      .filter(e => Date.now() - e.timestamp < 60000) // Last minute
      .filter(e => e.severity === ErrorSeverity.CRITICAL);
    
    return recentCritical.length === 0;
  }
}

/**
 * Global error handler instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Wrap async function with error handling
 */
export function withErrorHandling(fn, context = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      await errorHandler.handleError(error, context);
      throw error; // Re-throw after handling
    }
  };
}

/**
 * Wrap sync function with error handling
 */
export function withErrorHandlingSync(fn, context = {}) {
  return function(...args) {
    try {
      return fn.apply(this, args);
    } catch (error) {
      errorHandler.handleError(error, context);
      throw error; // Re-throw after handling
    }
  };
}

/**
 * Safe async operation with automatic retry
 */
export async function safeAsync(operation, context = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('ErrorHandler', `Attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  await errorHandler.handleError(lastError, {
    ...context,
    operation: 'safe-async',
    retriesExhausted: true
  });
  
  throw lastError;
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers() {
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('ErrorHandler', 'Unhandled promise rejection', event.reason);
    errorHandler.handleError(event.reason, {
      operation: 'unhandled-rejection',
      promise: event.promise
    });
  });
  
  // Catch global errors
  window.addEventListener('error', (event) => {
    logger.error('ErrorHandler', 'Global error', event.error);
    errorHandler.handleError(event.error, {
      operation: 'global-error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
  
  logger.info('ErrorHandler', 'Global error handlers setup');
}

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkErrorHandler = errorHandler;
}

logger.info('ErrorHandler', 'Error handler module loaded');
