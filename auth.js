// ================================================================
// SUPABASE IMPORT
// ================================================================
// Supabase should already be available via supabaseClient.js
// We'll access it via window.supabase
if (!window.supabase) {
  console.error('❌ Supabase client not found! Make sure supabaseClient.js is loaded first.');
}

// ================================================================
// NOTIFICATION SYSTEM
// ================================================================
function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Visual notification could be added here
}

// ================================================================
// LOGIN SYSTEM
// ================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FIXED 2025)
// Uses:
//   - GitHub / Google OAuth with redirect
//   - Clean query-string callback (no hashes, no magic links)
//   - Smart auto-login with profile loading

// DOM refs
let loginSection, profileSection, userBadge, logoutBtn;
let githubBtn, googleBtn;

// ======================================================================
// 1. SETUP LOGIN DOM
// ======================================================================
function setupLoginDOM() {
  loginSection   = document.getElementById("login-section");
  profileSection = document.getElementById("profile-section");
  userBadge      = document.getElementById("user-badge");
  logoutBtn      = document.getElementById("logout-btn");

  githubBtn = document.getElementById("github-login");
  googleBtn = document.getElementById("google-login");

  if (!loginSection || !profileSection) {
    console.error("❌ login-section or profile-section not found in DOM");
    return;
  }

  // Setup OAuth buttons
  if (githubBtn) {
    githubBtn.addEventListener("click", () => oauthLogin("github"));
  }
  if (googleBtn) {
    googleBtn.addEventListener("click", () => oauthLogin("google"));
  }

  // Setup logout button
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  console.log("🎨 Login DOM setup complete (OAuth mode)");
}

// ======================================================================
// 2. UI HELPERS
// ======================================================================
function showLoginUI() {
  // Show login section
  loginSection.classList.add("active-tab-pane");
  loginSection.classList.remove("hidden");
  
  // Hide profile section
  profileSection.classList.add("hidden");
  profileSection.classList.remove("active-tab-pane");
  
  // Hide user badge and logout
  if (userBadge) userBadge.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.add("hidden");
  
  // Prevent scrolling on body when login is shown
  document.body.style.overflow = 'hidden';
  
  // Clear profile form
  clearProfileForm();
  
  console.log("🔒 Showing login UI");
}

// Helper function to clear all profile form fields
function clearProfileForm() {
  const form = document.getElementById("skills-form");
  if (form) {
    form.reset();
  }
  
  // Clear preview image
  const previewImg = document.getElementById("preview");
  if (previewImg) {
    previewImg.removeAttribute("src");
    previewImg.classList.add("hidden");
  }
  
  // Reset progress bar
  const progressBar = document.querySelector(".profile-bar-inner");
  const progressMsg = document.getElementById("profile-progress-msg");
  if (progressBar) progressBar.style.width = "0%";
  if (progressMsg) {
    progressMsg.textContent = "Profile 0% complete";
    progressMsg.style.color = "#00e0ff";
  }
  
  // Reset title and button
  const profileTitle = document.querySelector("#profile .section-title");
  const submitButton = document.querySelector("#skills-form button[type='submit']");
  if (profileTitle) profileTitle.textContent = "Your Profile";
  if (submitButton) submitButton.textContent = "Save Profile";
  
  console.log("🧹 Profile form cleared");
}

function showProfileUI(user) {
  // Hide login section
  loginSection.classList.remove("active-tab-pane");
  loginSection.classList.add("hidden");
  
  // Show profile section
  profileSection.classList.remove("hidden");
  
  // Enable scrolling on body when logged in
  document.body.style.overflow = 'auto';
  
  // Show the profile tab by default
  const profileTab = document.getElementById("profile");
  if (profileTab) {
    document.querySelectorAll(".tab-content-pane").forEach(p =>
      p.classList.remove("active-tab-pane")
    );
    profileTab.classList.add("active-tab-pane");
  }
  
  // Show user badge and logout button
  if (userBadge && user?.email) {
    userBadge.textContent = user.email;
    userBadge.classList.remove("hidden");
  }
  if (logoutBtn) {
    logoutBtn.classList.remove("hidden");
  }
  
  console.log("✅ Showing profile UI for:", user?.email);
}

// ======================================================================
// 3. START OAUTH LOGIN (REDIRECT FLOW)
// ======================================================================
async function oauthLogin(provider) {
  console.log(`🔐 Starting OAuth login with ${provider}...`);

  const { error } = await window.supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    console.error("❌ OAuth error:", error);
    showNotification("Login failed. Please try again.", "error");
  }

  // NOTE: On success, browser will redirect to provider, then back to this page
}

