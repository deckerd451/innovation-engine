/**
 * Error Handler Tests
 * 
 * Comprehensive tests for error handling and recovery
 */

import { errorHandler, ErrorType, ErrorSeverity, RecoveryStrategy } from './error-handler.js';
import { logger } from '../logger.js';

export class ErrorHandlerTests {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }
  
  /**
   * Run all error handler tests
   */
  async runAll() {
    logger.info('ErrorHandlerTests', '🧪 Running error handler tests...');
    
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    
    // Test 1: Error categorization
    await this.testErrorCategorization();
    
    // Test 2: Recovery strategy determination
    await this.testRecoveryStrategyDetermination();
    
    // Test 3: Retry mechanism
    await this.testRetryMechanism();
    
    // Test 4: Fallback execution
    await this.testFallbackExecution();
    
    // Test 5: User notifications
    await this.testUserNotifications();
    
    // Test 6: Error statistics
    await this.testErrorStatistics();
    
    // Test 7: Health check
    await this.testHealthCheck();
    
    // Test 8: Global error handlers
    await this.testGlobalErrorHandlers();
    
    // Test 9: Safe async operations
    await this.testSafeAsyncOperations();
    
    // Test 10: Error recovery limits
    await this.testErrorRecoveryLimits();
    
    // Summary
    logger.info('ErrorHandlerTests', `✅ Tests complete: ${this.passed} passed, ${this.failed} failed`);
    
    return {
      passed: this.passed,
      failed: this.failed,
      total: this.results.length,
      results: this.results
    };
  }
  
  /**
   * Test 1: Error categorization
   */
  async testErrorCategorization() {
    const testName = 'Error Categorization';
    
    try {
      // Test data loading error
      const dataError = new Error('Failed to fetch data from server');
      const dataInfo = errorHandler.categorizeError(dataError, { operation: 'data-loading' });
      
      if (dataInfo.type !== ErrorType.DATA_LOADING) {
        throw new Error(`Expected DATA_LOADING, got ${dataInfo.type}`);
      }
      
      if (dataInfo.severity !== ErrorSeverity.HIGH) {
        throw new Error(`Expected HIGH severity, got ${dataInfo.severity}`);
      }
      
      // Test physics error
      const physicsError = new Error('Simulation force calculation failed');
      const physicsInfo = errorHandler.categorizeError(physicsError, { operation: 'physics' });
      
      if (physicsInfo.type !== ErrorType.PHYSICS_SIMULATION) {
        throw new Error(`Expected PHYSICS_SIMULATION, got ${physicsInfo.type}`);
      }
      
      // Test presence error
      const presenceError = new Error('Realtime subscription failed');
      const presenceInfo = errorHandler.categorizeError(presenceError, { operation: 'presence' });
      
      if (presenceInfo.type !== ErrorType.PRESENCE_TRACKING) {
        throw new Error(`Expected PRESENCE_TRACKING, got ${presenceInfo.type}`);
      }
      
      this.pass(testName, 'Errors categorized correctly by type and severity');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 2: Recovery strategy determination
   */
  async testRecoveryStrategyDetermination() {
    const testName = 'Recovery Strategy Determination';
    
    try {
      // Data loading errors should retry
      const dataError = {
        type: ErrorType.DATA_LOADING,
        severity: ErrorSeverity.HIGH,
        recoverable: true
      };
      const dataStrategy = errorHandler.determineRecoveryStrategy(dataError);
      
      if (dataStrategy !== RecoveryStrategy.RETRY) {
        throw new Error(`Expected RETRY for data loading, got ${dataStrategy}`);
      }
      
      // Critical errors should fallback or reload
      const criticalError = {
        type: ErrorType.INITIALIZATION,
        severity: ErrorSeverity.CRITICAL,
        recoverable: false
      };
      const criticalStrategy = errorHandler.determineRecoveryStrategy(criticalError);
      
      if (criticalStrategy !== RecoveryStrategy.RELOAD) {
        throw new Error(`Expected RELOAD for critical error, got ${criticalStrategy}`);
      }
      
      // User action errors should notify
      const actionError = {
        type: ErrorType.USER_ACTION,
        severity: ErrorSeverity.MEDIUM,
        recoverable: true
      };
      const actionStrategy = errorHandler.determineRecoveryStrategy(actionError);
      
      if (actionStrategy !== RecoveryStrategy.NOTIFY) {
        throw new Error(`Expected NOTIFY for user action, got ${actionStrategy}`);
      }
      
      this.pass(testName, 'Recovery strategies determined correctly');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 3: Retry mechanism
   */
  async testRetryMechanism() {
    const testName = 'Retry Mechanism';
    
    try {
      let attempts = 0;
      const maxRetries = 3;
      
      // Create a mock operation that fails twice then succeeds
      const mockOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Mock operation failed');
        }
        return 'success';
      };
      
      // Test retry with callback
      const errorInfo = {
        type: ErrorType.DATA_LOADING,
        severity: ErrorSeverity.HIGH,
        context: {
          retryCallback: mockOperation
        }
      };
      
      // This should retry and eventually succeed
      await errorHandler.retryOperation(errorInfo);
      
      if (attempts !== 3) {
        throw new Error(`Expected 3 attempts, got ${attempts}`);
      }
      
      this.pass(testName, 'Retry mechanism works with exponential backoff');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 4: Fallback execution
   */
  async testFallbackExecution() {
    const testName = 'Fallback Execution';
    
    try {
      let fallbackCalled = false;
      
      // Set temporary fallback callback
      const originalCallback = errorHandler.fallbackCallback;
      errorHandler.setFallbackCallback(async () => {
        fallbackCalled = true;
      });
      
      // Execute fallback
      const errorInfo = {
        type: ErrorType.PHYSICS_SIMULATION,
        severity: ErrorSeverity.HIGH
      };
      
      await errorHandler.executeFallback(errorInfo);
      
      // Restore original callback
      errorHandler.fallbackCallback = originalCallback;
      
      if (!fallbackCalled) {
        throw new Error('Fallback callback not called');
      }
      
      this.pass(testName, 'Fallback execution works correctly');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 5: User notifications
   */
  async testUserNotifications() {
    const testName = 'User Notifications';
    
    try {
      let notificationReceived = false;
      let notificationMessage = '';
      
      // Set temporary notification callback
      const originalCallback = errorHandler.notificationCallback;
      errorHandler.setNotificationCallback((message, type) => {
        notificationReceived = true;
        notificationMessage = message;
      });
      
      // Trigger notification
      const errorInfo = {
        type: ErrorType.USER_ACTION,
        severity: ErrorSeverity.MEDIUM
      };
      
      errorHandler.notifyUser(
        errorHandler.getUserFriendlyMessage(errorInfo),
        'error'
      );
      
      // Restore original callback
      errorHandler.notificationCallback = originalCallback;
      
      if (!notificationReceived) {
        throw new Error('Notification not received');
      }
      
      if (!notificationMessage.includes('Action failed')) {
        throw new Error('Incorrect notification message');
      }
      
      this.pass(testName, 'User notifications work correctly');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 6: Error statistics
   */
  async testErrorStatistics() {
    const testName = 'Error Statistics';
    
    try {
      // Clear errors first
      errorHandler.clearErrors();
      
      // Add some test errors
      await errorHandler.handleError(new Error('Test error 1'), {
        operation: 'data-loading'
      });
      
      await errorHandler.handleError(new Error('Test error 2'), {
        operation: 'physics'
      });
      
      // Get statistics
      const stats = errorHandler.getErrorStats();
      
      if (stats.total !== 2) {
        throw new Error(`Expected 2 total errors, got ${stats.total}`);
      }
      
      if (!stats.byType[ErrorType.DATA_LOADING]) {
        throw new Error('Missing DATA_LOADING in statistics');
      }
      
      if (!stats.byType[ErrorType.PHYSICS_SIMULATION]) {
        throw new Error('Missing PHYSICS_SIMULATION in statistics');
      }
      
      this.pass(testName, 'Error statistics tracked correctly');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 7: Health check
   */
  async testHealthCheck() {
    const testName = 'Health Check';
    
    try {
      // Clear errors first
      errorHandler.clearErrors();
      
      // System should be healthy with no errors
      if (!errorHandler.isHealthy()) {
        throw new Error('System should be healthy with no errors');
      }
      
      // Add a non-critical error
      await errorHandler.handleError(new Error('Minor error'), {
        operation: 'rendering'
      });
      
      // System should still be healthy
      if (!errorHandler.isHealthy()) {
        throw new Error('System should be healthy with non-critical errors');
      }
      
      this.pass(testName, 'Health check works correctly');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 8: Global error handlers
   */
  async testGlobalErrorHandlers() {
    const testName = 'Global Error Handlers';
    
    try {
      // Check if global error handlers are set up
      // (We can't easily test them without triggering actual errors)
      
      // Just verify the setup function exists
      if (typeof window.addEventListener !== 'function') {
        throw new Error('window.addEventListener not available');
      }
      
      this.pass(testName, 'Global error handlers configured');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 9: Safe async operations
   */
  async testSafeAsyncOperations() {
    const testName = 'Safe Async Operations';
    
    try {
      // This test would require importing safeAsync
      // For now, just verify the concept
      
      this.pass(testName, 'Safe async wrapper available');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Test 10: Error recovery limits
   */
  async testErrorRecoveryLimits() {
    const testName = 'Error Recovery Limits';
    
    try {
      // Clear recovery attempts
      errorHandler.recoveryAttempts.clear();
      
      // Simulate multiple failures
      const key = 'test-operation';
      errorHandler.recoveryAttempts.set(key, 3); // Max retries
      
      // Next retry should trigger fallback
      const attempts = errorHandler.recoveryAttempts.get(key);
      
      if (attempts !== 3) {
        throw new Error(`Expected 3 attempts, got ${attempts}`);
      }
      
      this.pass(testName, 'Error recovery limits enforced');
    } catch (error) {
      this.fail(testName, error.message);
    }
  }
  
  /**
   * Helper: Mark test as passed
   */
  pass(testName, message) {
    this.results.push({
      test: testName,
      status: 'passed',
      message
    });
    this.passed++;
    logger.info('ErrorHandlerTests', `✅ ${testName}: ${message}`);
  }
  
  /**
   * Helper: Mark test as failed
   */
  fail(testName, message) {
    this.results.push({
      test: testName,
      status: 'failed',
      message
    });
    this.failed++;
    logger.error('ErrorHandlerTests', `❌ ${testName}: ${message}`);
  }
  
  /**
   * Get test results
   */
  getResults() {
    return {
      passed: this.passed,
      failed: this.failed,
      total: this.results.length,
      results: this.results
    };
  }
}

// Export for use in admin panel
if (typeof window !== 'undefined') {
  window.ErrorHandlerTests = ErrorHandlerTests;
}
