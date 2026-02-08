/*
 * Navigation Handler
 * File: assets/js/navigation-handler.js
 * Handles tab switching, URL hashes, and profile detection
 */

const NavigationHandler = (function() {
  'use strict';
  
  let currentUser = null;
  let profileCompleted = false;
  
  // Initialize
  async function init() {
    if (!window.supabase) {
      console.log('Waiting for Supabase...');
      setTimeout(init, 100);
      return;
    }
    
    // Get current user
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      await checkProfileCompletion();
      updateProfileButton();
    }
    
    // Listen for auth changes
    window.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await checkProfileCompletion();
        updateProfileButton();
        goToDashboard();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        profileCompleted = false;
        updateProfileButton();
      }
    });
    
    // Handle tab switching
    setupTabSwitching();
    
    // Clean URL hash on load
    cleanURLHash();
    
    console.log('✓ Navigation handler initialized');
  }
  
  // Check if profile is completed
  async function checkProfileCompletion() {
    if (!currentUser) return false;
    
    try {
      const { data, error } = await window.supabase
        .from('community')
        .select('profile_completed, name, skills')
        .eq('user_id', currentUser.id)
        .single();
      
      if (error) {
        console.log('No profile found yet');
        profileCompleted = false;
        return false;
      }
      
      // Check if profile is actually complete
      profileCompleted = data?.profile_completed === true || 
                        (data?.name && data?.skills && 
                         ((Array.isArray(data.skills) && data.skills.length > 0) ||
                          (typeof data.skills === 'string' && data.skills.trim() !== '')));
      
      return profileCompleted;
    } catch (error) {
      console.error('Error checking profile:', error);
      return false;
    }
  }
  
  // Update profile button text
  function updateProfileButton() {
    const profileBtn = document.getElementById('profile-btn');
    const profileBtnText = document.getElementById('profile-btn-text');
    
    if (!profileBtn) return;
    
    if (!currentUser) {
      // Not logged in - hide button
      profileBtn.style.display = 'none';
    } else if (profileCompleted) {
      // Profile complete - show "Edit Profile"
      profileBtn.style.display = '';
      if (profileBtnText) {
        profileBtnText.textContent = 'Edit Profile';
      }
      profileBtn.querySelector('i').className = 'fas fa-user-edit';
    } else {
      // No profile - show "Create Profile"
      profileBtn.style.display = '';
      if (profileBtnText) {
        profileBtnText.textContent = 'Create Profile';
      }
      profileBtn.querySelector('i').className = 'fas fa-user-plus';
    }
  }
  
  // Setup tab switching behavior
  function setupTabSwitching() {
    // Listen for tab changes
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        const tabName = tabBtn.getAttribute('data-tab');
        switchToTab(tabName);
      }
    });
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
  }
  
  // Switch to a specific tab
  function switchToTab(tabName) {
    // Update URL hash
    if (tabName !== 'login-section') {
      window.location.hash = tabName;
    }
    
    // Deactivate all tabs
    document.querySelectorAll('.tab-content-pane').forEach(pane => {
      pane.classList.remove('active-tab-pane');
    });
    
    document.querySelectorAll('.top-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Activate selected tab
    const targetPane = document.getElementById(tabName);
    if (targetPane) {
      targetPane.classList.add('active-tab-pane');
    }
    
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
  }
  
  // Handle URL hash changes
  function handleHashChange() {
    const hash = window.location.hash.substring(1);
    
    // Handle special hash routes
    if (hash === 'connections') {
      // Open connections panel
      if (typeof window.toggleConnectionsPanel === 'function') {
        window.toggleConnectionsPanel();
      }
      // Clear hash
      history.replaceState(null, null, ' ');
      return;
    }
    
    if (hash && hash !== 'login-section') {
      const targetPane = document.getElementById(hash);
      if (targetPane) {
        switchToTab(hash);
      } else {
        // Invalid hash, go to dashboard
        goToDashboard();
      }
    }
  }
  
  // Clean URL hash
  function cleanURLHash() {
    const hash = window.location.hash;
    if (hash === '#' || hash === '#login-section') {
      history.replaceState(null, null, ' ');
    }
  }
  
  // Go to dashboard
  function goToDashboard() {
    if (currentUser) {
      switchToTab('dashboard');
    }
  }
  
  // Public API
  return {
    init,
    switchToTab,
    goToDashboard,
    checkProfileCompletion,
    updateProfileButton,
    isProfileCompleted: () => profileCompleted
  };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.NavigationHandler = NavigationHandler;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NavigationHandler.init());
  } else {
    NavigationHandler.init();
  }
}
