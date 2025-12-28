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
// 4. HANDLE OAUTH CALLBACK (QUERY PARAMS, NOT HASH)
// ======================================================================
async function handleOAuthCallback() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  // Case 1: Provider sent an error
  if (params.has("error")) {
    const errorDesc = params.get("error_description") || "OAuth error.";
    console.warn("⚠️ OAuth error in callback:", errorDesc);
    showNotification("Login link expired or cancelled. Please try again.", "error");

    // Clean URL (remove ?error=...)
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
    return;
  }

  // Case 2: No ?code= → nothing to do
  if (!params.has("code")) {
    return;
  }

  console.log("🔄 Processing OAuth callback (code flow)…");

  const { data, error } = await window.supabase.auth.exchangeCodeForSession(
    window.location.href
  );

  if (error) {
    console.error("❌ Error during OAuth code exchange:", error);
    showNotification("Login failed. Please try again.", "error");
    return;
  }

  console.log("🔓 OAuth SIGNED_IN via redirect:", data.user?.email);

  // Clean URL after successful login
  url.search = "";
  window.history.replaceState({}, document.title, url.toString());
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
// 6. LOAD & CHECK FOR USER PROFILE
// ======================================================================
async function loadUserProfile(userId, userEmail) {
  console.log(`🔍 Loading profile for user: ${userEmail}`);
  
  try {
    const { data, error } = await supabase
      .from('community')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('Load profile error:', err);
    return null;
  }
}

// ======================================================================
// 7. INIT LOGIN SYSTEM (RUNS ON PAGE LOAD)
// ======================================================================
async function initLoginSystem() {
  console.log("🎬 Initializing login system...");

  try {
    // Handle OAuth callback first
    await handleOAuthCallback();
    console.log("✅ OAuth callback handled");

    // Check current session
    console.log("🔍 Checking session...");
    const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
    console.log("📋 Session check complete:", { hasSession: !!session, error: sessionError });

    if (sessionError) {
      console.error("❌ Session error:", sessionError);
      showLoginUI();
      return;
    }

    if (!session || !session.user) {
      console.log("🔒 No active session → showing login UI");
      showLoginUI();
      return;
    }

    const user = session.user;
    console.log("✅ Active session found:", user.email);

    // Show profile UI immediately
    showProfileUI(user);

    // Load profile from database
    console.log("🔍 Loading user profile...");
    const profile = await loadUserProfile(user.id, user.email);

    if (profile) {
      console.log("✅ Profile found:", profile);
      // Dispatch profile-loaded event for dashboard.js
      window.dispatchEvent(new CustomEvent('profile-loaded', { 
        detail: { user, profile }
      }));
    } else {
      console.log("🆕 No profile found → new user");
      // Dispatch new user event for dashboard.js
      window.dispatchEvent(new CustomEvent('profile-new', { 
        detail: { user }
      }));
    }

    // Listen for auth state changes
    window.supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔔 Auth state changed:", event);
      
      if (event === 'SIGNED_OUT') {
        showLoginUI();
      } else if (event === 'SIGNED_IN' && session?.user) {
        showProfileUI(session.user);
        // Reload profile
        loadUserProfile(session.user.id, session.user.email).then(profile => {
          if (profile) {
            window.dispatchEvent(new CustomEvent('profile-loaded', { 
              detail: { user: session.user, profile }
            }));
          } else {
            window.dispatchEvent(new CustomEvent('profile-new', { 
              detail: { user: session.user }
            }));
          }
        });
      }
    });

    console.log("✅ Login system initialized");
  } catch (error) {
    console.error("❌ FATAL ERROR in initLoginSystem:", error);
    console.error("Error stack:", error.stack);
    showLoginUI();
  }
}

// ======================================================================
// MAKE FUNCTIONS AVAILABLE TO MAIN.JS
// ======================================================================
window.setupLoginDOM = setupLoginDOM;
window.initLoginSystem = initLoginSystem;
