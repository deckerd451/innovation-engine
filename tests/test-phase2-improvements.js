// ================================================================
// TEST SCRIPT FOR PHASE 2 IMPROVEMENTS
// ================================================================
// Run this in browser console on dashboard.html to test:
// 1. Empty state handling
// 2. Toast notifications
// 3. Action button error handling
// 4. Theme count checking
// ================================================================

console.log('%c🧪 Testing Phase 2 Improvements', 'color:#0f8; font-weight:bold; font-size:16px;');

async function testPhase2() {
  console.log('\n📋 Test Suite: Phase 2 Improvements\n');

  // Test 1: Check if enhanced UI is loaded
  console.log('Test 1: Check Enhanced UI');
  if (window.EnhancedStartUI) {
    console.log('✅ EnhancedStartUI loaded');
  } else {
    console.error('❌ EnhancedStartUI not found');
    return;
  }

  // Test 2: Check if toast notification works
  console.log('\nTest 2: Toast Notification System');
  try {
    window.EnhancedStartUI.showToast('Test notification - Info', 'info');
    setTimeout(() => {
      window.EnhancedStartUI.showToast('Test notification - Success', 'success');
    }, 1000);
    setTimeout(() => {
      window.EnhancedStartUI.showToast('Test notification - Warning', 'warning');
    }, 2000);
    setTimeout(() => {
      window.EnhancedStartUI.showToast('Test notification - Error', 'error');
    }, 3000);
    console.log('✅ Toast notifications working (check top-right corner)');
  } catch (error) {
    console.error('❌ Toast notification failed:', error);
  }

  // Test 3: Get START data and check insights
  console.log('\nTest 3: Check Insights Generation');
  try {
    const data = await window.getStartSequenceData(true);
    console.log('✅ Data loaded:', data);

    const insights = window.StartSequenceFormatter.generateInsights(data);
    console.log('✅ Insights generated:', insights.length, 'insights');
    
    // Check for empty state insights
    const hasEmptyStateInsights = insights.some(i => i.type === 'onboarding');
    if (hasEmptyStateInsights) {
      console.log('✅ Empty state insights detected (first-time user flow)');
    } else {
      console.log('ℹ️ No empty state insights (user has activity)');
    }

    // Log all insights
    insights.forEach((insight, i) => {
      console.log(`  ${i + 1}. [${insight.priority}] ${insight.message}`);
      if (insight.handler) {
        console.log(`     → Handler: ${insight.handler}`);
      }
      if (insight.data) {
        console.log(`     → Data:`, insight.data);
      }
    });

  } catch (error) {
    console.error('❌ Failed to generate insights:', error);
  }

  // Test 4: Check theme count handling
  console.log('\nTest 4: Theme Count Handling');
  try {
    const data = await window.getStartSequenceData();
    const themeCount = data.opportunities?.active_themes?.count || 0;
    console.log(`ℹ️ Current theme count: ${themeCount}`);
    
    if (themeCount === 0) {
      console.log('✅ Empty theme state detected - will show helpful message');
    } else {
      console.log(`✅ ${themeCount} themes available - will filter synapse`);
    }
  } catch (error) {
    console.error('❌ Failed to check theme count:', error);
  }

  // Test 5: Simulate action handler with error
  console.log('\nTest 5: Error Handling in Action Handlers');
  try {
    // Create a mock event
    const mockEvent = {
      stopPropagation: () => {},
      preventDefault: () => {},
      currentTarget: {
        dataset: {
          insightData: JSON.stringify({ themeCount: 0 })
        }
      }
    };

    // Test openThemes with 0 themes
    console.log('ℹ️ Testing openThemes handler with 0 themes...');
    window.EnhancedStartUI.handleAction('openThemes', mockEvent);
    console.log('✅ Handler executed (check for toast notification)');

  } catch (error) {
    console.error('❌ Handler failed:', error);
  }

  // Test 6: Check summary generation
  console.log('\nTest 6: Summary Generation');
  try {
    const summary = await window.generateStartSummary();
    console.log('✅ Summary generated:');
    console.log(`   - People: ${summary.people}`);
    console.log(`   - Themes: ${summary.themes_interested}`);
    console.log(`   - Organizations: ${summary.organizations_followed}`);
    console.log(`   - Connections: ${summary.connections_accepted}`);
  } catch (error) {
    console.error('❌ Failed to generate summary:', error);
  }

  console.log('\n🎉 Phase 2 Test Suite Complete!');
  console.log('\n📝 Manual Tests:');
  console.log('1. Click START button');
  console.log('2. Try clicking "Browse Themes" (should show toast if 0 themes)');
  console.log('3. Try clicking other action buttons');
  console.log('4. Check that modal closes properly');
  console.log('5. Verify no loops or infinite redirects');
}

// Run tests
testPhase2();
