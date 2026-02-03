// ================================================================
// TEST START SEQUENCE IN DASHBOARD CONSOLE
// ================================================================
// Copy and paste this into your browser console while on dashboard.html
// ================================================================

console.log('%c🧪 Testing START Sequence', 'color:#0f8; font-weight:bold; font-size:16px');

async function testStartSequence() {
  console.log('\n📋 Test 1: Check if scripts are loaded');
  console.log('✓ getStartSequenceData:', typeof window.getStartSequenceData);
  console.log('✓ EnhancedStartUI:', typeof window.EnhancedStartUI);
  console.log('✓ StartSequenceReport:', typeof window.StartSequenceReport);
  
  console.log('\n📋 Test 2: Check Supabase');
  console.log('✓ Supabase client:', typeof window.supabase);
  
  try {
    const { data: { user } } = await window.supabase.auth.getUser();
    console.log('✓ User authenticated:', user?.email);
    console.log('✓ User ID:', user?.id);
  } catch (error) {
    console.error('✗ Auth error:', error);
    return;
  }
  
  console.log('\n📋 Test 3: Test SQL Function directly');
  try {
    const { data: { user } } = await window.supabase.auth.getUser();
    const { data, error } = await window.supabase.rpc('get_start_sequence_data', {
      auth_user_id: user.id
    });
    
    if (error) {
      console.error('✗ SQL Error:', error);
      return;
    }
    
    console.log('✓ SQL function returned data!');
    console.log('Data type:', typeof data);
    console.log('Data keys:', Object.keys(data || {}));
    console.log('Full data:', data);
  } catch (error) {
    console.error('✗ Exception:', error);
    return;
  }
  
  console.log('\n📋 Test 4: Test Report Generator');
  try {
    const data = await window.getStartSequenceData(true);
    console.log('✓ Report generator works!');
    console.log('Has profile:', data.has_profile);
    console.log('Profile name:', data.profile?.name);
    console.log('Immediate actions:', {
      pending_requests: data.immediate_actions?.pending_requests?.count,
      unread_messages: data.immediate_actions?.unread_messages?.count,
      pending_bids: data.immediate_actions?.pending_bids?.count
    });
    console.log('Opportunities:', {
      skill_matched_projects: data.opportunities?.skill_matched_projects?.count,
      active_themes: data.opportunities?.active_themes?.count
    });
  } catch (error) {
    console.error('✗ Report generator error:', error);
    return;
  }
  
  console.log('\n📋 Test 5: Generate Summary');
  try {
    const summary = await window.generateStartSummary(true);
    console.log('✓ Summary generated!');
    console.log('Summary:', summary);
  } catch (error) {
    console.error('✗ Summary error:', error);
    return;
  }
  
  console.log('\n📋 Test 6: Generate Insights');
  try {
    const insights = await window.generateStartInsights(true);
    console.log('✓ Insights generated!');
    console.log('Number of insights:', insights.length);
    insights.forEach((insight, i) => {
      console.log(`  ${i + 1}. [${insight.priority}] ${insight.message}`);
    });
  } catch (error) {
    console.error('✗ Insights error:', error);
    return;
  }
  
  console.log('\n📋 Test 7: Open Enhanced START UI');
  try {
    await window.EnhancedStartUI.open();
    console.log('✓ START UI opened! Check the modal.');
  } catch (error) {
    console.error('✗ UI error:', error);
    return;
  }
  
  console.log('\n✅ All tests passed!');
}

// Run the test
testStartSequence();
