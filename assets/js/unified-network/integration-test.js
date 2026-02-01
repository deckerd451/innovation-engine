/**
 * Integration Test for Unified Network Discovery
 * 
 * This file provides a simple integration test to validate that all
 * discovery and presence systems work together correctly.
 * 
 * Run this in the browser console after loading the dashboard.
 */

export async function runIntegrationTest() {
  console.log('🧪 Starting Unified Network Discovery Integration Test');
  console.log('================================================');
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  // Test 1: Check API availability
  console.log('\n📋 Test 1: API Availability');
  try {
    if (typeof window.unifiedNetworkApi === 'undefined') {
      throw new Error('UnifiedNetworkAPI not found on window');
    }
    console.log('✅ UnifiedNetworkAPI is available');
    results.passed.push('API Availability');
  } catch (error) {
    console.error('❌ API Availability failed:', error.message);
    results.failed.push('API Availability');
    return results; // Can't continue without API
  }
  
  const api = window.unifiedNetworkApi;
  
  // Test 2: Check initialization state
  console.log('\n📋 Test 2: Initialization State');
  try {
    if (!api._initialized) {
      results.warnings.push('API not initialized - call api.initialize() first');
      console.log('⚠️ API not initialized yet');
    } else {
      console.log('✅ API is initialized');
      results.passed.push('Initialization State');
    }
  } catch (error) {
    console.error('❌ Initialization check failed:', error.message);
    results.failed.push('Initialization State');
  }
  
  // Test 3: Check component availability
  console.log('\n📋 Test 3: Component Availability');
  const components = [
    '_graphDataStore',
    '_relevanceEngine',
    '_presenceTracker',
    '_stateManager',
    '_effectivePullCalculator',
    '_nodeRenderer',
    '_animationEngine',
    '_physicsLoop',
    '_interactionHandler',
    '_actionResolver',
    '_guidedNodeDecay',
    '_discoveryTriggerManager',
    '_temporalPresenceManager'
  ];
  
  let allComponentsPresent = true;
  for (const component of components) {
    if (!api[component]) {
      console.error(`❌ Missing component: ${component}`);
      allComponentsPresent = false;
    }
  }
  
  if (allComponentsPresent) {
    console.log('✅ All components present');
    results.passed.push('Component Availability');
  } else {
    results.failed.push('Component Availability');
  }
  
  // Test 4: Check discovery trigger manager
  console.log('\n📋 Test 4: Discovery Trigger Manager');
  try {
    if (api._discoveryTriggerManager) {
      const prefs = api.getDiscoveryPreferences();
      console.log('✅ Discovery preferences:', prefs);
      results.passed.push('Discovery Trigger Manager');
    } else {
      throw new Error('Discovery trigger manager not initialized');
    }
  } catch (error) {
    console.error('❌ Discovery trigger manager failed:', error.message);
    results.failed.push('Discovery Trigger Manager');
  }
  
  // Test 5: Check temporal presence manager
  console.log('\n📋 Test 5: Temporal Presence Manager');
  try {
    if (api._temporalPresenceManager) {
      // Try to get boosts for a test node
      const boosts = api.getAllBoosts('test-node-id');
      console.log('✅ Temporal presence manager working');
      results.passed.push('Temporal Presence Manager');
    } else {
      throw new Error('Temporal presence manager not initialized');
    }
  } catch (error) {
    console.error('❌ Temporal presence manager failed:', error.message);
    results.failed.push('Temporal Presence Manager');
  }
  
  // Test 6: Check event system
  console.log('\n📋 Test 6: Event System');
  try {
    let eventFired = false;
    const testHandler = () => { eventFired = true; };
    
    api.on('test-event', testHandler);
    api.emit('test-event', {});
    api.off('test-event', testHandler);
    
    if (eventFired) {
      console.log('✅ Event system working');
      results.passed.push('Event System');
    } else {
      throw new Error('Event did not fire');
    }
  } catch (error) {
    console.error('❌ Event system failed:', error.message);
    results.failed.push('Event System');
  }
  
  // Test 7: Check public API methods
  console.log('\n📋 Test 7: Public API Methods');
  const publicMethods = [
    'initialize',
    'destroy',
    'getState',
    'getNode',
    'getAllNodes',
    'focusNode',
    'centerOnCurrentUser',
    'resetToMyNetwork',
    'triggerDiscovery',
    'setDiscoveryPreferences',
    'getDiscoveryPreferences',
    'dismissGuidedNode',
    'updatePresence',
    'clearPresence',
    'getTemporalBoost',
    'getCollaborativeBoost',
    'getAllBoosts',
    'shouldPrioritizeTemporal',
    'executeAction',
    'on',
    'off'
  ];
  
  let allMethodsPresent = true;
  for (const method of publicMethods) {
    if (typeof api[method] !== 'function') {
      console.error(`❌ Missing method: ${method}`);
      allMethodsPresent = false;
    }
  }
  
  if (allMethodsPresent) {
    console.log('✅ All public methods present');
    results.passed.push('Public API Methods');
  } else {
    results.failed.push('Public API Methods');
  }
  
  // Test 8: Check constants
  console.log('\n📋 Test 8: Constants');
  try {
    const { 
      DISCOVERY_TRIGGERS, 
      DISCOVERY_FREQUENCY,
      PRESENCE_BOOSTS,
      TEMPORAL_THRESHOLDS 
    } = await import('./constants.js');
    
    if (DISCOVERY_TRIGGERS && DISCOVERY_FREQUENCY && PRESENCE_BOOSTS && TEMPORAL_THRESHOLDS) {
      console.log('✅ All constants defined');
      results.passed.push('Constants');
    } else {
      throw new Error('Some constants missing');
    }
  } catch (error) {
    console.error('❌ Constants check failed:', error.message);
    results.failed.push('Constants');
  }
  
  // Print summary
  console.log('\n================================================');
  console.log('📊 Test Summary');
  console.log('================================================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  
  if (results.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    results.passed.forEach(test => console.log(`   - ${test}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(test => console.log(`   - ${test}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    results.warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  console.log('\n================================================');
  
  if (results.failed.length === 0) {
    console.log('🎉 All tests passed! System is ready.');
  } else {
    console.log('⚠️  Some tests failed. Review the errors above.');
  }
  
  return results;
}

// Auto-run if loaded in browser
if (typeof window !== 'undefined') {
  window.runUnifiedNetworkIntegrationTest = runIntegrationTest;
  console.log('💡 Run integration test with: window.runUnifiedNetworkIntegrationTest()');
}
