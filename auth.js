// ================================================================
// AUTH MODULE - Authentication & Login
// ================================================================

// Import supabase from main file
const supabase = window.supabase;

// DOM refs
let loginSection, profileSection, userBadge, logoutBtn;
let githubBtn, googleBtn;

// ======================================================================
// SETUP LOGIN DOM
// ======================================================================
export function setupLoginDOM() {
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
// UI HELPERS
// ======================================================================
export function showLoginUI() {
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
  window.clearProfileForm && window.clearProfileForm();
  
  console.log("🔒 Showing login UI");
}

export function showProfileUI(user) {
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
// OAUTH LOGIN
// ======================================================================
async function oauthLogin(provider) {
  console.log(`🔐 Starting OAuth login with ${provider}...`);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    console.error("❌ OAuth error:", error);
    window.showNotification && window.showNotification("Login failed. Please try again.", "error");
  }
}

// ======================================================================
// HANDLE OAUTH CALLBACK
// ======================================================================
async function handleOAuthCallback() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  // Case 1: Provider sent an error
  if (params.has("error")) {
    const errorDesc = params.get("error_description") || "OAuth error.";
    console.warn("⚠️ OAuth error in callback:", errorDesc);
    window.showNotification && window.showNotification("Login link expired or cancelled. Please try again.", "error");

    // Clean URL
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
    return;
  }

  // Case 2: No code → nothing to do
  if (!params.has("code")) {
    return;
  }

  console.log("🔄 Processing OAuth callback (code flow)…");

  const { data, error } = await supabase.auth.exchangeCodeForSession(
    window.location.href
  );

  if (error) {
    console.error("❌ Error during OAuth code exchange:", error);
    window.showNotification && window.showNotification("Login failed. Please try again.", "error");
    return;
  }

  console.log("🔓 OAuth SIGNED_IN via redirect:", data.user?.email);

  // Clean URL after successful login
  url.search = "";
  window.history.replaceState({}, document.title, url.toString());
}

// ======================================================================
// LOGOUT
// ======================================================================
window.handleLogout = async function() {
  console.log("👋 Logging out...");
  
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error("❌ Logout error:", error);
    window.showNotification && window.showNotification("Logout failed. Please try again.", "error");
  } else {
    console.log("✅ Logged out successfully");
    
    // Dispatch logout event for profile.js to clear its state
    window.dispatchEvent(new CustomEvent('user-logged-out'));
    
    window.showNotification && window.showNotification("Logged out successfully", "success");
    showLoginUI();
  }
}

// ======================================================================
// INIT LOGIN SYSTEM
// ======================================================================
export async function initLoginSystem() {
  console.log("🔐 Initializing login system...");

  // Handle OAuth callback if present
  await handleOAuthCallback();

  // Check current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("❌ Session error:", sessionError);
    showLoginUI();
    return;
  }

  if (session?.user) {
    console.log("✅ User already logged in:", session.user.email);
    
    // Load profile
    const profile = await window.loadUserProfile && window.loadUserProfile(session.user.email);
    
    if (profile) {
      window.dispatchEvent(new CustomEvent('profile-loaded', { 
        detail: { user: session.user, profile }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('profile-new', { 
        detail: { user: session.user }
      }));
    }
    
    showProfileUI(session.user);
  } else {
    console.log("🔒 No active session - showing login");
    showLoginUI();
  }

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔔 Auth state changed:", event);

    if (event === "SIGNED_IN" && session?.user) {
      console.log("✅ User signed in:", session.user.email);
      
      const profile = await window.loadUserProfile && window.loadUserProfile(session.user.email);
      
      if (profile) {
        window.dispatchEvent(new CustomEvent('profile-loaded', { 
          detail: { user: session.user, profile }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('profile-new', { 
          detail: { user: session.user }
        }));
      }
      
      showProfileUI(session.user);
    } else if (event === "SIGNED_OUT") {
      console.log("👋 User signed out");
      showLoginUI();
    }
  });

  console.log("✅ Login system initialized");
}