// ======================================================================
// 4. CLEAN OAUTH URL (Supabase handles the actual OAuth processing)
// ======================================================================
function cleanOAuthUrl() {
  const url = new URL(window.location.href);
  
  // If there's OAuth params in URL, clean them after Supabase processes
  if (url.hash && (url.hash.includes('access_token') || url.hash.includes('error'))) {
    setTimeout(() => {
      console.log("🧹 Cleaning OAuth URL...");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }, 1000);
  }
}

// ======================================================================
// 5. HANDLE LOGOUT
// ======================================================================
window.handleLogout = async function() {
  console.log("👋 Logging out...");
  
  const { error } = await window.supabase.auth.signOut();
  
  if (error) {
    console.error("❌ Logout error:", error);
    showNotification("Logout failed. Please try again.", "error");
  } else {
    console.log("✅ Logged out successfully");
    
    // Dispatch logout event for profile.js to clear its state
    window.dispatchEvent(new CustomEvent('user-logged-out'));
    
    showNotification("Logged out successfully", "success");
    showLoginUI();
  }
}

// ======================================================================
// 6. LOAD USER PROFILE DATA (AFTER LOGIN) - FIXED VERSION
// ======================================================================
async function loadUserProfile(user) {
  console.log("👤 Loading profile for:", user.email);
  console.log("🔍 User ID:", user.id);
  
  try {
    // Fetch from community table with ALL columns explicitly
    const { data: profiles, error } = await window.supabase
      .from('community')
      .select('*')
      .eq('user_id', user.id);
    
    console.log("📊 Query result:", { profiles, error });
    
    if (error) {
      console.error('❌ Error fetching profile:', error);
      
      // Still fire new user event if query fails
      console.log('🆕 Treating as new user due to query error');
      window.dispatchEvent(new CustomEvent('profile-new', { 
        detail: { user } 
      }));
      return null;
    }
    
    // Check if we got results
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      console.log('📋 Existing profile found:', profile);
      console.log('📝 Profile details:', {
        name: profile.name,
        skills: profile.skills,
        bio: profile.bio,
        interests: profile.interests,
        availability: profile.availability,
        image_url: profile.image_url
      });
      
      // Trigger profile form population
      window.dispatchEvent(new CustomEvent('profile-loaded', { 
        detail: { profile, user } 
      }));
      
      return profile;
    } else {
      console.log('🆕 New user - no profile rows found');
      
      // Trigger new user flow
      window.dispatchEvent(new CustomEvent('profile-new', { 
        detail: { user } 
      }));
      
      return null;
    }
  } catch (err) {
    console.error('❌ Exception loading profile:', err);
    
    // Fire new user event on exception
    window.dispatchEvent(new CustomEvent('profile-new', { 
      detail: { user } 
    }));
    
    return null;
  }
}

// ======================================================================
// 7. INIT LOGIN SYSTEM - ROBUST VERSION (NO DELAYS/HACKS)
// ======================================================================
async function initLoginSystem() {
  console.log("🚀 Initializing login system (OAuth)…");

  try {
    // Setup auth state listener FIRST - this will catch the OAuth callback
    console.log("Step 1: Setting up auth state listener...");
    window.supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("⚡ Auth event:", event, session ? `User: ${session.user.email}` : "No session");

      if (event === "SIGNED_IN" && session?.user) {
        console.log("🟢 User authenticated:", session.user.email);
        showProfileUI(session.user);
        
        // Small delay for profile.js event listeners to be ready
        setTimeout(async () => {
          await loadUserProfile(session.user);
        }, 100);
      }

      if (event === "SIGNED_OUT") {
        console.log("🟡 User signed out");
        showLoginUI();
      }
      
      // INITIAL_SESSION is fired when we first check the session
      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          console.log("🟢 Existing session found:", session.user.email);
          showProfileUI(session.user);
          
          setTimeout(async () => {
            await loadUserProfile(session.user);
          }, 100);
        } else {
          console.log("🟡 No active session");
          showLoginUI();
        }
      }
    });
    console.log("Step 1: ✅ Auth listener setup");

    // Now get the current session - this will trigger INITIAL_SESSION event
    console.log("Step 2: Getting current session (will trigger INITIAL_SESSION event)...");
    const { data: { session } } = await window.supabase.auth.getSession();
    console.log("Step 2: ✅ Session check complete");

    // Clean up OAuth URL after everything is set up
    cleanOAuthUrl();

    console.log("✅ Login system initialized (OAuth)");
  } catch (error) {
    console.error("❌ ERROR in initLoginSystem:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    showLoginUI();
  }
}

// ======================================================================
// MAKE FUNCTIONS AVAILABLE TO MAIN.JS
// ======================================================================
window.setupLoginDOM = setupLoginDOM;
window.initLoginSystem = initLoginSystem;
