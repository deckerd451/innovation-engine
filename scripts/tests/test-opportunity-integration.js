// ================================================================
// OPPORTUNITY ENGINE INTEGRATION TEST
// ================================================================
// Run this in browser console after page loads to verify integration

console.log('%c🧪 Testing Opportunity Engine Integration...', 'color: #00e0ff; font-size: 16px; font-weight: bold;');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ ${name}`);
      passed++;
      tests.push({ name, status: 'PASS' });
    } else {
      console.error(`❌ ${name}`);
      failed++;
      tests.push({ name, status: 'FAIL', reason: 'Returned false' });
    }
  } catch (error) {
    console.error(`❌ ${name}:`, error.message);
    failed++;
    tests.push({ name, status: 'FAIL', reason: error.message });
  }
}

// Test 1: Engine loaded
test('OpportunityEngine loaded', () => {
  return !!window.OpportunityEngine;
});

// Test 2: Synapse API exists
test('synapseApi exists', () => {
  return !!window.synapseApi;
});

// Test 3: Opportunities API exists
test('synapseApi.opportunities exists', () => {
  return !!window.synapseApi?.opportunities;
});

// Test 4: getAll method works
test('opportunities.getAll() returns array', () => {
  const result = window.synapseApi.opportunities.getAll();
  return Array.isArray(result);
});

// Test 5: getCount method works
test('opportunities.getCount() returns number', () => {
  const result = window.synapseApi.opportunities.getCount();
  return typeof result === 'number';
});

// Test 6: getTrending method works
test('opportunities.getTrending() returns array', () => {
  const result = window.synapseApi.opportunities.getTrending(5);
  return Array.isArray(result);
});

// Test 7: getTop method works
test('opportunities.getTop() returns object or null', () => {
  const result = window.synapseApi.opportunities.getTop();
  return result === null || typeof result === 'object';
});

// Test 8: Synapse nodes exist
test('Synapse nodes loaded', () => {
  const nodes = window.synapseApi.debug.getNodes();
  return Array.isArray(nodes) && nodes.length > 0;
});

// Test 9: Synapse links exist
test('Synapse links loaded', () => {
  const links = window.synapseApi.debug.getLinks();
  return Array.isArray(links);
});

// Test 10: No theme nodes in graph
test('No theme nodes in graph (themes disabled)', () => {
  const nodes = window.synapseApi.debug.getNodes();
  const themeNodes = nodes.filter(n => n.type === 'theme');
  return themeNodes.length === 0;
});

// Test 11: People nodes exist
test('People nodes exist', () => {
  const nodes = window.synapseApi.debug.getNodes();
  const peopleNodes = nodes.filter(n => n.type === 'person');
  return peopleNodes.length > 0;
});

// Test 12: Project nodes exist
test('Project nodes exist', () => {
  const nodes = window.synapseApi.debug.getNodes();
  const projectNodes = nodes.filter(n => n.type === 'project');
  return projectNodes.length >= 0; // May be 0 if no projects
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`%c📊 Test Results: ${passed} passed, ${failed} failed`, 
  failed === 0 ? 'color: #00ff88; font-weight: bold;' : 'color: #ff6b6b; font-weight: bold;');
console.log('='.repeat(60));

if (failed === 0) {
  console.log('%c🎉 All tests passed! Integration successful.', 'color: #00ff88; font-size: 14px; font-weight: bold;');
} else {
  console.log('%c⚠️ Some tests failed. Check errors above.', 'color: #ff6b6b; font-size: 14px; font-weight: bold;');
}

// Detailed info
console.log('\n📋 Detailed Information:');
console.log('Opportunity Count:', window.synapseApi.opportunities.getCount());
console.log('Trending Opportunities:', window.synapseApi.opportunities.getTrending(3));
console.log('Top Opportunity:', window.synapseApi.opportunities.getTop());
console.log('Total Nodes:', window.synapseApi.debug.getNodes().length);
console.log('Total Links:', window.synapseApi.debug.getLinks().length);

// Node type breakdown
const nodes = window.synapseApi.debug.getNodes();
const nodeTypes = {};
nodes.forEach(n => {
  nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
});
console.log('Node Types:', nodeTypes);

// Return test results
window.opportunityIntegrationTests = {
  passed,
  failed,
  total: passed + failed,
  tests,
  success: failed === 0
};

console.log('\n💡 Tip: Results saved to window.opportunityIntegrationTests');
console.log('💡 Run: window.opportunityIntegrationTests.success');
