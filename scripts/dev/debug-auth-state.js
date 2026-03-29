// Run this in your browser console on dashboard.html to check auth state

(async () => {
  console.log('🔍 Checking authentication state...');
  
  // Check if supabase client exists
  if (!window.supabase) {
    console.error('❌ Supabase client not found!');
    return;
  }
  
  // Get current session
  const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
  
  if (sessionError) {
    console.error('❌ Session error:', sessionError);
    return;
  }
  
  if (!session) {
    console.error('❌ No active session - user is NOT authenticated');
    return;
  }
  
  console.log('✅ User is authenticated');
  console.log('Auth UID:', session.user.id);
  console.log('Email:', session.user.email);
  
  // Check community record
  const { data: communityData, error: communityError } = await window.supabase
    .from('community')
    .select('id, name, email')
    .eq('user_id', session.user.id)
    .single();
  
  if (communityError) {
    console.error('❌ Community lookup error:', communityError);
    return;
  }
  
  if (!communityData) {
    console.error('❌ No community record found for this user!');
    return;
  }
  
  console.log('✅ Community record found');
  console.log('Community ID:', communityData.id);
  console.log('Name:', communityData.name);
  
  // Test the function
  const { data: funcResult, error: funcError } = await window.supabase
    .rpc('get_community_id_from_auth');
  
  if (funcError) {
    console.error('❌ get_community_id_from_auth() error:', funcError);
  } else {
    console.log('✅ get_community_id_from_auth() returns:', funcResult);
  }
  
  console.log('\n📊 Summary:');
  console.log('- Auth UID:', session.user.id);
  console.log('- Community ID:', communityData?.id);
  console.log('- Function returns:', funcResult);
  console.log('- Match:', communityData?.id === funcResult ? '✅' : '❌');
})();
