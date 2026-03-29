// ================================================================
// Profile Linking Test Script
// ================================================================
// Run this in browser console after signing in to test the profile
// linking logic and verify logs are working correctly.
//
// Usage:
// 1. Open browser console on dashboard.html
// 2. Copy and paste this entire script
// 3. Run: testProfileLinking()
// ================================================================

window.testProfileLinking = async function() {
  console.log('🧪 ========================================');
  console.log('🧪 PROFILE LINKING TEST');
  console.log('🧪 ========================================');
  
  if (!window.supabase) {
    console.error('❌ Supabase client not available');
    return;
  }
  
  // Test 1: Check current auth state
  console.log('\n📋 Test 1: Current Auth State');
  console.log('─────────────────────────────────────────');
  
  const { data: { user }, error: userError } = await window.supabase.auth.getUser();
  
  if (userError) {
    console.error('❌ Error getting user:', userError);
    return;
  }
  
  if (!user) {
    console.log('⚠️ No user signed in');
    return;
  }
  
  console.log('✅ User signed in:');
  console.log('   - ID:', user.id);
  console.log('   - Email:', user.email);
  console.log('   - Provider:', user.app_metadata?.provider);
  
  // Test 2: Check profile by user_id
  console.log('\n📋 Test 2: Profile Lookup by user_id');
  console.log('─────────────────────────────────────────');
  
  const { data: profileByUid, error: uidError } = await window.supabase
    .from('community')
    .select('*')
    .eq('user_id', user.id)
    .limit(1);
  
  if (uidError) {
    console.error('❌ Error querying by user_id:', uidError);
  } else if (profileByUid && profileByUid.length > 0) {
    console.log('✅ Profile found by user_id:');
    console.log('   - Profile ID:', profileByUid[0].id);
    console.log('   - Email:', profileByUid[0].email);
    console.log('   - Display Name:', profileByUid[0].display_name);
    console.log('   - Username:', profileByUid[0].username);
    console.log('   - Onboarding Completed:', profileByUid[0].onboarding_completed);
    console.log('   - Profile Completed:', profileByUid[0].profile_completed);
    console.log('   - Created At:', profileByUid[0].created_at);
  } else {
    console.log('⚠️ No profile found by user_id');
  }
  
  // Test 3: Check profiles by email
  console.log('\n📋 Test 3: Profile Lookup by Email');
  console.log('─────────────────────────────────────────');
  
  const emailNorm = user.email.toLowerCase().trim();
  
  const { data: profilesByEmail, error: emailError } = await window.supabase
    .from('community')
    .select('*')
    .ilike('email', emailNorm)
    .order('created_at', { ascending: true, nullsLast: true });
  
  if (emailError) {
    console.error('❌ Error querying by email:', emailError);
  } else if (profilesByEmail && profilesByEmail.length > 0) {
    console.log(`✅ Found ${profilesByEmail.length} profile(s) with email: ${emailNorm}`);
    
    profilesByEmail.forEach((profile, index) => {
      console.log(`\n   Profile ${index + 1}:`);
      console.log('   - ID:', profile.id);
      console.log('   - user_id:', profile.user_id || 'NULL');
      console.log('   - Display Name:', profile.display_name);
      console.log('   - Username:', profile.username);
      console.log('   - Onboarding Completed:', profile.onboarding_completed);
      console.log('   - Profile Completed:', profile.profile_completed);
      console.log('   - Is Hidden:', profile.is_hidden);
      console.log('   - Created At:', profile.created_at);
    });
    
    if (profilesByEmail.length > 1) {
      console.log('\n⚠️ DUPLICATE PROFILES DETECTED!');
      console.log('   The profile linking algorithm should consolidate these on next sign-in.');
    }
  } else {
    console.log('⚠️ No profiles found by email');
  }
  
  // Test 4: Check current profile state
  console.log('\n📋 Test 4: Current Profile State');
  console.log('─────────────────────────────────────────');
  
  if (window.currentUserProfile) {
    console.log('✅ Profile loaded in memory:');
    console.log('   - Profile ID:', window.currentUserProfile.id);
    console.log('   - Email:', window.currentUserProfile.email);
    console.log('   - Display Name:', window.currentUserProfile.display_name);
    console.log('   - Username:', window.currentUserProfile.username);
    console.log('   - Needs Onboarding:', window.currentUserProfile._needsOnboarding || false);
    console.log('   - Onboarding Completed:', window.currentUserProfile.onboarding_completed);
    console.log('   - Profile Completed:', window.currentUserProfile.profile_completed);
  } else {
    console.log('⚠️ No profile loaded in memory (window.currentUserProfile)');
  }
  
  // Test 5: Check for orphaned profiles (user_id = NULL)
  console.log('\n📋 Test 5: Orphaned Profiles Check');
  console.log('─────────────────────────────────────────');
  
  const { data: orphanedProfiles, error: orphanError } = await window.supabase
    .from('community')
    .select('id, email, display_name, created_at')
    .is('user_id', null)
    .limit(10);
  
  if (orphanError) {
    console.error('❌ Error querying orphaned profiles:', orphanError);
  } else if (orphanedProfiles && orphanedProfiles.length > 0) {
    console.log(`⚠️ Found ${orphanedProfiles.length} orphaned profile(s) (user_id = NULL):`);
    orphanedProfiles.forEach((profile, index) => {
      console.log(`   ${index + 1}. ${profile.email} (ID: ${profile.id})`);
    });
    console.log('\n   These profiles will be linked when users sign in via OAuth.');
  } else {
    console.log('✅ No orphaned profiles found');
  }
  
  // Summary
  console.log('\n🧪 ========================================');
  console.log('🧪 TEST COMPLETE');
  console.log('🧪 ========================================');
  console.log('\n💡 Tips:');
  console.log('   - Check browser console for [PROFILE-LINK] logs during sign-in');
  console.log('   - Sign out and sign in again to test the linking algorithm');
  console.log('   - Look for logs: found-by-uid, linked-by-email, created-new, etc.');
  console.log('   - If you see duplicates, the next sign-in will consolidate them');
};

console.log('✅ Profile linking test script loaded!');
console.log('📝 Run: testProfileLinking()');
