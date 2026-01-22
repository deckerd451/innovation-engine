// ================================================================
// SIMPLE AUTHENTICATION SYSTEM
// ================================================================
// Minimal auth system for simplified dashboard

console.log('🔐 Simple Auth Loading...');

let currentUser = null;
let currentProfile = null;

// Initialize authentication
async function initSimpleAuth() {
  try {
    // Wait for Supabase to be available
    if (typeof window.supabase === 'undefined') {
      setTimeout(initSimpleAuth, 100);
      return;
    }

    // Check current session
    const { data: { session }, error } = await window.supabase.auth.getSession();
    
    if (error) {
      console.error('Auth error:', error);
      redirectToLogin();
      return;
    }

    if (!session) {
      redirectToLogin();
      return;
    }

    currentUser = session.user;
    await loadUserProfile();
    
    console.log('✅ Simple Auth Ready');
    
  } catch (error) {
    console.error('Auth initialization error:', error);
    redirectToLogin();
  }
}

// Load user profile
async function loadUserProfile() {
  try {
    const { data, error } = await window.supabase
      .from('community')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();

    if (error) {
      console.warn('Profile not found:', error);
      // Create basic profile if it doesn't exist
      await createBasicProfile();
      return;
    }

    currentProfile = data;
    updateUserDisplay();
    
    // Emit profile loaded event for other systems
    window.dispatchEvent(new CustomEvent('profile-loaded', {
      detail: { user: currentUser, profile: currentProfile }
    }));
    
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

// Create basic profile
async function createBasicProfile() {
  try {
    const { data, error } = await window.supabase
      .from('community')
      .insert({
        user_id: currentUser.id,
        name: currentUser.user_metadata?.full_name || currentUser.email.split('@')[0],
        email: currentUser.email,
        skills: '',
        bio: '',
        interests: []
      })
      .select()
      .single();

    if (error) throw error;
    
    currentProfile = data;
    updateUserDisplay();
    
  } catch (error) {
    console.error('Error creating profile:', error);
  }
}

// Update user display
function updateUserDisplay() {
  const userNameEl = document.getElementById('user-name');
  if (userNameEl && currentProfile) {
    userNameEl.textContent = currentProfile.name || 'User';
  }
}

// Redirect to login
function redirectToLogin() {
  window.location.href = '/';
}

// Expose globally
window.initSimpleAuth = initSimpleAuth;
window.getCurrentUser = () => currentUser;
window.getCurrentProfile = () => currentProfile;

console.log('✅ Simple Auth Loaded');