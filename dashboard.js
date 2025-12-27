// ================================================================
// SUPABASE IMPORT
// ================================================================
import { supabase } from "./assets/js/supabaseClient.js";
window.supabase = supabase;

// ================================================================
// NOTIFICATION SYSTEM
// ================================================================
function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Visual notification could be added here
}

// ================================================================
// LOGIN SYSTEM (from login.js)
// ================================================================
// ======================================================================
// CharlestonHacks Innovation Engine – LOGIN CONTROLLER (FIXED 2025)
// Uses:
//   - GitHub / Google OAuth with redirect
//   - Clean query-string callback (no hashes, no magic links)
//   - Smart auto-login with profile loading
// ======================================================================




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
// 2. UI HELPERS (FIXED FOR CORRECT CLASS NAMES)
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
  
// Clear preview image (FIX: never set img.src = "")
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

  const { error } = await supabase.auth.signInWithOAuth({
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(
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
  
  const { error } = await supabase.auth.signOut();
  
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
    const { data: profiles, error } = await supabase
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
// 7. MAIN INIT – SMART AUTO LOGIN
// ======================================================================
async function initLoginSystem() {
  console.log("🚀 Initializing login system (OAuth)…");

  // Step A – Handle OAuth callback if present
  await handleOAuthCallback();

  // Step B – Check current session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    console.log("🟢 Already logged in as:", session.user.email);
    showProfileUI(session.user);
    
    // IMPORTANT: Add a small delay to ensure profile.js listeners are ready
    setTimeout(async () => {
      await loadUserProfile(session.user);
    }, 100);
  } else {
    console.log("🟡 No active session");
    showLoginUI();
  }

  // Step C – Listen for auth state changes (single listener)
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("⚡ Auth event:", event);

    if (event === "SIGNED_IN" && session?.user) {
      console.log("🟢 User authenticated:", session.user.email);
      showProfileUI(session.user);
      
      // Add delay for event listeners
      setTimeout(async () => {
        await loadUserProfile(session.user);
      }, 100);
    }

    if (event === "SIGNED_OUT") {
      console.log("🟡 User signed out");
      showLoginUI();
    }
  });

  console.log("✅ Login system initialized (OAuth)");
}

    // ================================================================
    // DASHBOARD SYSTEM
    // ================================================================
    console.log("%c🎯 Unified Dashboard Loading...", "color:#0ff; font-weight: bold; font-size: 16px");
    
    // ========================
    // GLOBAL STATE
    // ========================
    let currentUser = null;
    let currentUserProfile = null;
    let allUsers = [];
    let teamSkills = [];
    let teamSize = 4;

    // ========================
    // INITIALIZATION
    // ========================
    async function init() {
      console.log('Initializing unified dashboard...');
      
      // Wait for Supabase
      await waitForSupabase();
      
      // currentUser should already be set by login system
      if (!currentUser) {
        console.error('init() called but no currentUser - this should not happen');
        return;
      }
      
      console.log('User authenticated:', currentUser.email);
      
      // Load user profile (using login system's version which fires events)
      await loadUserProfile(currentUser);
      
      // Load all data in parallel
      await Promise.all([
        loadCommunityStats(),
        loadRecentConnections(),
        loadPendingRequests(),
        loadSuggestedConnections(),
        loadActivityFeed(),
        loadTrendingSkills()
      ]);
      
      // Load connections content
      await loadAllConnections();
      
      // Setup event listeners
      setupEventListeners();
      
      // Load existing modules
      loadExistingModules();
      
      console.log('%c✅ Dashboard Ready', 'color:#0f8; font-weight: bold');
    }

    function waitForSupabase() {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (window.supabase) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    // ========================
    // USER PROFILE
    // ========================
    async function loadUserProfileData() {
      try {
        const { data, error } = await window.supabase
          .from('community')
          .select('*')
          .eq('user_id', currentUser.id)
          .single();
        
        if (!error && data) {
          currentUserProfile = data;
          updateUserUI(data);
        } else {
          console.log('No profile found, user should create one');
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    }

    function updateUserUI(profile) {
      const name = profile.name || currentUser.email?.split('@')[0] || 'User';
      
      const userNameHeader = document.getElementById('user-name-header');
      if (userNameHeader) {
        userNameHeader.textContent = name;
      }
      
      const initialsHeader = document.getElementById('user-initials-header');
      if (initialsHeader) {
        const initials = getInitials(name);
        initialsHeader.textContent = initials;
      }
      
      const avatarHeader = document.getElementById('user-avatar-header');
      if (avatarHeader && profile.image_url) {
        avatarHeader.innerHTML = `<img src="${profile.image_url}" alt="${name}">`;
      }
      
      // Update hero stats
      const skills = parseSkills(profile.skills);
      // Connection count will be updated when connections load
    }

    // ========================
    // COMMUNITY STATS
    // ========================
    async function loadCommunityStats() {
      try {
        if (!currentUserProfile) {
          console.log('No profile, skipping stats');
          return;
        }
        
        // 1. Unread Messages Count (using your conversations schema)
        // Get all conversations where user is a participant
        const { data: userConversations } = await window.supabase
          .from('conversations')
          .select('id')
          .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`);
        
        const convIds = (userConversations || []).map(c => c.id);
        
        let unreadCount = 0;
        if (convIds.length > 0) {
          const { count } = await window.supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .neq('sender_id', currentUserProfile.id)
            .eq('read', false);
          
          unreadCount = count || 0;
        }
        
        const unreadEl = document.getElementById('unread-messages');
        if (unreadEl) {
          unreadEl.textContent = unreadCount;
        }
        
        const messagesTrendEl = document.getElementById('messages-trend');
        if (messagesTrendEl && unreadCount > 0) {
          messagesTrendEl.textContent = `${unreadCount} new`;
        } else if (messagesTrendEl) {
          messagesTrendEl.textContent = 'All caught up';
        }
        
        // 2. Active Projects Count
        const { count: activeProjects, error: projectsError } = await window.supabase
          .from('projects')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', currentUserProfile.id)
          .eq('status', 'in-progress');
        
        const projectsEl = document.getElementById('active-projects');
        if (projectsEl) {
          projectsEl.textContent = activeProjects || 0;
        }
        
        const projectsTrendEl = document.getElementById('projects-trend');
        if (projectsTrendEl && activeProjects > 0) {
          projectsTrendEl.textContent = `${activeProjects} in progress`;
        } else if (projectsTrendEl) {
          projectsTrendEl.textContent = 'Start a project';
        }
        
        // 3. Total Endorsements Received
        const { count: endorsementsCount, error: endorsementsError } = await window.supabase
          .from('endorsements')
          .select('*', { count: 'exact', head: true })
          .eq('endorsed_community_id', currentUserProfile.id);
        
        const endorsementsEl = document.getElementById('total-endorsements');
        if (endorsementsEl) {
          endorsementsEl.textContent = endorsementsCount || 0;
        }
        
        // Get endorsements from this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const { count: weeklyEndorsements } = await window.supabase
          .from('endorsements')
          .select('*', { count: 'exact', head: true })
          .eq('endorsed_community_id', currentUserProfile.id)
          .gte('created_at', weekAgo.toISOString());
        
        const endorsementsTrendEl = document.getElementById('endorsements-trend');
        if (endorsementsTrendEl && weeklyEndorsements > 0) {
          endorsementsTrendEl.textContent = `+${weeklyEndorsements} this week`;
        } else if (endorsementsTrendEl) {
          endorsementsTrendEl.textContent = 'Get endorsed';
        }
        
        // 4. Network Size (Total Connections)
        const { count: networkSize, error: networkError } = await window.supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
        
        const networkEl = document.getElementById('network-size');
        if (networkEl) {
          networkEl.textContent = networkSize || 0;
        }
        
        // Get connections from this month
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        const { count: monthlyConnections } = await window.supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
          .gte('created_at', monthAgo.toISOString());
        
        const networkTrendEl = document.getElementById('network-trend');
        if (networkTrendEl && monthlyConnections > 0) {
          networkTrendEl.textContent = `+${monthlyConnections} this month`;
        } else if (networkTrendEl) {
          networkTrendEl.textContent = 'Start networking';
        }
        
      } catch (err) {
        console.error('Error loading stats:', err);
        // Set fallback values
        const safeSet = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        };
        safeSet('unread-messages', '0');
        safeSet('active-projects', '0');
        safeSet('total-endorsements', '0');
        safeSet('network-size', '0');
      }
    }

    // ========================
    // NETWORK SECTION
    // ========================
    async function loadRecentConnections() {
      const container = document.getElementById('recent-connections');
      if (!container) return;
      
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        if (!currentUserProfile) {
          container.innerHTML = '<div class="empty-state"><p>Create your profile to see connections</p></div>';
          document.getElementById('mini-synapse-label').textContent = 'Create profile to see network';
          updateNetworkStats(0);
          return;
        }
        
        // Get user's connections
        const { data: connections, error } = await window.supabase
          .from('connections')
          .select(`
            *,
            from_user:community!connections_from_user_id_fkey(id, name, image_url),
            to_user:community!connections_to_user_id_fkey(id, name, image_url)
          `)
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
          .eq('status', 'accepted')
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (error) {
          console.error('Error loading recent connections:', error);
          container.innerHTML = '<div class="empty-state"><p>Unable to load connections</p></div>';
          updateNetworkStats(0);
          return;
        }
        
        if (!connections || connections.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No connections yet</p></div>';
          updateNetworkStats(0);
          return;
        }
        
        updateNetworkStats(connections.length);
        
        container.innerHTML = '';
        connections.forEach(conn => {
          const otherUser = conn.from_user_id === currentUserProfile.id ? conn.to_user : conn.from_user;
          const timeAgo = getTimeAgo(new Date(conn.created_at));
          
          const initials = getInitials(otherUser.name);
          const avatarHtml = otherUser.image_url 
            ? `<img src="${otherUser.image_url}" alt="${otherUser.name}">`
            : initials;
          
          container.innerHTML += `
            <div class="connection-item" onclick="viewProfile('${otherUser.id}')">
              <div class="connection-avatar">${avatarHtml}</div>
              <div class="connection-info">
                <div class="connection-name">${otherUser.name || 'Anonymous'}</div>
                <div class="connection-time">${timeAgo}</div>
              </div>
            </div>
          `;
        });
        
      } catch (err) {
        console.error('Error loading connections:', err);
        container.innerHTML = '<div class="empty-state"><p>Unable to load connections</p></div>';
        updateNetworkStats(0);
      }
    }

    function updateNetworkStats(connectionCount) {
      if (!currentUserProfile) return;
      
      const skills = parseSkills(currentUserProfile.skills);
      document.getElementById('network-stats-hero').textContent = 
        `${connectionCount} connection${connectionCount !== 1 ? 's' : ''} • ${skills.length} skill${skills.length !== 1 ? 's' : ''}`;
      
      document.getElementById('mini-synapse-label').textContent = 
        `Interactive visualization of your ${connectionCount} connection${connectionCount !== 1 ? 's' : ''}`;
    }

    async function loadPendingRequests() {
      const container = document.getElementById('pending-requests');
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        if (!currentUserProfile) {
          container.innerHTML = '<div class="empty-state"><p>Create your profile first</p></div>';
          document.getElementById('pending-count-hero').textContent = 'Create profile to connect';
          return;
        }
        
        const { data: requests } = await window.supabase
          .from('connections')
          .select(`
            *,
            from_user:community!connections_from_user_id_fkey(*)
          `)
          .eq('to_user_id', currentUserProfile.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        
        if (!requests || requests.length === 0) {
          container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All Clear!</h3><p>No pending requests</p></div>';
          document.getElementById('pending-count-badge').classList.add('hidden');
          document.getElementById('notif-count').classList.add('hidden');
          document.getElementById('pending-count-hero').textContent = 'No pending requests';
          return;
        }
        
        // Update badges
        document.getElementById('pending-count-badge').textContent = requests.length;
        document.getElementById('pending-count-badge').classList.remove('hidden');
        document.getElementById('notif-count').textContent = requests.length;
        document.getElementById('notif-count').classList.remove('hidden');
        document.getElementById('pending-count-hero').textContent = `${requests.length} pending request${requests.length > 1 ? 's' : ''}`;
        
        container.innerHTML = '';
        requests.forEach(req => {
          const user = req.from_user;
          const skills = parseSkills(user.skills).slice(0, 3);
          const initials = getInitials(user.name);
          const avatarHtml = user.image_url 
            ? `<img src="${user.image_url}" alt="${user.name}">`
            : initials;
          
          const skillsHtml = skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
          
          container.innerHTML += `
            <div class="request-card">
              <div class="request-header">
                <div class="request-avatar">${avatarHtml}</div>
                <div class="request-info">
                  <h4>${user.name || 'Anonymous'}</h4>
                  <small style="color: #666;">${getTimeAgo(new Date(req.created_at))}</small>
                </div>
              </div>
              <div class="request-skills">${skillsHtml || '<span style="color:#666;">No skills listed</span>'}</div>
              <div class="request-actions">
                <button class="btn btn-accept" onclick="acceptRequest('${req.id}')">
                  <i class="fas fa-check"></i> Accept
                </button>
                <button class="btn btn-decline" onclick="declineRequest('${req.id}')">
                  <i class="fas fa-times"></i> Decline
                </button>
              </div>
            </div>
          `;
        });
        
      } catch (err) {
        console.error('Error loading requests:', err);
        container.innerHTML = '<div class="empty-state"><p>Error loading requests</p></div>';
      }
    }

    async function loadAllConnections() {
      const container = document.getElementById('connections-content');
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        if (!currentUserProfile) {
          container.innerHTML = '<div class="empty-state"><p>Create your profile to see connections</p></div>';
          return;
        }
        
        const { data: connections } = await window.supabase
          .from('connections')
          .select(`
            *,
            from_user:community!connections_from_user_id_fkey(*),
            to_user:community!connections_to_user_id_fkey(*)
          `)
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
          .eq('status', 'accepted')
          .order('created_at', { ascending: false });
        
        if (!connections || connections.length === 0) {
          container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No Connections Yet</h3><p>Start connecting with the community!</p></div>';
          return;
        }
        
        container.innerHTML = `<div class="three-col-grid" id="all-connections-grid"></div>`;
        const grid = document.getElementById('all-connections-grid');
        
        connections.forEach(conn => {
          const otherUser = conn.from_user_id === currentUserProfile.id ? conn.to_user : conn.from_user;
          const card = createProfileCard(otherUser);
          grid.appendChild(card);
        });
        
      } catch (err) {
        console.error('Error loading all connections:', err);
        container.innerHTML = '<div class="empty-state"><p>Error loading connections</p></div>';
      }
    }

    // ========================
    // SEARCH & DISCOVERY
    // ========================
    async function searchPeople(query) {
      const container = document.getElementById('search-results');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Searching...</p></div>';
      
      try {
        let dbQuery = window.supabase.from('community').select('*');
        
        if (query) {
          dbQuery = dbQuery.or(`name.ilike.%${query}%,skills.ilike.%${query}%,bio.ilike.%${query}%`);
        }
        
        const { data: users, error } = await dbQuery.order('created_at', { ascending: false }).limit(20);
        
        if (error) {
          console.error('Search error:', error);
          container.innerHTML = `<div class="empty-state"><p>Error: ${error.message}</p></div>`;
          return;
        }
        
        console.log(`Search for "${query}" found ${users?.length || 0} results`);
        
        if (!users || users.length === 0) {
          container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>No Results</h3><p>Try a different search term</p></div>';
          return;
        }
        
        renderProfileCards(users, container);
        
      } catch (err) {
        console.error('Search error:', err);
        container.innerHTML = '<div class="empty-state"><p>Error searching</p></div>';
      }
    }

    async function loadSuggestedConnections() {
      const container = document.getElementById('suggestions-grid');
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        if (!currentUserProfile) {
          container.innerHTML = '<div class="empty-state"><p>Create your profile to get suggestions</p></div>';
          return;
        }
        
        const userSkills = parseSkills(currentUserProfile.skills);
        
        const { data: allUsers } = await window.supabase
          .from('community')
          .select('*')
          .neq('id', currentUserProfile.id)
          .order('connection_count', { ascending: false })
          .limit(20);
        
        if (!allUsers) {
          container.innerHTML = '<div class="empty-state"><p>No suggestions available</p></div>';
          return;
        }
        
        // Calculate matches
        const matches = allUsers.map(user => {
          const theirSkills = parseSkills(user.skills);
          const sharedSkills = userSkills.filter(s => 
            theirSkills.map(ts => ts.toLowerCase()).includes(s.toLowerCase())
          );
          return { ...user, sharedSkills: sharedSkills.length };
        })
        .filter(u => u.sharedSkills > 0)
        .sort((a, b) => b.sharedSkills - a.sharedSkills)
        .slice(0, 3);
        
        if (matches.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No suggestions based on your skills yet</p></div>';
          return;
        }
        
        renderProfileCards(matches, container);
        
      } catch (err) {
        console.error('Error loading suggestions:', err);
        container.innerHTML = '<div class="empty-state"><p>Error loading suggestions</p></div>';
      }
    }

    function createProfileCard(user) {
      const skills = parseSkills(user.skills).slice(0, 4);
      const initials = getInitials(user.name);
      const avatarHtml = user.image_url 
        ? `<img src="${user.image_url}" alt="${user.name}">`
        : initials;
      
      const skillsHtml = skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
      
      const card = document.createElement('div');
      card.className = 'profile-card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-avatar">${avatarHtml}</div>
          <div class="card-info">
            <div class="card-name">${user.name || 'Anonymous'}</div>
            <div class="card-availability available">${user.availability || 'Available'}</div>
          </div>
        </div>
        <div class="card-bio">${user.bio || 'No bio available'}</div>
        <div class="card-skills">${skillsHtml || '<span style="color:#666;">No skills listed</span>'}</div>
        <div class="card-stats">
          <span><i class="fas fa-link"></i> ${user.connection_count || 0} connections</span>
          <span><i class="fas fa-star"></i> ${skills.length} skills</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary" onclick="sendConnectionRequest('${user.id}')">
            <i class="fas fa-user-plus"></i> Connect
          </button>
          <button class="btn" onclick="viewProfile('${user.id}')">
            <i class="fas fa-eye"></i> View
          </button>
        </div>
      `;
      
      return card;
    }

    function renderProfileCards(users, container) {
      container.innerHTML = '';
      users.forEach(user => {
        const card = createProfileCard(user);
        container.appendChild(card);
      });
    }

    // ========================
    // SYNAPSE VISUALIZATION
    // ========================
    async function renderSynapse() {
      if (!currentUserProfile) {
        const label = document.getElementById('mini-synapse-label');
        if (label) label.textContent = 'Create profile to see network';
        return;
      }
      
      try {
        // Get all connections
        const { data: connections, error } = await window.supabase
          .from('connections')
          .select(`
            *,
            from_user:community!connections_from_user_id_fkey(*),
            to_user:community!connections_to_user_id_fkey(*)
          `)
          .eq('status', 'accepted')
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
        
        if (error) {
          console.error('Synapse error:', error);
          return;
        }
        
        if (!connections || connections.length === 0) {
          const label = document.getElementById('mini-synapse-label');
          if (label) label.textContent = 'No connections yet';
          return;
        }
        
        // Prepare nodes and links for D3
        const nodesMap = new Map();
        const links = [];
        
        // Add current user as center node
        nodesMap.set(currentUserProfile.id, {
          id: currentUserProfile.id,
          name: currentUserProfile.name || 'You',
          isCenter: true
        });
        
        connections.forEach(conn => {
          const fromUser = conn.from_user;
          const toUser = conn.to_user;
          
          if (fromUser && !nodesMap.has(fromUser.id)) {
            nodesMap.set(fromUser.id, {
              id: fromUser.id,
              name: fromUser.name || fromUser.email?.split('@')[0] || 'User',
              isCenter: fromUser.id === currentUserProfile.id
            });
          }
          
          if (toUser && !nodesMap.has(toUser.id)) {
            nodesMap.set(toUser.id, {
              id: toUser.id,
              name: toUser.name || toUser.email?.split('@')[0] || 'User',
              isCenter: toUser.id === currentUserProfile.id
            });
          }
          
          if (fromUser && toUser) {
            links.push({
              source: fromUser.id,
              target: toUser.id
            });
          }
        });
        
        const nodes = Array.from(nodesMap.values());
        
        // Render full synapse (for modal)
        if (typeof d3 !== 'undefined') {
          renderFullSynapse(nodes, links);
        }
        
        // Update mini synapse label
        const label = document.getElementById('mini-synapse-label');
        if (label) {
          label.textContent = `${connections.length} connection${connections.length !== 1 ? 's' : ''}`;
        }
        
      } catch (err) {
        console.error('Synapse error:', err);
      }
    }
    
    function renderFullSynapse(nodes, links) {
      const svg = d3.select('#synapse-svg');
      svg.selectAll('*').remove();
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      svg.attr('width', width).attr('height', height);
      
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(150))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(60));
      
      // Add links
      const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', 'rgba(0, 224, 255, 0.3)')
        .attr('stroke-width', 2);
      
      // Add nodes
      const node = svg.append('g')
        .selectAll('g')
        .data(nodes)
        .enter().append('g')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          viewProfile(d.id);
        })
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));
      
      node.append('circle')
        .attr('r', d => d.isCenter ? 30 : 20)
        .attr('fill', d => d.isCenter ? '#00e0ff' : '#0080ff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('transition', 'all 0.3s ease');
      
      // Add hover effect
      node.on('mouseenter', function(event, d) {
        d3.select(this).select('circle')
          .attr('r', d.isCenter ? 35 : 25)
          .attr('fill', d.isCenter ? '#00ffff' : '#0099ff');
      }).on('mouseleave', function(event, d) {
        d3.select(this).select('circle')
          .attr('r', d.isCenter ? 30 : 20)
          .attr('fill', d.isCenter ? '#00e0ff' : '#0080ff');
      });
      
      node.append('text')
        .text(d => d.name.split(' ')[0])
        .attr('text-anchor', 'middle')
        .attr('dy', 40)
        .attr('fill', '#fff')
        .attr('font-size', '12px');
      
      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        
        node.attr('transform', d => `translate(${d.x},${d.y})`);
      });
      
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      
      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
    }

    // ========================
    // TEAM BUILDER
    // ========================
    function setupTeamBuilder() {
      const skillInput = document.getElementById('team-skill-input');
      
      skillInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && skillInput.value.trim()) {
          e.preventDefault();
          addTeamSkill(skillInput.value.trim());
          skillInput.value = '';
        }
      });
      
      const slider = document.getElementById('team-size-slider');
      slider.addEventListener('click', (e) => {
        const rect = slider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        teamSize = Math.max(2, Math.min(10, Math.round(percent * 10)));
        updateTeamSize();
      });
    }

    function addTeamSkill(skill) {
      if (teamSkills.includes(skill)) return;
      teamSkills.push(skill);
      renderTeamSkills();
    }

    window.removeTeamSkill = function(skill) {
      teamSkills = teamSkills.filter(s => s !== skill);
      renderTeamSkills();
    };

    function renderTeamSkills() {
      const container = document.getElementById('team-skills-tags');
      const input = document.getElementById('team-skill-input');
      
      Array.from(container.children).forEach(child => {
        if (child.id !== 'team-skill-input') child.remove();
      });
      
      teamSkills.forEach(skill => {
        const tag = document.createElement('div');
        tag.className = 'skill-tag-removable';
        tag.innerHTML = `
          ${skill}
          <i class="fas fa-times" onclick="removeTeamSkill('${skill}')"></i>
        `;
        container.insertBefore(tag, input);
      });
    }

    function updateTeamSize() {
      const percent = ((teamSize - 2) / 8) * 100;
      document.getElementById('slider-track').style.width = percent + '%';
      document.getElementById('team-size-value').textContent = teamSize;
    }

    async function generateTeam() {
      if (teamSkills.length === 0) {
        alert('Please add at least one skill');
        return;
      }
      
      const resultsContainer = document.getElementById('team-results');
      const membersContainer = document.getElementById('team-members-grid');
      
      resultsContainer.classList.remove('hidden');
      membersContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      
      try {
        const { data: allUsers } = await window.supabase
          .from('community')
          .select('*');
        
        if (!allUsers) return;
        
        const scored = allUsers.map(user => {
          const userSkills = parseSkills(user.skills);
          const matches = teamSkills.filter(ts => 
            userSkills.map(us => us.toLowerCase()).includes(ts.toLowerCase())
          );
          return { ...user, matchCount: matches.length, matchedSkills: matches };
        })
        .filter(u => u.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount);
        
        const team = [];
        const usedSkills = new Set();
        
        for (const user of scored) {
          if (team.length >= teamSize) break;
          const newSkills = user.matchedSkills.filter(s => !usedSkills.has(s));
          if (newSkills.length > 0 || team.length === 0) {
            team.push(user);
            user.matchedSkills.forEach(s => usedSkills.add(s));
          }
        }
        
        const matchPercent = Math.round((usedSkills.size / teamSkills.length) * 100);
        document.getElementById('match-score').textContent = matchPercent + '%';
        
        renderProfileCards(team, membersContainer);
        
      } catch (err) {
        console.error('Team generation error:', err);
        membersContainer.innerHTML = '<div class="empty-state"><p>Error generating team</p></div>';
      }
    }

    // ========================
    // ACTIVITY FEED
    // ========================
    async function loadActivityFeed() {
      const container = document.getElementById('activity-feed');
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const { data: recentMembers } = await window.supabase
          .from('community')
          .select('name, created_at, skills')
          .gte('created_at', weekAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (!recentMembers || recentMembers.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
          return;
        }
        
        container.innerHTML = '';
        recentMembers.forEach(member => {
          const timeAgo = getTimeAgo(new Date(member.created_at));
          const skills = parseSkills(member.skills).slice(0, 2);
          const skillText = skills.length > 0 ? ` with <strong>${skills.join(', ')}</strong>` : '';
          
          container.innerHTML += `
            <div class="feed-item">
              <span class="feed-icon"><i class="fas fa-user-plus"></i></span>
              <div class="feed-content">
                <div class="feed-text"><strong>${member.name || 'Someone'}</strong> joined the network${skillText}</div>
                <div class="feed-time">${timeAgo}</div>
              </div>
            </div>
          `;
        });
        
      } catch (err) {
        console.error('Activity feed error:', err);
        container.innerHTML = '<div class="empty-state"><p>Error loading activity</p></div>';
      }
    }

    async function loadTrendingSkills() {
      const container = document.getElementById('trending-skills');
      container.innerHTML = '<div class="loading">Loading...</div>';
      
      try {
        const { data: allUsers } = await window.supabase
          .from('community')
          .select('skills');
        
        if (!allUsers) return;
        
        const skillCounts = {};
        allUsers.forEach(user => {
          parseSkills(user.skills).forEach(skill => {
            skillCounts[skill] = (skillCounts[skill] || 0) + 1;
          });
        });
        
        const sorted = Object.entries(skillCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        
        if (sorted.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No skills data</p></div>';
          return;
        }
        
        document.getElementById('top-skill').textContent = sorted[0][0];
        document.getElementById('top-skill-count').textContent = sorted[0][1] + ' members';
        
        const maxCount = sorted[0][1];
        container.innerHTML = '';
        
        sorted.forEach(([skill, count]) => {
          const percent = (count / maxCount) * 100;
          container.innerHTML += `
            <div class="skill-bar">
              <div class="skill-bar-label">
                <span class="skill-bar-name">${skill}</span>
                <span class="skill-bar-count">${count} members</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
          `;
        });
        
        setTimeout(() => {
          const fills = container.querySelectorAll('.skill-bar-fill');
          sorted.forEach(([skill, count], i) => {
            const percent = (count / maxCount) * 100;
            fills[i].style.width = percent + '%';
          });
        }, 100);
        
      } catch (err) {
        console.error('Trending skills error:', err);
        container.innerHTML = '<div class="empty-state"><p>Error loading trending skills</p></div>';
      }
    }

    // ========================
    // CONNECTION ACTIONS
    // ========================
    window.sendConnectionRequest = async function(toUserId) {
      try {
        if (!currentUserProfile) {
          alert('Please create your profile first');
          scrollToSection('profile');
          return;
        }
        
        const { error } = await window.supabase
          .from('connections')
          .insert({
            from_user_id: currentUserProfile.id,
            to_user_id: toUserId,
            status: 'pending'
          });
        
        if (error) throw error;
        
        alert('Connection request sent!');
        
      } catch (err) {
        console.error('Connection request error:', err);
        alert('Failed to send request');
      }
    };

    window.acceptRequest = async function(connectionId) {
      try {
        const { error } = await window.supabase
          .from('connections')
          .update({ status: 'accepted' })
          .eq('id', connectionId);
        
        if (error) throw error;
        
        await Promise.all([
          loadPendingRequests(),
          loadRecentConnections(),
          loadAllConnections()
        ]);
        
      } catch (err) {
        console.error('Accept error:', err);
        alert('Failed to accept request');
      }
    };

    window.declineRequest = async function(connectionId) {
      try {
        const { error } = await window.supabase
          .from('connections')
          .delete()
          .eq('id', connectionId);
        
        if (error) throw error;
        
        await loadPendingRequests();
        
      } catch (err) {
        console.error('Decline error:', err);
        alert('Failed to decline request');
      }
    };

    window.viewProfile = async function(userId) {
      console.log('View profile:', userId);
      
      try {
        // Fetch user profile
        const { data: user, error } = await window.supabase
          .from('community')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (error || !user) {
          console.error('Error loading profile:', error);
          return;
        }
        
        // Check if already connected
        let isConnected = false;
        let isPending = false;
        
        if (currentUserProfile) {
          const { data: existingConnection } = await window.supabase
            .from('connections')
            .select('*')
            .or(`and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${userId}),and(from_user_id.eq.${userId},to_user_id.eq.${currentUserProfile.id})`);
          
          if (existingConnection && existingConnection.length > 0) {
            const conn = existingConnection[0];
            isConnected = conn.status === 'accepted';
            isPending = conn.status === 'pending';
          }
        }
        
        // Get endorsements for this user (grouped by skill)
        const { data: endorsements } = await window.supabase
          .from('endorsements')
          .select('skill, endorser_community_id')
          .eq('endorsed_community_id', userId);
        
        // Count endorsements per skill
        const skillEndorsements = {};
        let totalEndorsements = 0;
        if (endorsements) {
          endorsements.forEach(e => {
            if (!skillEndorsements[e.skill]) {
              skillEndorsements[e.skill] = [];
            }
            skillEndorsements[e.skill].push(e.endorser_community_id);
            totalEndorsements++;
          });
        }
        
        // Check which skills current user has endorsed
        let userEndorsedSkills = [];
        if (currentUserProfile && endorsements) {
          userEndorsedSkills = endorsements
            .filter(e => e.endorser_community_id === currentUserProfile.id)
            .map(e => e.skill);
        }
        
        // Build modal content
        const skills = parseSkills(user.skills);
        const initials = getInitials(user.name);
        
        const avatarHtml = user.image_url 
          ? `<img src="${user.image_url}" alt="${user.name}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover;">`
          : `<div style="width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold;">${initials}</div>`;
        
        // Build skills HTML with endorsement counts and buttons
        const skillsHtml = skills.length > 0
          ? skills.map(s => {
              const endorseCount = skillEndorsements[s]?.length || 0;
              const hasEndorsed = userEndorsedSkills.includes(s);
              const canEndorse = currentUserProfile && userId !== currentUserProfile.id;
              
              let endorseBadge = '';
              if (endorseCount > 0) {
                endorseBadge = `<span style="background: rgba(255,215,0,0.2); color: #ffd700; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem;"><i class="fas fa-star"></i> ${endorseCount}</span>`;
              }
              
              let endorseBtn = '';
              if (canEndorse) {
                if (hasEndorsed) {
                  endorseBtn = `<button onclick="removeSkillEndorsement('${userId}', '${s}')" style="background: rgba(255,215,0,0.3); border: 1px solid rgba(255,215,0,0.5); color: #ffd700; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem; cursor: pointer;"><i class="fas fa-thumbs-up"></i> Endorsed</button>`;
                } else {
                  endorseBtn = `<button onclick="addSkillEndorsement('${userId}', '${s}')" style="background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3); color: #ffd700; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.75rem; margin-left: 0.5rem; cursor: pointer; transition: all 0.2s;"><i class="far fa-thumbs-up"></i> Endorse</button>`;
                }
              }
              
              return `
                <div style="display: inline-flex; align-items: center; background: rgba(0,224,255,0.2); padding: 0.5rem 0.75rem; border-radius: 20px; margin: 0.25rem;">
                  <span style="font-size: 0.9rem;">${s}</span>
                  ${endorseBadge}
                  ${endorseBtn}
                </div>
              `;
            }).join('')
          : '<p style="color: #888;">No skills listed</p>';
        
        let connectButtonHtml = '';
        if (currentUserProfile && userId !== currentUserProfile.id) {
          if (isConnected) {
            connectButtonHtml = '<button class="btn btn-secondary" disabled style="opacity: 0.6;">✓ Connected</button>';
          } else if (isPending) {
            connectButtonHtml = '<button class="btn btn-secondary" disabled style="opacity: 0.6;">⏳ Request Pending</button>';
          } else {
            connectButtonHtml = `<button class="btn btn-primary" onclick="sendConnectionRequest('${userId}'); document.getElementById('close-profile-modal').click();" style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.75rem 1.5rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;"><i class="fas fa-user-plus"></i> Connect</button>`;
          }
        }
        
        const modalContent = `
          <div style="text-align: center; padding: 2rem;">
            <div style="margin-bottom: 1.5rem;">
              ${avatarHtml}
            </div>
            <h2 style="margin-bottom: 0.5rem; color: #00e0ff;">${user.name || 'Anonymous'}</h2>
            <p style="color: #aaa; margin-bottom: 0.5rem;">${user.email || ''}</p>
            
            <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1.5rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-star" style="color: #ffd700;"></i>
                <span style="color: #ffd700; font-weight: bold;">${totalEndorsements}</span>
                <span style="color: #888; font-size: 0.9rem;">endorsement${totalEndorsements !== 1 ? 's' : ''}</span>
              </div>
            </div>
            
            ${user.bio ? `<p style="color: #ccc; margin-bottom: 1.5rem; max-width: 500px; margin-left: auto; margin-right: auto;">${user.bio}</p>` : ''}
            
            <div style="margin-bottom: 1.5rem;">
              <h3 style="color: #00e0ff; margin-bottom: 0.75rem;">Skills & Endorsements</h3>
              <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem;">
                ${skillsHtml}
              </div>
              ${currentUserProfile && userId !== currentUserProfile.id && skills.length > 0 ? '<p style="color: #888; font-size: 0.85rem; margin-top: 0.75rem;"><i class="fas fa-info-circle"></i> Click "Endorse" to endorse a skill</p>' : ''}
            </div>
            
            ${user.interests ? `
              <div style="margin-bottom: 1.5rem;">
                <h3 style="color: #00e0ff; margin-bottom: 0.75rem;">Interests</h3>
                <p style="color: #ccc;">${user.interests}</p>
              </div>
            ` : ''}
            
            ${user.availability ? `
              <div style="margin-bottom: 1.5rem;">
                <h3 style="color: #00e0ff; margin-bottom: 0.75rem;">Availability</h3>
                <p style="color: #ccc;">${user.availability}</p>
              </div>
            ` : ''}
            
            <div style="margin-top: 2rem; display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">
              ${connectButtonHtml}
            </div>
          </div>
        `;
        
        // Show modal
        document.getElementById('modal-profile-content').innerHTML = modalContent;
        document.getElementById('profile-modal').classList.add('active');
        
        // Store userId for functions
        window.currentlyViewedUserId = userId;
        
      } catch (err) {
        console.error('Error viewing profile:', err);
      }
    };
    
    // Close profile modal
    window.closeProfileModal = function() {
      document.getElementById('profile-modal').classList.remove('active');
    };
    
    // ========================
    // SKILL ENDORSEMENTS
    // ========================
    window.addSkillEndorsement = async function(userId, skill) {
      if (!currentUserProfile) {
        alert('Please create your profile first');
        return;
      }
      
      try {
        // Get the auth user IDs for both users
        const { data: endorsedUser, error: endorsedUserError } = await window.supabase
          .from('community')
          .select('user_id')
          .eq('id', userId)
          .single();
        
        if (endorsedUserError || !endorsedUser) {
          console.error('Could not find endorsed user:', endorsedUserError);
          alert('Could not find user to endorse');
          return;
        }
        
        const { data: endorserUser, error: endorserUserError } = await window.supabase
          .from('community')
          .select('user_id')
          .eq('id', currentUserProfile.id)
          .single();
        
        if (endorserUserError || !endorserUser) {
          console.error('Could not find your user record:', endorserUserError);
          alert('Could not find your user record');
          return;
        }
        
        const { error } = await window.supabase
          .from('endorsements')
          .insert({
            endorsed_id: endorsedUser.user_id,          // Auth user ID
            endorsed_community_id: userId,               // Community table ID
            endorser_id: endorserUser.user_id,          // Auth user ID
            endorser_community_id: currentUserProfile.id, // Community table ID
            skill: skill
          });
        
        if (error) {
          console.error('Endorsement error:', error);
          if (error.code === '23505') {
            alert('You have already endorsed this skill!');
          } else {
            alert('Failed to add endorsement: ' + error.message);
          }
          return;
        }
        
        console.log(`✅ Endorsed ${skill}!`);
        
        // Refresh the profile modal to show updated counts
        viewProfile(userId);
        
      } catch (err) {
        console.error('Endorsement error:', err);
        alert('Failed to add endorsement');
      }
    };
    
    window.removeSkillEndorsement = async function(userId, skill) {
      if (!currentUserProfile) return;
      
      try {
        const { error } = await window.supabase
          .from('endorsements')
          .delete()
          .eq('endorsed_community_id', userId)
          .eq('endorser_community_id', currentUserProfile.id)
          .eq('skill', skill);
        
        if (error) {
          console.error('Remove endorsement error:', error);
          alert('Failed to remove endorsement: ' + error.message);
          return;
        }
        
        console.log(`✅ Endorsement for ${skill} removed!`);
        
        // Refresh the profile modal to show updated counts
        viewProfile(userId);
        
      } catch (err) {
        console.error('Remove endorsement error:', err);
        alert('Failed to remove endorsement');
      }
    };

    // ========================
    // MESSAGING SYSTEM
    // ========================
    let conversations = [];
    let currentConversationId = null;
    let allConnections = [];
    
    async function loadMessaging() {
      if (!currentUserProfile) return;
      
      try {
        // Load all accepted connections for the dropdown
        const { data: connectionsData, error: connError } = await window.supabase
          .from('connections')
          .select('*, from_user:community!connections_from_user_id_fkey(id, name), to_user:community!connections_to_user_id_fkey(id, name)')
          .eq('status', 'accepted')
          .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
        
        if (!connError && connectionsData) {
          allConnections = connectionsData.map(conn => {
            const isFrom = conn.from_user_id === currentUserProfile.id;
            return {
              id: isFrom ? conn.to_user_id : conn.from_user_id,
              name: isFrom ? conn.to_user?.name : conn.from_user?.name
            };
          });
        }
        
        // Load conversations using your schema
        const { data: convData, error: convError } = await window.supabase
          .from('conversations')
          .select('*')
          .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`)
          .order('last_message_at', { ascending: false });
        
        if (convError) {
          console.error('Error loading conversations:', convError);
          conversations = [];
          renderConversations();
          return;
        }
        
        // Get unread count for each conversation
        conversations = await Promise.all((convData || []).map(async conv => {
          const isParticipant1 = conv.participant_1_id === currentUserProfile.id;
          const otherUserId = isParticipant1 ? conv.participant_2_id : conv.participant_1_id;
          
          // Fetch the other user's profile
          const { data: otherUserProfile } = await window.supabase
            .from('community')
            .select('id, name, image_url')
            .eq('id', otherUserId)
            .single();
          
          // Count unread messages in this conversation
          const { count: unreadCount } = await window.supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('read', false)
            .neq('sender_id', currentUserProfile.id);
          
          return {
            id: conv.id,
            userId: otherUserId,
            userName: otherUserProfile?.name || 'Unknown',
            userImage: otherUserProfile?.image_url,
            lastMessageAt: conv.last_message_at,
            lastMessagePreview: conv.last_message_preview || '',
            unreadCount: unreadCount || 0
          };
        }));
        
        renderConversations();
        
      } catch (err) {
        console.error('Messaging error:', err);
      }
    }
    
    function renderConversations() {
      const container = document.getElementById('conversations-list');
      
      if (conversations.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #aaa; padding: 2rem;"><i class="fas fa-inbox"></i><p>No conversations yet</p></div>';
        return;
      }
      
      container.innerHTML = conversations.map(conv => {
        const initials = getInitials(conv.userName);
        const avatar = conv.userImage 
          ? `<img src="${conv.userImage}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`
          : `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold;">${initials}</div>`;
        
        const unreadBadge = conv.unreadCount > 0 
          ? `<span style="background: #00e0ff; color: #000; padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.75rem; font-weight: bold;">${conv.unreadCount}</span>`
          : '';
        
        const timeAgo = conv.lastMessageAt ? getTimeAgo(new Date(conv.lastMessageAt)) : '';
        
        return `
          <div onclick="loadConversation('${conv.id}')" style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid rgba(0,224,255,0.1); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.05)'" onmouseout="this.style.background='transparent'">
            ${avatar}
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                <strong style="color: #00e0ff;">${conv.userName}</strong>
                ${unreadBadge}
              </div>
              <div style="color: #aaa; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${conv.lastMessagePreview}</div>
              <div style="color: #666; font-size: 0.8rem; margin-top: 0.25rem;">${timeAgo}</div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    window.loadConversation = async function(conversationId) {
      currentConversationId = conversationId;
      const conv = conversations.find(c => c.id === conversationId);
      if (!conv) return;
      
      // Update title
      document.getElementById('conversation-title').textContent = conv.userName;
      
      // Show message input
      document.getElementById('message-input-area').style.display = 'block';
      
      // Load messages for this conversation
      const { data: messages, error } = await window.supabase
        .from('messages')
        .select('*, sender:community!messages_sender_id_fkey(name)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error loading messages:', error);
        return;
      }
      
      // Mark unread messages as read
      const unreadIds = messages.filter(m => !m.read && m.sender_id !== currentUserProfile.id).map(m => m.id);
      if (unreadIds.length > 0) {
        await window.supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadIds);
        
        conv.unreadCount = 0;
        loadCommunityStats(); // Refresh unread count
      }
      
      // Render messages
      const container = document.getElementById('conversation-messages');
      container.innerHTML = (messages || []).map(msg => {
        const isOwn = msg.sender_id === currentUserProfile.id;
        return `
          <div style="display: flex; justify-content: ${isOwn ? 'flex-end' : 'flex-start'}; margin-bottom: 1rem;">
            <div style="max-width: 70%; padding: 0.75rem 1rem; background: ${isOwn ? 'linear-gradient(135deg, #00e0ff, #0080ff)' : 'rgba(255,255,255,0.1)'}; border-radius: 12px; color: ${isOwn ? '#000' : '#fff'};">
              <div>${msg.content}</div>
              <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7;">${getTimeAgo(new Date(msg.created_at))}</div>
            </div>
          </div>
        `;
      }).join('');
      
      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    };
    
    window.sendMessage = async function(event) {
      event.preventDefault();
      
      if (!currentConversationId) return;
      
      const input = document.getElementById('message-input');
      const content = input.value.trim();
      if (!content) return;
      
      try {
        // Insert message
        const { error } = await window.supabase
          .from('messages')
          .insert({
            conversation_id: currentConversationId,
            sender_id: currentUserProfile.id,
            content: content,
            topic: 'Direct Message',
            extension: 'text',
            read: false,
            private: true
          });
        
        if (error) {
          console.error('Send message error:', error);
          alert('Failed to send message: ' + error.message);
          return;
        }
        
        // Update conversation last_message
        await window.supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: content.substring(0, 100)
          })
          .eq('id', currentConversationId);
        
        console.log('✅ Message sent');
        input.value = '';
        
        // Reload conversation
        loadConversation(currentConversationId);
        
      } catch (err) {
        console.error('Send message error:', err);
        alert('Failed to send message');
      }
    };
    
    window.openNewMessageModal = function() {
      if (!currentUserProfile) {
        alert('Please create your profile first');
        return;
      }
      
      // Populate connections dropdown
      const select = document.getElementById('message-recipient');
      select.innerHTML = '<option value="">-- Select a connection --</option>' + 
        allConnections.map(conn => `<option value="${conn.id}">${conn.name}</option>`).join('');
      
      document.getElementById('new-message-modal').style.display = 'flex';
    };
    
    window.closeNewMessageModal = function() {
      document.getElementById('new-message-modal').style.display = 'none';
      document.getElementById('new-message-form').reset();
    };
    
    window.createNewMessage = async function(event) {
      event.preventDefault();
      
      const recipientId = document.getElementById('message-recipient').value;
      const content = document.getElementById('new-message-text').value.trim();
      
      if (!recipientId || !content) return;
      
      try {
        // Check if conversation already exists
        const { data: existingConv } = await window.supabase
          .from('conversations')
          .select('id')
          .or(`and(participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${recipientId}),and(participant_1_id.eq.${recipientId},participant_2_id.eq.${currentUserProfile.id})`)
          .single();
        
        let conversationId;
        
        if (existingConv) {
          // Use existing conversation
          conversationId = existingConv.id;
        } else {
          // Create new conversation
          const { data: newConv, error: convError } = await window.supabase
            .from('conversations')
            .insert({
              participant_1_id: currentUserProfile.id,
              participant_2_id: recipientId,
              last_message_preview: content.substring(0, 100)
            })
            .select()
            .single();
          
          if (convError) {
            console.error('Create conversation error:', convError);
            alert('Failed to create conversation: ' + convError.message);
            return;
          }
          
          conversationId = newConv.id;
        }
        
        // Send first message
        const { error } = await window.supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: currentUserProfile.id,
            content: content,
            topic: 'Direct Message',
            extension: 'text',
            read: false,
            private: true
          });
        
        if (error) {
          console.error('Send message error:', error);
          alert('Failed to send message: ' + error.message);
          return;
        }
        
        // Update conversation timestamp
        await window.supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: content.substring(0, 100)
          })
          .eq('id', conversationId);
        
        console.log('✅ Message sent');
        closeNewMessageModal();
        await loadMessaging();
        loadConversation(conversationId);
        
      } catch (err) {
        console.error('Send message error:', err);
        alert('Failed to send message');
      }
    };
    
    // ========================
    // DISCOVER TAB SWITCHING
    // ========================
    function setupDiscoverTabs() {
      const tabs = document.querySelectorAll('.discover-tab');
      const contents = document.querySelectorAll('.discover-tab-content');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetTab = tab.dataset.tab;
          
          // Update tab styles
          tabs.forEach(t => {
            t.style.color = '#aaa';
            t.style.borderBottom = '2px solid transparent';
            t.classList.remove('active');
          });
          tab.style.color = '#00e0ff';
          tab.style.borderBottom = '2px solid #00e0ff';
          tab.classList.add('active');
          
          // Update content visibility
          contents.forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
          });
          
          const targetContent = document.getElementById(`${targetTab}-tab`);
          if (targetContent) {
            targetContent.style.display = 'block';
            targetContent.classList.add('active');
          }
        });
      });
    }

    // ========================
    // INNOVATION HUB
    // ========================
    let projects = [];
    
    async function loadInnovationHub() {
      if (!currentUserProfile) {
        document.getElementById('innovation-empty').style.display = 'block';
        return;
      }
      
      try {
        // Fetch projects from database
        const { data, error } = await window.supabase
          .from('projects')
          .select('*')
          .eq('creator_id', currentUserProfile.id)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error loading projects:', error);
          // Show empty state
          document.getElementById('innovation-empty').style.display = 'block';
          return;
        }
        
        projects = data || [];
        renderProjects();
        
      } catch (err) {
        console.error('Innovation Hub error:', err);
        document.getElementById('innovation-empty').style.display = 'block';
      }
    }
    
    function renderProjects() {
      const container = document.getElementById('innovation-projects');
      const emptyState = document.getElementById('innovation-empty');
      
      if (projects.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      
      container.innerHTML = projects.map(project => {
        const tags = Array.isArray(project.tags) ? project.tags : (project.tags ? project.tags.split(',').map(t => t.trim()) : []);
        const statusColors = {
          'open': '#ffd700',
          'active': '#00e0ff',
          'completed': '#00ff88',
          'cancelled': '#ff6b6b'
        };
        const statusColor = statusColors[project.status] || '#aaa';
        
        return `
          <div class="project-card" style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 12px; padding: 1.5rem; transition: all 0.3s ease;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
              <h3 style="color: #00e0ff; margin: 0; flex: 1;">${project.title}</h3>
              <div style="display: flex; gap: 0.5rem;">
                <button onclick="editProject('${project.id}')" style="background: rgba(0,224,255,0.2); border: none; color: #00e0ff; padding: 0.5rem; border-radius: 6px; cursor: pointer;" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteProject('${project.id}')" style="background: rgba(255,102,102,0.2); border: none; color: #f66; padding: 0.5rem; border-radius: 6px; cursor: pointer;" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
            
            <p style="color: #aaa; margin-bottom: 1rem;">${project.description}</p>
            
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
              ${tags.map(tag => `<span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">${tag}</span>`).join('')}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: ${statusColor}; font-size: 0.9rem; font-weight: bold;">
                <i class="fas fa-circle" style="font-size: 0.5rem;"></i> ${project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </span>
              <span style="color: #666; font-size: 0.85rem;">
                ${new Date(project.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    window.openNewProjectModal = function() {
      if (!currentUserProfile) {
        alert('Please create your profile first');
        return;
      }
      document.getElementById('new-project-modal').style.display = 'flex';
    };
    
    window.closeNewProjectModal = function() {
      document.getElementById('new-project-modal').style.display = 'none';
      document.getElementById('new-project-form').reset();
    };
    
    window.createProject = async function(event) {
      event.preventDefault();
      
      if (!currentUserProfile) {
        alert('Please create your profile first');
        return;
      }
      
      const title = document.getElementById('project-name').value;
      const description = document.getElementById('project-description').value;
      const status = document.getElementById('project-status').value;
      const tagsInput = document.getElementById('project-tags').value;
      
      // Convert comma-separated string to array
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
      
      try {
        const { data, error } = await window.supabase
          .from('projects')
          .insert({
            creator_id: currentUserProfile.id,
            title: title,
            description: description,
            status: status,
            tags: tags
          })
          .select()
          .single();
        
        if (error) {
          console.error('Error creating project:', error);
          alert('Failed to create project: ' + error.message);
          return;
        }
        
        console.log('✅ Project created:', data);
        projects.unshift(data);
        renderProjects();
        closeNewProjectModal();
        
      } catch (err) {
        console.error('Create project error:', err);
        alert('Failed to create project');
      }
    };
    
    window.editProject = async function(projectId) {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      
      // Pre-fill form
      document.getElementById('project-name').value = project.title;
      document.getElementById('project-description').value = project.description;
      document.getElementById('project-status').value = project.status;
      // Convert array to comma-separated string for display
      document.getElementById('project-tags').value = Array.isArray(project.tags) ? project.tags.join(', ') : (project.tags || '');
      
      // Change form submit handler
      const form = document.getElementById('new-project-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        await updateProject(projectId);
      };
      
      openNewProjectModal();
    };
    
    async function updateProject(projectId) {
      const title = document.getElementById('project-name').value;
      const description = document.getElementById('project-description').value;
      const status = document.getElementById('project-status').value;
      const tagsInput = document.getElementById('project-tags').value;
      
      // Convert comma-separated string to array
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
      
      try {
        const { error } = await window.supabase
          .from('projects')
          .update({
            title: title,
            description: description,
            status: status,
            tags: tags
          })
          .eq('id', projectId);
        
        if (error) {
          console.error('Error updating project:', error);
          alert('Failed to update project: ' + error.message);
          return;
        }
        
        console.log('✅ Project updated');
        
        // Update local array
        const index = projects.findIndex(p => p.id === projectId);
        if (index !== -1) {
          projects[index] = { ...projects[index], title, description, status, tags };
        }
        
        renderProjects();
        closeNewProjectModal();
        
        // Reset form handler
        document.getElementById('new-project-form').onsubmit = createProject;
        
      } catch (err) {
        console.error('Update project error:', err);
        alert('Failed to update project');
      }
    }
    
    window.deleteProject = async function(projectId) {
      if (!confirm('Are you sure you want to delete this project?')) {
        return;
      }
      
      try {
        const { error } = await window.supabase
          .from('projects')
          .delete()
          .eq('id', projectId);
        
        if (error) {
          console.error('Error deleting project:', error);
          alert('Failed to delete project: ' + error.message);
          return;
        }
        
        console.log('✅ Project deleted');
        projects = projects.filter(p => p.id !== projectId);
        renderProjects();
        
      } catch (err) {
        console.error('Delete project error:', err);
        alert('Failed to delete project');
      }
    };

    // ========================
    // EVENT LISTENERS
    // ========================
    function setupEventListeners() {
      // Search
      document.getElementById('search-btn').addEventListener('click', () => {
        const query = document.getElementById('people-search').value;
        searchPeople(query);
      });
      
      document.getElementById('people-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          searchPeople(e.target.value);
        }
      });
      
      // Global search
      document.getElementById('global-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('people-search').value = e.target.value;
          scrollToSection('discover');
          searchPeople(e.target.value);
        }
      });
      
      // Quick filters
      document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', () => {
          tag.classList.toggle('active');
          const skill = tag.dataset.skill;
          if (skill) {
            searchPeople(skill);
          }
        });
      });
      
      // Team builder
      setupTeamBuilder();
      document.getElementById('generate-team-btn').addEventListener('click', generateTeam);
      
      // Profile toggle
      document.getElementById('profile-toggle').addEventListener('click', () => {
        const content = document.getElementById('profile-editor-content');
        content.classList.toggle('expanded');
      });
      
      // FABs
      document.getElementById('fab-synapse').addEventListener('click', () => {
        document.getElementById('synapse-container').classList.add('active');
      });
      
      document.getElementById('close-synapse').addEventListener('click', () => {
        document.getElementById('synapse-container').classList.remove('active');
      });
      
      document.getElementById('fab-bbs').addEventListener('click', () => {
        document.getElementById('bbs-modal').classList.add('active');
      });
      
      document.getElementById('fab-quick-connect').addEventListener('click', () => {
        scrollToSection('suggestions');
      });
      
      document.getElementById('mini-synapse').addEventListener('click', () => {
        document.getElementById('fab-synapse').click();
      });
      
      // Profile modal close
      const closeProfileBtn = document.getElementById('close-profile-modal');
      if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', closeProfileModal);
      }
      
      // Click outside modal to close
      const profileModal = document.getElementById('profile-modal');
      if (profileModal) {
        profileModal.addEventListener('click', (e) => {
          if (e.target === profileModal) {
            closeProfileModal();
          }
        });
      }
      
      // Modal close
      document.getElementById('close-profile-modal').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.remove('active');
      });
    }

    // ========================
    // LOAD EXISTING MODULES
    // ========================
    function loadExistingModules() {
      // Profile section will be loaded by profile.js
      // Connections will be handled by connections.js  
      // Innovation Hub will be loaded by cynq.js
      console.log('External modules will load their content');
    }

    // ========================
    // UTILITY FUNCTIONS
    // ========================
    window.scrollToSection = function(sectionId) {
      document.getElementById(sectionId).scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    };

    function parseSkills(skills) {
      if (!skills) return [];
      if (Array.isArray(skills)) return skills;
      if (typeof skills === 'string') {
        return skills.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [];
    }

    function getInitials(name) {
      if (!name) return '?';
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      }
      return parts[0].charAt(0).toUpperCase();
    }

    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
      };
      
      for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
          return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
      }
      
      return 'just now';
    }

    // ========================
    // START
    // ========================
    // NOTE: init() is called via events from login system, NOT on DOMContentLoaded
    // The login system handles authentication first

    // ================================================================
    // INTEGRATE LOGIN + DASHBOARD
    // ================================================================
    
    // Listen for profile loaded event
    
    // ================================================================
    // PROFILE MANAGEMENT FUNCTIONS
    // ================================================================
    
    // Function to render the profile form
    window.renderProfileForm = function(existingProfile = null) {
      const isNewProfile = !existingProfile;
      const profileSection = document.getElementById('profile-section');
      
      const formHTML = `
        <form id="profile-form" style="max-width: 800px; margin: 0 auto;">
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
              Name *
            </label>
            <input 
              type="text" 
              id="profile-name" 
              value="${existingProfile?.name || ''}"
              required
              placeholder="Your full name"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
              Bio
            </label>
            <textarea 
              id="profile-bio" 
              rows="4"
              placeholder="Tell us about yourself..."
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"
            >${existingProfile?.bio || ''}</textarea>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
              Skills (comma-separated)
            </label>
            <input 
              type="text" 
              id="profile-skills" 
              value="${existingProfile?.skills || ''}"
              placeholder="e.g., JavaScript, React, Python, Design"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
              Interests (comma-separated)
            </label>
            <input 
              type="text" 
              id="profile-interests" 
              value="${Array.isArray(existingProfile?.interests) ? existingProfile.interests.join(', ') : ''}"
              placeholder="e.g., AI, Web3, Sustainability"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
              Availability
            </label>
            <select 
              id="profile-availability"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
              <option value="Available" ${existingProfile?.availability === 'Available' ? 'selected' : ''}>Available</option>
              <option value="Busy" ${existingProfile?.availability === 'Busy' ? 'selected' : ''}>Busy</option>
              <option value="Not Available" ${existingProfile?.availability === 'Not Available' ? 'selected' : ''}>Not Available</option>
            </select>
          </div>

          <!-- Photo Upload Section -->
          <div style="margin-bottom: 2rem; text-align: center;">
            <div style="margin-bottom: 1rem;">
              <div id="profile-image-preview" style="display: inline-block; position: relative;">
                ${existingProfile?.image_url ? `
                  <img src="${existingProfile.image_url}" alt="Profile" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
                ` : `
                  <div style="width: 120px; height: 120px; border-radius: 50%; background: rgba(0,224,255,0.1); border: 3px dashed rgba(0,224,255,0.3); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user" style="font-size: 3rem; color: rgba(0,224,255,0.3);"></i>
                  </div>
                `}
              </div>
            </div>
            
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
              <label style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.75rem 1.5rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; display: inline-block;">
                <i class="fas fa-upload"></i> Upload Photo
                <input 
                  type="file" 
                  id="profile-photo-upload" 
                  accept="image/*"
                  style="display: none;"
                  onchange="handlePhotoUpload(event)"
                >
              </label>
              
              <button 
                type="button"
                onclick="toggleUrlInput()"
                style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.75rem 1.5rem; border-radius: 8px; color: white; cursor: pointer;"
              >
                <i class="fas fa-link"></i> Use URL Instead
              </button>
            </div>
            
            <!-- URL Input (hidden by default) -->
            <div id="url-input-container" style="display: none; margin-top: 1rem;">
              <input 
                type="url" 
                id="profile-image-url" 
                value="${existingProfile?.image_url || ''}"
                placeholder="https://example.com/your-photo.jpg"
                style="width: 100%; max-width: 400px; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
              >
            </div>
            
            <input type="hidden" id="profile-image-url-final" value="${existingProfile?.image_url || ''}">
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 2rem;">
            <button 
              type="submit" 
              style="flex: 1; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 1rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;"
            >
              <i class="fas fa-save"></i> ${isNewProfile ? 'Create Profile' : 'Save Changes'}
            </button>
            ${!isNewProfile ? `
              <button 
                type="button"
                onclick="cancelProfileEdit()"
                style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 1rem; border-radius: 8px; color: white; cursor: pointer; font-size: 1rem;"
              >
                Cancel
              </button>
            ` : ''}
          </div>
        </form>
      `;
      
      profileSection.innerHTML = formHTML;
      
      // Add form submit handler
      document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProfile(isNewProfile);
      });
    }

    // Function to toggle URL input visibility
    window.toggleUrlInput = function() {
      const container = document.getElementById('url-input-container');
      if (container.style.display === 'none') {
        container.style.display = 'block';
      } else {
        container.style.display = 'none';
      }
    };

    // Function to handle photo upload
    window.handlePhotoUpload = async function(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
      }
      
      try {
        // Show loading state
        const preview = document.getElementById('profile-image-preview');
        preview.innerHTML = `
          <div style="width: 120px; height: 120px; border-radius: 50%; background: rgba(0,224,255,0.1); border: 3px solid #00e0ff; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #00e0ff;"></i>
            <p style="color: #00e0ff; font-size: 0.8rem; margin-top: 0.5rem;">Uploading...</p>
          </div>
        `;
        
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id || Date.now()}_${Date.now()}.${fileExt}`;
        const filePath = `profile-photos/${fileName}`;
        
        // Upload to Supabase Storage
        const { data, error } = await window.supabase.storage
          .from('hacksbucket')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (error) {
          console.error('Upload error:', error);
          alert('Failed to upload image: ' + error.message);
          // Restore previous image or placeholder
          renderProfileForm(currentUserProfile);
          return;
        }
        
        // Get public URL
        const { data: { publicUrl } } = window.supabase.storage
          .from('hacksbucket')
          .getPublicUrl(filePath);
        
        console.log('✅ Image uploaded:', publicUrl);
        
        // Update preview
        preview.innerHTML = `
          <img src="${publicUrl}" alt="Profile" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
        `;
        
        // Store URL in hidden field
        document.getElementById('profile-image-url-final').value = publicUrl;
        
      } catch (err) {
        console.error('Upload error:', err);
        alert('Failed to upload image');
        renderProfileForm(currentUserProfile);
      }
    };

    // Function to save/update profile
    window.saveProfile = async function(isNewProfile) {
      const name = document.getElementById('profile-name').value.trim();
      const bio = document.getElementById('profile-bio').value.trim();
      const skills = document.getElementById('profile-skills').value.trim();
      const interestsInput = document.getElementById('profile-interests').value.trim();
      const availability = document.getElementById('profile-availability').value;
      
      // Get image URL from hidden field (set by upload) or manual URL input
      let imageUrl = document.getElementById('profile-image-url-final').value.trim();
      if (!imageUrl) {
        imageUrl = document.getElementById('profile-image-url')?.value.trim() || '';
      }
      
      if (!name) {
        alert('Name is required');
        return;
      }
      
      // Convert interests string to array
      const interests = interestsInput ? interestsInput.split(',').map(i => i.trim()).filter(Boolean) : [];
      
      const profileData = {
        name,
        bio,
        skills,
        interests,
        availability,
        image_url: imageUrl || null,
        email: currentUser.email
      };
      
      try {
        if (isNewProfile) {
          // Create new profile
          const { data, error} = await window.supabase
            .from('community')
            .insert(profileData)
            .select()
            .single();
          
          if (error) {
            console.error('Error creating profile:', error);
            alert('Failed to create profile: ' + error.message);
            return;
          }
          
          console.log('✅ Profile created:', data);
          currentUserProfile = data;
          
          // Dispatch profile-loaded event
          window.dispatchEvent(new CustomEvent('profile-loaded', { 
            detail: { user: currentUser, profile: data }
          }));
          
          alert('Profile created successfully!');
          
        } else {
          // Update existing profile
          console.log('📝 Updating profile with data:', profileData);
          console.log('📝 Profile ID:', currentUserProfile.id);
          
          const { data, error } = await window.supabase
            .from('community')
            .update(profileData)
            .eq('id', currentUserProfile.id)
            .select()
            .single();
          
          if (error) {
            console.error('Error updating profile:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            alert('Failed to update profile: ' + error.message);
            return;
          }
          
          console.log('✅ Profile updated:', data);
          currentUserProfile = data;
          
          // Update UI silently (already has null checks)
          updateUserUI(data);
          
          // Close the editor and show view
          cancelProfileEdit();
        }
      } catch (err) {
        console.error('Save profile error:', err);
        alert('Failed to save profile');
      }
    }

    // Function to cancel profile editing
    window.cancelProfileEdit = function() {
      if (currentUserProfile) {
        renderProfileView(currentUserProfile);
      }
    };

    // Wrapper function for edit profile button
    window.editCurrentProfile = function() {
      if (currentUserProfile) {
        renderProfileForm(currentUserProfile);
      } else {
        alert('Profile not loaded yet');
      }
    };

    // Function to render profile view (not editing)
    window.renderProfileView = function(profile) {
      const profileSection = document.getElementById('profile-section');
      
      const interests = Array.isArray(profile.interests) ? profile.interests : [];
      
      const viewHTML = `
        <div style="max-width: 800px; margin: 0 auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h3 style="color: #00e0ff; margin: 0;">Your Profile</h3>
            <button 
              onclick="editCurrentProfile()"
              style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.75rem 1.5rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;"
            >
              <i class="fas fa-edit"></i> Edit Profile
            </button>
          </div>
          
          <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 12px; padding: 2rem;">
            ${profile.image_url ? `
              <div style="text-align: center; margin-bottom: 2rem;">
                <img src="${profile.image_url}" alt="${profile.name}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
              </div>
            ` : ''}
            
            <div style="margin-bottom: 1.5rem;">
              <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">NAME</h4>
              <p style="color: white; font-size: 1.2rem; margin: 0;">${profile.name}</p>
            </div>
            
            <div style="margin-bottom: 1.5rem;">
              <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">EMAIL</h4>
              <p style="color: white; margin: 0;">${profile.email}</p>
            </div>
            
            ${profile.bio ? `
              <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">BIO</h4>
                <p style="color: white; margin: 0; line-height: 1.6;">${profile.bio}</p>
              </div>
            ` : ''}
            
            ${profile.skills ? `
              <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">SKILLS</h4>
                <p style="color: white; margin: 0;">${profile.skills}</p>
              </div>
            ` : ''}
            
            ${interests.length > 0 ? `
              <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">INTERESTS</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                  ${interests.map(interest => `
                    <span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">
                      ${interest}
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            <div style="margin-bottom: 1.5rem;">
              <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">AVAILABILITY</h4>
              <p style="color: ${profile.availability === 'Available' ? '#00ff88' : profile.availability === 'Busy' ? '#ffd700' : '#ff6b6b'}; margin: 0; font-weight: bold;">
                <i class="fas fa-circle" style="font-size: 0.5rem;"></i> ${profile.availability || 'Not set'}
              </p>
            </div>
          </div>
        </div>
      `;
      
      profileSection.innerHTML = viewHTML;
    }

    // Listen for profile-loaded event
    window.addEventListener('profile-loaded', async (e) => {
      console.log('📋 Profile loaded:', e.detail.profile);
      const { profile, user } = e.detail;
      
      currentUser = user;
      currentUserProfile = profile;
      
      // Update UI
      updateUserUI(profile);
      
      // Render profile view in profile section
      renderProfileView(profile);
      
      // Auto-expand the profile editor section
      const profileEditorContent = document.getElementById('profile-editor-content');
      if (profileEditorContent) {
        profileEditorContent.classList.add('expanded');
      }
      
      // Load dashboard data
      await Promise.all([
        loadCommunityStats(),
        loadRecentConnections(),
        loadPendingRequests(),
        loadSuggestedConnections(),
        renderSynapse(),
        loadInnovationHub(),
        loadMessaging()
      ]);
      
      await loadAllConnections();
      
      // Setup discover tabs
      setupDiscoverTabs();
      
      console.log('✅ Dashboard loaded');
    });
    
    // Listen for new user event
    window.addEventListener('profile-new', (e) => {
      console.log('🆕 New user:', e.detail.user);
      currentUser = e.detail.user;
      currentUserProfile = null;
      
      // Show profile creation form
      renderProfileForm(null);
      
      // Auto-expand the profile editor section
      const profileEditorContent = document.getElementById('profile-editor-content');
      if (profileEditorContent) {
        profileEditorContent.classList.add('expanded');
      }
    });
    
    // Listen for logout event
    window.addEventListener('user-logged-out', () => {
      console.log('👋 Logged out');
      currentUser = null;
      currentUserProfile = null;
    });

    // ================================================================
    // INITIALIZE
    // ================================================================
    document.addEventListener('DOMContentLoaded', async () => {
      console.log('🚀 CharlestonHacks Innovation Engine starting...');
      
      // Setup login DOM
      setupLoginDOM();
      
      // Initialize login system
      await initLoginSystem();
      
      // Setup dashboard event listeners
      setupEventListeners();
      
      console.log('✅ System ready!');
    });

