// ================================================================
// Dashboard Actions - Wire up consolidated bottom bar
// ================================================================

// Prevent duplicate initialization
if (window.__DASHBOARD_ACTIONS_INITIALIZED__) {
  console.log("⚠️ Dashboard Actions already initialized, skipping...");
  // Exit early to prevent duplicate initialization
  throw new Error('Dashboard Actions already initialized');
}

window.__DASHBOARD_ACTIONS_INITIALIZED__ = true;
console.log("%c🎮 Dashboard Actions Loading", "color:#0ff; font-weight:bold;");

// Wire up Quick Connect button
document.getElementById('btn-quickconnect')?.addEventListener('click', () => {
  if (typeof openQuickConnectModal === 'function') {
    openQuickConnectModal();
  } else {
    console.warn('Quick Connect not available');
  }
});

// Wire up Messages button (already wired in dashboardPane.js, but ensure it works)
document.getElementById('btn-messages')?.addEventListener('click', () => {
  const messagesModal = document.getElementById('messages-modal');
  if (messagesModal) {
    messagesModal.classList.add('active');
    if (window.MessagingModule && typeof window.MessagingModule.init === 'function') {
      window.MessagingModule.init();
    }
  } else {
    console.warn('Messages modal not found');
  }
});

// Wire up Projects button
document.getElementById('btn-projects')?.addEventListener('click', () => {
  if (typeof openProjectsModal === 'function') {
    openProjectsModal();
  } else {
    console.warn('Projects modal not available');
  }
});

// Wire up Themes button
document.getElementById('btn-themes')?.addEventListener('click', () => {
  if (typeof window.openThemeDiscoveryModal === 'function') {
    window.openThemeDiscoveryModal();
  } else {
    console.warn('Theme discovery not available');
  }
});

// Wire up Endorsements button
document.getElementById('btn-endorsements')?.addEventListener('click', () => {
  if (typeof openEndorsementsModal === 'function') {
    openEndorsementsModal();
  } else {
    console.warn('Endorsements modal not available');
  }
});

// Wire up BBS button
document.getElementById('btn-bbs')?.addEventListener('click', () => {
  if (typeof initBBS === 'function') {
    initBBS();
  } else {
    console.warn('BBS not available');
  }
});

// Wire up Organizations button
document.getElementById('btn-orgs')?.addEventListener('click', () => {
  if (typeof openOrganizationsModal === 'function') {
    openOrganizationsModal();
  } else {
    // Fallback: show a simple organizations modal
    showOrganizationsPanel();
  }
});

// Wire up Admin button (now at top)
document.getElementById('btn-admin-top')?.addEventListener('click', () => {
  openAdminPanel();
});

// Ensure admin button shows for admin users (multiple checks)
function ensureAdminButtonVisible() {
  const isAdmin = isAdminUser();
  console.log('🔍 Checking admin status:', isAdmin);
  
  if (isAdmin) {
    const adminBtn = document.getElementById('btn-admin-top');
    if (adminBtn) {
      adminBtn.style.display = 'flex';
      console.log('👑 Admin button shown');
    } else {
      console.warn('⚠️ Admin button element not found');
    }
    
    // Show admin badge in header
    const adminBadge = document.getElementById('admin-badge-header');
    if (adminBadge) {
      adminBadge.style.display = 'inline-block';
      console.log('👑 Admin badge in header shown');
    } else {
      console.warn('⚠️ Admin badge element not found');
    }
    
    // Show admin indicator in settings dropdown
    const adminSettingsIndicator = document.getElementById('admin-settings-indicator');
    if (adminSettingsIndicator) {
      adminSettingsIndicator.style.display = 'inline-block';
      console.log('👑 Admin settings indicator shown');
    } else {
      console.warn('⚠️ Admin settings indicator element not found');
    }
  } else {
    console.log('ℹ️ User is not an admin');
  }
}

// Check immediately and on multiple events
setTimeout(ensureAdminButtonVisible, 100);
setTimeout(ensureAdminButtonVisible, 500);
setTimeout(ensureAdminButtonVisible, 1500);
setTimeout(ensureAdminButtonVisible, 3000);

// Check when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureAdminButtonVisible);
} else {
  ensureAdminButtonVisible();
}

// Check when profile is loaded
document.addEventListener('profile-loaded', ensureAdminButtonVisible);

// Check when user data changes
window.addEventListener('user-data-loaded', ensureAdminButtonVisible);

// Expose function globally so it can be called from other modules
window.ensureAdminButtonVisible = ensureAdminButtonVisible;

// Expose a manual trigger for debugging
window.showAdminUI = function() {
  console.log('🔧 Manually triggering admin UI...');
  ensureAdminButtonVisible();
};

// Also expose isAdminUser for debugging
window.checkAdminStatus = function() {
  const isAdmin = isAdminUser();
  console.log('Admin status:', isAdmin);
  return isAdmin;
};

// Handle Settings button click
document.getElementById('dropdown-settings')?.addEventListener('click', () => {
  // Close dropdown
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  
  // Check if user is admin
  if (isAdminUser()) {
    // Open admin panel for admins
    console.log('👑 Opening admin panel from settings (admin user)');
    openAdminPanel();
  } else {
    // Show "coming soon" message for non-admins
    alert('Settings feature coming soon!');
  }
});

// Wire up View Controls button (backward compatibility if it exists)
document.getElementById('btn-view-controls')?.addEventListener('click', () => {
  toggleViewControls();
});

// Wire up Bottom Bar Toggle - REMOVED (no longer needed)
// Bottom bar toggle functionality has been removed per user request

// -----------------------------
// Admin detection (enhanced)
// -----------------------------
function isAdminUser() {
  // Known admin emails (add more as needed)
  const adminEmails = ['dmhamilton1@live.com'];

  // Try to get current user email from Supabase auth
  try {
    // Check session storage for auth data (synchronous)
    const authKeys = Object.keys(localStorage).filter(k => k.includes('supabase.auth'));
    for (const key of authKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        const email = parsed?.currentSession?.user?.email || parsed?.user?.email;
        if (email && adminEmails.includes(email.toLowerCase())) {
          console.log('✅ Admin access granted for:', email);
          return true;
        }
      }
    }
  } catch (e) {
    // Ignore parsing errors
  }

  // Try common places your app might store role
  const role =
    window?.appState?.communityProfile?.role ||
    window?.appState?.profile?.role ||
    window?.currentUserProfile?.role ||
    window?.communityProfile?.role ||
    window?.userRole;

  if (typeof role === "string") {
    const r = role.toLowerCase();
    if (r === "admin" || r === "superadmin" || r === "owner") {
      console.log('✅ Admin access granted via role:', r);
      return true;
    }
  }

  // If you have a boolean somewhere
  if (window?.appState?.isAdmin === true) {
    console.log('✅ Admin access granted via appState.isAdmin');
    return true;
  }

  // For development: always allow if dmhamilton1@live.com is in any storage
  const storageCheck =
    document.cookie.toLowerCase().includes('dmhamilton1@live.com') ||
    JSON.stringify(localStorage).toLowerCase().includes('dmhamilton1@live.com');

  if (storageCheck) {
    console.log('✅ Admin access granted via storage check');
    return true;
  }

  // Only log admin check failures in debug mode
  if (window.__DEBUG_ADMIN_CHECKS__) {
    console.log('ℹ️ Admin check: no admin credentials found');
  }
  return false;
}

// Expose globally for use by other modules (e.g., synapse)
window.isAdminUser = isAdminUser;

// -----------------------------
// Theme circle creation (MVP)
// -----------------------------
async function createThemeCirclePromptFlow() {
  const supabase = window.supabase;
  if (!supabase) {
    alert("Supabase not available on window");
    return;
  }

  if (!isAdminUser()) {
    alert("Admin only");
    return;
  }

  const title = (prompt("Theme title (e.g., AI in Radiology)") || "").trim();
  if (!title) return;

  const tagsRaw = (prompt("Tags (comma-separated), optional", "ai, radiology") || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  const daysRaw = (prompt("Expire in how many days?", "7") || "").trim();
  const days = Math.max(1, Math.min(90, parseInt(daysRaw, 10) || 7));
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();

  const payload = {
    title,
    tags,
    expires_at,
    origin_type: "admin"
  };

  const { error } = await supabase.from("theme_circles").insert([payload]);
  if (error) {
    console.error("theme_circles insert failed:", error);
    alert(error.message || "Failed to create theme circle");
    return;
  }

  // Close panel (nice UX)
  document.getElementById("view-controls-panel")?.remove();

  // Refresh Synapse
  await refreshSynapseThemesSafely();

  // Optional toast if you have one
  if (typeof window.showNotification === "function") {
    window.showNotification(`Theme created: ${title}`, "success");
  } else {
    console.log("✅ Theme created:", title);
  }
}

async function refreshSynapseThemesSafely() {
  // If you expose it globally later, this will work immediately
  if (typeof window.refreshThemeCircles === "function") {
    await window.refreshThemeCircles();
    return;
  }

  // If synapse.js is an ES module, try dynamic import
  try {
    const mod = await import("./synapse.js");
    if (typeof mod.refreshThemeCircles === "function") {
      await mod.refreshThemeCircles();
      return;
    }
  } catch (e) {
    console.warn("Could not import ./synapse.js for refreshThemeCircles()", e);
  }

  // Fall back: if you still have legacy refreshSynapseConnections around
  if (typeof window.refreshSynapseConnections === "function") {
    await window.refreshSynapseConnections();
  }
}

// Toggle view controls panel
function toggleViewControls() {
  let panel = document.getElementById('view-controls-panel');

  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'view-controls-panel';
  panel.style.cssText = `
    position: fixed;
    right: 20px;
    bottom: 100px;
    width: 320px;
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(0,224,255,0.4);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    z-index: 9999;
    backdrop-filter: blur(10px);
  `;

  // Admin section: only render if admin
  const adminHtml = isAdminUser() ? `
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #ffd700; font-size: 1rem; margin-bottom: 0.75rem;">
        <i class="fas fa-shield-alt"></i> Admin
      </h4>
      <div style="display: grid; gap: 0.5rem;">
        <button id="btn-theme-admin"
          style="width: 100%; padding: 0.75rem; background: rgba(255,215,0,0.10);
          border: 1px solid rgba(255,215,0,0.35); border-radius: 8px; color: #ffd700;
          cursor: pointer; font-weight: 700; text-align: left;">
          <i class="fas fa-bullseye"></i> Manage Theme Circles
        </button>
      </div>
    </div>
  ` : "";

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h3 style="color: #00e0ff; margin: 0; font-size: 1.25rem;">
        <i class="fas fa-sliders-h"></i> Menu
      </h3>
      <button onclick="document.getElementById('view-controls-panel').remove()"
        style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
        color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Actions Section -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem;">
        <i class="fas fa-bolt"></i> Quick Actions
      </h4>
      <div style="display: grid; gap: 0.5rem;">
        <button onclick="if(typeof openProjectsModal === 'function') openProjectsModal(); document.getElementById('view-controls-panel').remove();"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1);
          border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff;
          cursor: pointer; font-weight: 600; text-align: left;">
          <i class="fas fa-lightbulb"></i> Projects
        </button>
        <button onclick="if(typeof initBBS === 'function') initBBS(); document.getElementById('view-controls-panel').remove();"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1);
          border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff;
          cursor: pointer; font-weight: 600; text-align: left;">
          <i class="fas fa-comments"></i> Community Chat (BBS)
        </button>
        <button onclick="if(typeof openEndorsementsModal === 'function') openEndorsementsModal(); document.getElementById('view-controls-panel').remove();"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1);
          border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff;
          cursor: pointer; font-weight: 600; text-align: left;">
          <i class="fas fa-star"></i> Endorsements
        </button>
      </div>
    </div>

    ${adminHtml}
  `;

  document.body.appendChild(panel);

  // Wire up admin button after insert into DOM
  panel.querySelector("#btn-theme-admin")?.addEventListener("click", () => {
    if (typeof window.openThemeAdminModal === 'function') {
      window.openThemeAdminModal();
    } else {
      console.warn('Theme admin modal not available');
    }
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function closePanel(e) {
      if (!panel.contains(e.target) && !document.getElementById('btn-view-controls').contains(e.target)) {
        panel.remove();
        document.removeEventListener('click', closePanel);
      }
    });
  }, 100);
}

// Create mobile filter FAB button
function createMobileFilterFAB() {
  // DISABLED: Filter View panel removed per user request
  console.log('ℹ️ Mobile filter FAB disabled - using category buttons for filtering');
  return;
  
  // Remove existing FAB if present
  const existingFAB = document.getElementById('mobile-filter-fab');
  if (existingFAB) return;

  const fab = document.createElement('button');
  fab.id = 'mobile-filter-fab';
  fab.innerHTML = '<i class="fas fa-filter"></i>';
  fab.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 15px;
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #00e0ff, #0080ff);
    border: none;
    border-radius: 50%;
    color: #000;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,224,255,0.5);
    z-index: 1000;
    transition: all 0.3s ease;
  `;

  fab.addEventListener('click', () => {
    if (typeof window.toggleFilterSheet === 'function') {
      window.toggleFilterSheet();
    }
  });

  fab.addEventListener('touchstart', () => {
    fab.style.transform = 'scale(0.95)';
  });

  fab.addEventListener('touchend', () => {
    fab.style.transform = 'scale(1)';
  });

  document.body.appendChild(fab);
  console.log('✅ Mobile filter FAB created');
}

// -----------------------------
// Legend on Synapse Screen (Collapsible)
// -----------------------------
let legendCollapsed = true; // Start collapsed to give more space to synapse view

function createSynapseLegend() {
  // DISABLED: Filter View panel removed per user request
  // Category filtering is now handled by the search category buttons at the bottom
  console.log('ℹ️ Filter View panel disabled - using category buttons for filtering');
  return;
  
  // Remove existing legend if present
  const existingLegend = document.getElementById('synapse-legend-overlay');
  if (existingLegend) return; // Already exists

  const legend = document.createElement('div');
  legend.id = 'synapse-legend-overlay';
  
  // Check if mobile and admin status
  const isMobile = window.innerWidth <= 768;
  const isAdmin = isAdminUser();
  
  if (isMobile) {
    // Mobile: Create FAB button instead of showing legend immediately
    createMobileFilterFAB();
    
    // Mobile: Bottom sheet style (hidden by default)
    legend.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
      border: 2px solid rgba(0,224,255,0.3);
      border-radius: 20px 20px 0 0;
      padding: 0;
      z-index: 10000;
      backdrop-filter: blur(20px);
      box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      max-height: 70vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;
  } else {
    // Desktop: Improved compact panel style
    legend.style.cssText = `
      position: fixed;
      top: 90px;
      left: 15px;
      background: linear-gradient(135deg, rgba(10,14,39,0.96), rgba(26,26,46,0.96));
      border: 2px solid rgba(0,224,255,0.35);
      border-radius: 14px;
      padding: 0;
      z-index: 100;
      backdrop-filter: blur(15px);
      width: 240px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,224,255,0.15);
      transition: all 0.3s ease;
    `;
  }

  legend.innerHTML = `
    ${isMobile ? `
      <!-- Mobile: Drag handle -->
      <div style="padding: 0.75rem; display: flex; justify-content: center; cursor: grab; flex-shrink: 0;" id="legend-drag-handle">
        <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px;"></div>
      </div>
    ` : ''}
    
    <div style="display: flex; justify-content: space-between; align-items: center; ${isMobile ? 'padding: 0 1rem 0.75rem 1rem;' : 'padding: 1rem 1rem 0.75rem 1rem; border-bottom: 1px solid rgba(0,224,255,0.15);'}" id="legend-header">
      <h4 style="color: #00e0ff; font-size: ${isMobile ? '1.1rem' : '1rem'}; margin: 0; font-weight: 700; cursor: ${isMobile ? 'default' : 'pointer'}; flex: 1; display: flex; align-items: center; gap: 0.5rem;" id="legend-title">
        <i class="fas fa-filter"></i> <span>Filter View</span>
      </h4>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        ${!isMobile ? `
          <button id="legend-refresh-btn" style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer; padding: 0.4rem 0.6rem; font-size: 0.75rem; transition: all 0.2s;" title="Refresh Network">
            <i class="fas fa-sync-alt" id="refresh-icon"></i>
          </button>
          <i class="fas fa-chevron-up" id="legend-toggle-icon" style="color: #00e0ff; font-size: 0.9rem; transition: transform 0.3s; cursor: pointer;"></i>
        ` : `
          <button id="legend-close-btn" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 50%; width: 32px; height: 32px; color: #ff6b6b; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; transition: all 0.2s;">
            <i class="fas fa-times"></i>
          </button>
        `}
      </div>
    </div>

    <div id="legend-content" style="transition: all 0.3s ease; overflow-y: auto; ${isMobile ? 'padding: 0 1rem 1rem 1rem; flex: 1;' : 'padding: 1rem; overflow: hidden;'}">
      ${isAdmin ? `
        <button id="legend-analytics-btn" style="width: 100%; padding: 0.7rem; background: linear-gradient(135deg, #ffa500, #ffb84d); border: none; border-radius: 8px; color: #000; font-weight: 600; cursor: pointer; margin-bottom: 0.75rem; box-shadow: 0 2px 8px rgba(255, 170, 0, 0.3); transition: all 0.2s; font-size: 0.85rem;">
          <i class="fas fa-crown"></i> Admin Panel
        </button>
      ` : ''}

      ${!isMobile ? '' : `
        <button id="legend-refresh-btn-mobile" style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff; cursor: pointer; margin-bottom: 0.75rem; font-weight: 600; transition: all 0.2s;">
          <i class="fas fa-sync-alt" id="refresh-icon-mobile"></i> Refresh Network
        </button>
      `}

      <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
        <div id="legend-people" data-filter="people" style="display: flex; align-items: center; gap: 0.65rem; cursor: pointer; padding: 0.6rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,224,255,0.08); border: 1px solid rgba(0,224,255,0.25);">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: rgba(0,224,255,0.3); border: 2px solid #00e0ff; flex-shrink: 0;"></div>
          <span style="color: #fff; font-size: 0.85rem; font-weight: 600; flex: 1;">People</span>
          <i class="fas fa-check" style="color: #00ff88; font-size: 0.85rem;"></i>
        </div>
        <div id="legend-projects" data-filter="projects" style="display: flex; align-items: center; gap: 0.65rem; cursor: pointer; padding: 0.6rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.25);">
          <div style="width: 20px; height: 20px; transform: rotate(45deg); background: rgba(0,255,136,0.3); border: 2px solid #00ff88; flex-shrink: 0;"></div>
          <span style="color: #fff; font-size: 0.85rem; font-weight: 600; flex: 1;">Projects</span>
          <i class="fas fa-check" style="color: #00ff88; font-size: 0.85rem;"></i>
        </div>
        <div id="legend-themes" data-filter="themes" style="display: flex; align-items: center; gap: 0.65rem; cursor: pointer; padding: 0.6rem; border-radius: 8px; transition: all 0.2s; background: rgba(255,170,0,0.08); border: 1px solid rgba(255,170,0,0.25);">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: transparent; border: 3px solid #ffa500; flex-shrink: 0;"></div>
          <span style="color: #fff; font-size: 0.85rem; font-weight: 600; flex: 1;">Themes</span>
          <i class="fas fa-check" style="color: #00ff88; font-size: 0.85rem;"></i>
        </div>
        <div id="legend-organizations" data-filter="organizations" style="display: flex; align-items: center; gap: 0.65rem; cursor: pointer; padding: 0.6rem; border-radius: 8px; transition: all 0.2s; background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.25);">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: rgba(168,85,247,0.3); border: 2px solid #a855f7; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px;">🏢</div>
          <span style="color: #fff; font-size: 0.85rem; font-weight: 600; flex: 1;">Orgs</span>
          <i class="fas fa-check" style="color: #00ff88; font-size: 0.85rem;"></i>
        </div>
        <div id="legend-connections" data-filter="connections" style="display: flex; align-items: center; gap: 0.65rem; cursor: pointer; padding: 0.6rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2);">
          <div style="width: 26px; height: 2px; background: #00e0ff; flex-shrink: 0;"></div>
          <span style="color: #fff; font-size: 0.85rem; font-weight: 600; flex: 1;" id="connections-label">Connections</span>
          <i class="fas fa-check" style="color: #00ff88; font-size: 0.85rem;"></i>
        </div>
      </div>

      <!-- My Network / Discovery Mode Toggle -->
      <div style="padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button id="toggle-discovery-btn" style="
          width: 100%;
          padding: 0.75rem;
          background: linear-gradient(135deg, #ff6b6b, #ff8c8c);
          border: none;
          border-radius: 8px;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(255,107,107,0.3);
          font-size: 0.85rem;
        ">
          <i class="fas fa-user-friends"></i> <span id="discovery-btn-text">My Network</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(legend);

  // Mobile: Create backdrop
  if (isMobile) {
    const backdrop = document.createElement('div');
    backdrop.id = 'legend-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(backdrop);

    // Mobile: Toggle function
    window.toggleFilterSheet = () => {
      const isOpen = legend.style.transform === 'translateY(0%)';
      
      if (isOpen) {
        legend.style.transform = 'translateY(100%)';
        backdrop.style.opacity = '0';
        backdrop.style.pointerEvents = 'none';
      } else {
        legend.style.transform = 'translateY(0%)';
        backdrop.style.opacity = '1';
        backdrop.style.pointerEvents = 'auto';
      }
    };

    // Close on backdrop click
    backdrop.addEventListener('click', () => {
      window.toggleFilterSheet();
    });

    // Close button
    const closeBtn = document.getElementById('legend-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.toggleFilterSheet();
      });
    }

    // Drag to close
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const dragHandle = document.getElementById('legend-drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        dragHandle.style.cursor = 'grabbing';
      });

      dragHandle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        
        if (diff > 0) {
          legend.style.transform = `translateY(${diff}px)`;
        }
      });

      dragHandle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        dragHandle.style.cursor = 'grab';
        
        const diff = currentY - startY;
        if (diff > 100) {
          window.toggleFilterSheet();
        } else {
          legend.style.transform = 'translateY(0%)';
        }
      });
    }
  }

  // Add responsive positioning for desktop
  function updateLegendPosition() {
    const width = window.innerWidth;
    const wasMobile = legend.classList.contains('mobile-mode');
    const isNowMobile = width <= 768;

    if (wasMobile !== isNowMobile) {
      // Mode changed, recreate legend
      legend.remove();
      const backdrop = document.getElementById('legend-backdrop');
      if (backdrop) backdrop.remove();
      createSynapseLegend();
      return;
    }

    if (!isNowMobile) {
      // Desktop positioning
      legend.style.top = '100px';
      legend.style.bottom = 'auto';
      legend.style.left = '20px';
      legend.style.minWidth = '200px';
      legend.style.maxWidth = '250px';
    }
  }

  if (isMobile) {
    legend.classList.add('mobile-mode');
  }

  // Set initial position
  updateLegendPosition();

  // Update on resize
  window.addEventListener('resize', updateLegendPosition);

  // Wire up collapse/expand (desktop only)
  if (!isMobile) {
    const legendTitle = document.getElementById('legend-title');
    const content = document.getElementById('legend-content');
    const toggleIcon = document.getElementById('legend-toggle-icon');

    const toggleCollapse = () => {
      legendCollapsed = !legendCollapsed;

      if (legendCollapsed) {
        content.style.maxHeight = '0';
        content.style.opacity = '0';
        content.style.marginTop = '0';
        toggleIcon.style.transform = 'rotate(180deg)';
      } else {
        content.style.maxHeight = '500px';
        content.style.opacity = '1';
        content.style.marginTop = '0';
        toggleIcon.style.transform = 'rotate(0deg)';
      }
    };

    // Set initial collapsed state
    if (legendCollapsed) {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.marginTop = '0';
      toggleIcon.style.transform = 'rotate(180deg)';
    }

    legendTitle.addEventListener('click', toggleCollapse);
    toggleIcon.addEventListener('click', toggleCollapse);
  }

  // Wire up admin panel button (formerly analytics)
  const analyticsBtn = document.getElementById('legend-analytics-btn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      console.log('👑 Opening admin panel from Filter View');
      if (typeof window.openAdminPanel === 'function') {
        window.openAdminPanel();
      } else {
        console.error('❌ openAdminPanel function not found');
        alert('Admin panel not available');
      }
    });
    analyticsBtn.addEventListener('mouseenter', () => {
      analyticsBtn.style.transform = 'translateY(-2px)';
      analyticsBtn.style.boxShadow = '0 4px 12px rgba(255, 170, 0, 0.5)';
    });
    analyticsBtn.addEventListener('mouseleave', () => {
      analyticsBtn.style.transform = 'translateY(0)';
      analyticsBtn.style.boxShadow = '0 2px 8px rgba(255, 170, 0, 0.3)';
    });
  }

  // Wire up refresh button
  const refreshBtn = document.getElementById('legend-refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  if (refreshBtn && refreshIcon) {
    let isRefreshing = false;

    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent collapse/expand

      if (isRefreshing) return; // Prevent multiple clicks

      isRefreshing = true;

      // Start spinning animation
      refreshIcon.style.animation = 'spin 1s linear infinite';
      refreshBtn.style.opacity = '0.6';
      refreshBtn.style.cursor = 'not-allowed';

      try {
        // Call the synapse refresh function
        if (typeof window.refreshSynapseConnections === 'function') {
          await window.refreshSynapseConnections();
          console.log('✅ Network refreshed successfully');

          // Success feedback
          refreshBtn.style.background = 'rgba(0,255,136,0.2)';
          refreshBtn.style.borderColor = 'rgba(0,255,136,0.5)';
          refreshIcon.style.color = '#00ff88';

          setTimeout(() => {
            refreshBtn.style.background = 'rgba(0,224,255,0.1)';
            refreshBtn.style.borderColor = 'rgba(0,224,255,0.3)';
            refreshIcon.style.color = '#00e0ff';
          }, 1500);

        } else {
          console.warn('⚠️ Refresh function not available');
          // Fallback: reload the page
          location.reload();
        }
      } catch (error) {
        console.error('❌ Refresh failed:', error);

        // Error feedback
        refreshBtn.style.background = 'rgba(255,107,107,0.2)';
        refreshBtn.style.borderColor = 'rgba(255,107,107,0.5)';
        refreshIcon.style.color = '#ff6b6b';

        setTimeout(() => {
          refreshBtn.style.background = 'rgba(0,224,255,0.1)';
          refreshBtn.style.borderColor = 'rgba(0,224,255,0.3)';
          refreshIcon.style.color = '#00e0ff';
        }, 1500);
      } finally {
        // Stop spinning
        refreshIcon.style.animation = '';
        refreshBtn.style.opacity = '1';
        refreshBtn.style.cursor = 'pointer';
        isRefreshing = false;
      }
    });

    // Hover effects
    refreshBtn.addEventListener('mouseenter', () => {
      if (!isRefreshing) {
        refreshBtn.style.background = 'rgba(0,224,255,0.2)';
        refreshBtn.style.transform = 'scale(1.1)';
      }
    });

    refreshBtn.addEventListener('mouseleave', () => {
      if (!isRefreshing) {
        refreshBtn.style.background = 'rgba(0,224,255,0.1)';
        refreshBtn.style.transform = 'scale(1)';
      }
    });
  }

  // Add CSS keyframes for spin animation if not already present
  if (!document.getElementById('refresh-spin-style')) {
    const style = document.createElement('style');
    style.id = 'refresh-spin-style';
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // Wire up mobile refresh button
  const refreshBtnMobile = document.getElementById('legend-refresh-btn-mobile');
  const refreshIconMobile = document.getElementById('refresh-icon-mobile');
  if (refreshBtnMobile && refreshIconMobile) {
    let isRefreshing = false;

    refreshBtnMobile.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (isRefreshing) return;

      isRefreshing = true;

      // Start spinning animation
      refreshIconMobile.style.animation = 'spin 1s linear infinite';
      refreshBtnMobile.style.opacity = '0.6';
      refreshBtnMobile.style.cursor = 'not-allowed';

      try {
        if (typeof window.refreshSynapseConnections === 'function') {
          await window.refreshSynapseConnections();
          console.log('✅ Network refreshed successfully');

          // Success feedback
          refreshBtnMobile.style.background = 'rgba(0,255,136,0.2)';
          refreshBtnMobile.style.borderColor = 'rgba(0,255,136,0.5)';
          refreshIconMobile.style.color = '#00ff88';

          setTimeout(() => {
            refreshBtnMobile.style.background = 'rgba(0,224,255,0.1)';
            refreshBtnMobile.style.borderColor = 'rgba(0,224,255,0.3)';
            refreshIconMobile.style.color = '#00e0ff';
          }, 1500);

        } else {
          console.warn('⚠️ Refresh function not available');
          location.reload();
        }
      } catch (error) {
        console.error('❌ Refresh failed:', error);

        // Error feedback
        refreshBtnMobile.style.background = 'rgba(255,107,107,0.2)';
        refreshBtnMobile.style.borderColor = 'rgba(255,107,107,0.5)';
        refreshIconMobile.style.color = '#ff6b6b';

        setTimeout(() => {
          refreshBtnMobile.style.background = 'rgba(0,224,255,0.1)';
          refreshBtnMobile.style.borderColor = 'rgba(0,224,255,0.3)';
          refreshIconMobile.style.color = '#00e0ff';
        }, 1500);
      } finally {
        // Stop spinning
        refreshIconMobile.style.animation = '';
        refreshBtnMobile.style.opacity = '1';
        refreshBtnMobile.style.cursor = 'pointer';
        isRefreshing = false;
      }
    });
  }

  // Track filter state - Default all OFF except user
  const filterState = {
    people: false,
    projects: false,
    themes: false,
    organizations: false,
    connections: false
  };

  // On initial load, apply the default (all filters off)
  window.addEventListener('profile-loaded', () => {
    setTimeout(() => {
      applyVisualizationFilters(filterState);
      // Update button visual states
      updateAllButtonStates();
    }, 500);
  }, { once: true });

  // Function to toggle a specific filter (called from bottom buttons or legend)
  const toggleFilter = (filterType) => {
    if (!filterState.hasOwnProperty(filterType)) return;

    filterState[filterType] = !filterState[filterType];

    // Update legend visual state if legend exists
    const legendElement = document.getElementById(`legend-${filterType}`);
    if (legendElement) {
      const checkIcon = legendElement.querySelector('.fa-check');
      if (checkIcon) {
        if (filterState[filterType]) {
          checkIcon.style.display = 'block';
          legendElement.style.opacity = '1';
        } else {
          checkIcon.style.display = 'none';
          legendElement.style.opacity = '0.4';
        }
      }
    }

    // Update bottom button visual state
    const bottomButton = document.getElementById(`btn-${filterType === 'organizations' ? 'orgs' : filterType}`);
    if (bottomButton) {
      if (filterState[filterType]) {
        bottomButton.style.opacity = '1';
        bottomButton.style.transform = 'scale(1)';
      } else {
        bottomButton.style.opacity = '0.5';
        bottomButton.style.transform = 'scale(0.95)';
      }
    }

    // Apply filter to synapse visualization
    applyVisualizationFilters(filterState);

    // Show notification
    const status = filterState[filterType] ? 'shown' : 'hidden';
    console.log(`✅ ${filterType} filter toggled: ${status}`);
  };

  // Function to update all button visual states based on filter state
  const updateAllButtonStates = () => {
    Object.keys(filterState).forEach(filterType => {
      const bottomButton = document.getElementById(`btn-${filterType === 'organizations' ? 'orgs' : filterType}`);
      if (bottomButton) {
        if (filterState[filterType]) {
          bottomButton.style.opacity = '1';
          bottomButton.style.transform = 'scale(1)';
        } else {
          bottomButton.style.opacity = '0.5';
          bottomButton.style.transform = 'scale(0.95)';
        }
      }
    });
  };

  // Expose toggle function globally for bottom buttons
  window.toggleSynapseFilter = toggleFilter;
  window.updateAllButtonStates = updateAllButtonStates;

  // Add click handlers for legend filter items
  ['people', 'projects', 'themes', 'organizations', 'connections'].forEach(filterType => {
    const element = document.getElementById(`legend-${filterType}`);
    if (!element) return;

    element.addEventListener('click', () => {
      toggleFilter(filterType);
    });
  });

  // Discovery Mode is now always on - no toggle needed
  // Visual indicators on nodes show connection status instead
  console.log('🌐 Discovery Mode: Always enabled with visual connection indicators');
}

// Apply filters to the synapse visualization
function applyVisualizationFilters(filterState) {
  console.log('🔍 Applying visualization filters:', filterState);

  // Filter people nodes (they use class 'synapse-node' and have type 'person')
  const allNodes = document.querySelectorAll('.synapse-node');
  allNodes.forEach(node => {
    const nodeData = node.__data__; // D3 stores data on DOM elements
    if (nodeData && nodeData.type === 'person') {
      node.style.display = filterState.people ? 'block' : 'none';
    }
    // Filter organization nodes
    if (nodeData && nodeData.type === 'organization') {
      node.style.display = filterState.organizations ? 'block' : 'none';
    }
  });

  // Filter theme nodes
  const themeNodes = document.querySelectorAll('.theme-container');
  themeNodes.forEach(node => {
    node.style.display = filterState.themes ? 'block' : 'none';
  });

  // Filter project overlays
  const projectNodes = document.querySelectorAll('.project-overlay');
  projectNodes.forEach(node => {
    node.style.display = filterState.projects ? 'block' : 'none';
  });

  // Filter connection lines
  const connectionLines = document.querySelectorAll('.links line');
  connectionLines.forEach(line => {
    line.style.display = filterState.connections ? 'block' : 'none';
  });

  console.log('✅ Filters applied:', {
    people: Array.from(allNodes).filter(n => n.__data__?.type === 'person').length,
    organizations: Array.from(allNodes).filter(n => n.__data__?.type === 'organization').length,
    themes: themeNodes.length,
    projects: projectNodes.length,
    connections: connectionLines.length
  });
}

// Initialize legend when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for synapse to load
  setTimeout(createSynapseLegend, 1000);
  
  // Also check for admin button immediately
  setTimeout(() => {
    if (isAdminUser()) {
      const adminBtnLeft = document.getElementById('btn-admin-top-left');
      if (adminBtnLeft) {
        adminBtnLeft.style.display = 'flex';
        console.log('👑 Admin button shown on left side (DOMContentLoaded)');
      }
    }
  }, 1500);
});

// Also create legend when profile is loaded
window.addEventListener('profile-loaded', () => {
  // Prevent duplicate legend creation
  if (window.__LEGEND_PROFILE_LISTENER_ADDED__) return;
  window.__LEGEND_PROFILE_LISTENER_ADDED__ = true;
  
  setTimeout(createSynapseLegend, 500);

  // Show admin button if user is admin (now at top left)
  if (isAdminUser()) {
    // Show left-side admin button
    const adminBtnLeft = document.getElementById('btn-admin-top-left');
    if (adminBtnLeft) {
      adminBtnLeft.style.display = 'flex';
      console.log('👑 Admin button shown on left side (profile-loaded)');
    }
    
    // Show admin badge in dropdown
    const adminBadgeDropdown = document.getElementById('admin-badge-dropdown');
    if (adminBadgeDropdown) {
      adminBadgeDropdown.style.display = 'inline-block';
    }
    
    // Show Discovery Mode button for all users
    const discoveryBtn = document.getElementById('discovery-mode-btn');
    if (discoveryBtn) {
      discoveryBtn.style.display = 'flex';
      console.log('🌐 Discovery Mode button available to all users');
    }
  }
  
  // Wire up Discovery Mode - now always enabled
  console.log('🌐 Discovery Mode: Always enabled (no toggle needed)');
});

// Discovery Mode is now always on - no setup needed
// Visual indicators on nodes show connection status instead


// -----------------------------
// Bottom Bar Collapse/Expand - REMOVED
// This functionality has been removed per user request
// -----------------------------
// Admin Panel (per yellow instructions)
// -----------------------------
function openAdminPanel() {
  // Remove existing panel if present
  let panel = document.getElementById('admin-panel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.style.cssText = `
    position: fixed;
    inset: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(255,215,0,0.5);
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 25px 70px rgba(0,0,0,0.7);
    z-index: 10003;
    backdrop-filter: blur(20px);
    overflow-y: auto;
  `;

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 2px solid rgba(255,215,0,0.3); padding-bottom: 1rem;">
      <h2 style="color: #ffd700; margin: 0; font-size: 1.75rem;">
        <i class="fas fa-crown"></i> Admin Panel
      </h2>
      <button onclick="document.getElementById('admin-panel').remove()"
        style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
        color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.25rem;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Tabs -->
    <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1); align-items: center;">
      <!-- Resource Management Dropdown -->
      <div style="position: relative;">
        <button id="resource-mgmt-dropdown-btn" style="padding: 0.75rem 1.5rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px 8px 0 0; color: #00e0ff; cursor: pointer; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-tasks"></i> Resource Management
          <i class="fas fa-chevron-down" style="font-size: 0.8rem;"></i>
        </button>
        <div id="resource-mgmt-dropdown" style="display: none; position: absolute; top: 100%; left: 0; min-width: 220px; background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98)); border: 2px solid rgba(0,224,255,0.4); border-radius: 0 8px 8px 8px; padding: 0.5rem; z-index: 1000; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
          <button class="admin-tab active-admin-tab" data-tab="manage" style="width: 100%; padding: 0.75rem 1rem; background: rgba(0,224,255,0.1); border: none; border-radius: 6px; color: #00e0ff; cursor: pointer; font-weight: 600; transition: all 0.2s; text-align: left; margin-bottom: 0.25rem;">
            <i class="fas fa-users-cog"></i> Manage Community
          </button>
          <button class="admin-tab" data-tab="themes" style="width: 100%; padding: 0.75rem 1rem; background: transparent; border: none; border-radius: 6px; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s; text-align: left; margin-bottom: 0.25rem;">
            <i class="fas fa-bullseye"></i> Manage Themes
          </button>
          <button class="admin-tab" data-tab="projects" style="width: 100%; padding: 0.75rem 1rem; background: transparent; border: none; border-radius: 6px; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s; text-align: left; margin-bottom: 0.25rem;">
            <i class="fas fa-rocket"></i> Manage Projects
          </button>
          <button class="admin-tab" data-tab="organizations" style="width: 100%; padding: 0.75rem 1rem; background: transparent; border: none; border-radius: 6px; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s; text-align: left;">
            <i class="fas fa-building"></i> Manage Orgs
          </button>
        </div>
      </div>
      
      <button class="admin-tab" data-tab="system" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-cog"></i> System Settings
      </button>
    </div>

    <!-- Tab Content -->
    <div id="admin-tab-content" style="padding: 1rem 0;">
      <!-- Content will be loaded dynamically -->
    </div>
  `;

  document.body.appendChild(panel);

  // Wire up tabs
  panel.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.admin-tab').forEach(t => {
        t.style.background = 'transparent';
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'rgba(255,255,255,0.6)';
        t.classList.remove('active-admin-tab');
      });
      tab.style.background = 'rgba(0,224,255,0.1)';
      tab.style.borderBottomColor = '#00e0ff';
      tab.style.color = '#00e0ff';
      tab.classList.add('active-admin-tab');

      const tabName = tab.dataset.tab;
      loadAdminTabContent(tabName);
      
      // Close dropdown after selection
      const dropdown = document.getElementById('resource-mgmt-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    });
  });
  
  // Wire up Resource Management dropdown
  const dropdownBtn = document.getElementById('resource-mgmt-dropdown-btn');
  const dropdown = document.getElementById('resource-mgmt-dropdown');
  
  if (dropdownBtn && dropdown) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdownBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Load initial tab
  loadAdminTabContent('manage');
}

function loadAdminTabContent(tabName) {
  const content = document.getElementById('admin-tab-content');
  if (!content) return;

  if (tabName === 'manage') {
    // Load the new People Management panel
    content.innerHTML = '<div style="padding: 2rem; text-align: center; color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Loading People Management...</div>';
    
    // Wait for module to be available
    const checkModule = setInterval(() => {
      if (typeof window.AdminPeoplePanel !== 'undefined' && typeof window.AdminPeoplePanel.renderPeoplePanel === 'function') {
        clearInterval(checkModule);
        window.AdminPeoplePanel.renderPeoplePanel(content);
      }
    }, 100);
    
    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkModule);
      if (!window.AdminPeoplePanel) {
        content.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Failed to load People Management panel. Please refresh the page.</div>';
      }
    }, 5000);
  } else if (tabName === 'themes') {
    content.innerHTML = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <!-- Theme Management Section -->
        <div style="background: rgba(0,224,255,0.05); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem;">
          <h3 style="color: #00e0ff; font-size: 1.25rem; margin-bottom: 0.5rem;">
            <i class="fas fa-bullseye"></i> Theme Circles Management
          </h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; font-size: 0.9rem;">
            Create and manage theme circles for your community
          </p>
          
          <!-- Theme Admin Tabs -->
          <div class="theme-admin-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid rgba(0,224,255,0.2);">
            <button class="theme-tab-btn active" data-theme-tab="create" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid #00e0ff; color: #00e0ff; cursor: pointer; font-weight: 600; transition: all 0.2s;">
              <i class="fas fa-plus-circle"></i> Create New
            </button>
            <button class="theme-tab-btn" data-theme-tab="manage" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
              <i class="fas fa-list"></i> Manage Existing
            </button>
          </div>
          
          <!-- Create Tab Content -->
          <div id="theme-create-content" class="theme-tab-content">
            <form id="admin-theme-create-form" style="display: grid; gap: 1.25rem;">
              <div class="form-group">
                <label for="admin-theme-title" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                  Theme Title *
                </label>
                <input
                  type="text"
                  id="admin-theme-title"
                  name="title"
                  placeholder="e.g., AI in Healthcare"
                  required
                  style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                         border-radius: 8px; color: #fff; font-size: 1rem;"
                />
              </div>

              <div class="form-group">
                <label for="admin-theme-description" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                  Description
                </label>
                <textarea
                  id="admin-theme-description"
                  name="description"
                  placeholder="What is this theme about?"
                  rows="4"
                  style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                         border-radius: 8px; color: #fff; font-size: 1rem; resize: vertical;"
                ></textarea>
              </div>

              <div class="form-group">
                <label for="admin-theme-tags" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  id="admin-theme-tags"
                  name="tags"
                  placeholder="ai, healthcare, innovation"
                  style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                         border-radius: 8px; color: #fff; font-size: 1rem;"
                />
              </div>

              <div class="form-group">
                <label for="admin-theme-duration" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                  Duration (days) *
                </label>
                <input
                  type="number"
                  id="admin-theme-duration"
                  name="duration"
                  min="1"
                  max="90"
                  value="7"
                  required
                  style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                         border-radius: 8px; color: #fff; font-size: 1rem;"
                />
                <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 0.25rem;">
                  How long should this theme remain active? (1-90 days)
                </small>
              </div>

              <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label for="admin-theme-cta-text" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                    CTA Button Text
                  </label>
                  <input
                    type="text"
                    id="admin-theme-cta-text"
                    name="cta_text"
                    placeholder="e.g., Join Slack"
                    style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                           border-radius: 8px; color: #fff; font-size: 1rem;"
                  />
                </div>

                <div class="form-group">
                  <label for="admin-theme-cta-link" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
                    CTA Button Link
                  </label>
                  <input
                    type="url"
                    id="admin-theme-cta-link"
                    name="cta_link"
                    placeholder="https://slack.com/invite..."
                    style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                           border-radius: 8px; color: #fff; font-size: 1rem;"
                  />
                </div>
              </div>

              <div class="form-actions" style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                <button
                  type="button"
                  onclick="document.getElementById('admin-theme-create-form').reset()"
                  style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
                         border-radius: 8px; color: #fff; cursor: pointer; font-weight: 600;"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00e0ff, #00a8cc); border: none;
                         border-radius: 8px; color: #000; cursor: pointer; font-weight: 700;"
                >
                  <i class="fas fa-plus-circle"></i> Create Theme Circle
                </button>
              </div>
            </form>
          </div>
          
          <!-- Manage Tab Content -->
          <div id="theme-manage-content" class="theme-tab-content" style="display: none;">
            <div id="admin-themes-list" style="color: rgba(255,255,255,0.7);">
              Loading themes...
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Wire up theme tab switching
    const themeTabBtns = content.querySelectorAll('.theme-tab-btn');
    themeTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update button states
        themeTabBtns.forEach(b => {
          b.classList.remove('active');
          b.style.borderBottom = '3px solid transparent';
          b.style.color = 'rgba(255,255,255,0.6)';
        });
        btn.classList.add('active');
        btn.style.borderBottom = '3px solid #00e0ff';
        btn.style.color = '#00e0ff';
        
        // Show/hide content
        const tab = btn.dataset.themeTab;
        content.querySelector('#theme-create-content').style.display = tab === 'create' ? 'block' : 'none';
        content.querySelector('#theme-manage-content').style.display = tab === 'manage' ? 'block' : 'none';
        
        // Load themes list when switching to manage tab
        if (tab === 'manage') {
          loadAdminThemesList();
        }
      });
    });
    
    // Wire up create form submission
    const createForm = content.querySelector('#admin-theme-create-form');
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleAdminCreateTheme(createForm);
      });
    }
    
    // Load themes list initially (for manage tab)
    loadAdminThemesList();
  } else if (tabName === 'projects') {
    content.innerHTML = `
      <div style="margin-bottom: 2rem;">
        <button onclick="if(typeof openProjectsModal === 'function') openProjectsModal();" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer;">
          <i class="fas fa-plus"></i> Create New Project
        </button>
      </div>
      <div id="admin-projects-list" style="color: rgba(255,255,255,0.7);">
        Loading projects...
      </div>
    `;
    loadProjectsList();
  } else if (tabName === 'organizations') {
    content.innerHTML = `
      <div style="margin-bottom: 2rem;">
        <button onclick="if(typeof showOrganizationsPanel === 'function') { document.getElementById('admin-panel')?.remove(); showOrganizationsPanel(); }" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer;">
          <i class="fas fa-plus"></i> Create New Organization
        </button>
      </div>
      <div id="admin-orgs-list" style="color: rgba(255,255,255,0.7);">
        Loading organizations...
      </div>
    `;
    loadOrganizationsList();
  } else if (tabName === 'system') {
    const isEnabled = localStorage.getItem('enable-unified-network') === 'true';
    // Check both debug flags - if either is set, show as enabled
    const isDebug = localStorage.getItem('unified-network-debug') === 'true' || 
                    localStorage.getItem('DEBUG') === '1';
    
    content.innerHTML = `
      <div style="max-height: 60vh; overflow-y: auto;">
        <!-- Unified Network Discovery Section -->
        <div style="background: rgba(0,224,255,0.05); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1.25rem; margin-bottom: 1rem;">
            <i class="fas fa-network-wired"></i> Unified Network Discovery
          </h3>
          
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; line-height: 1.6;">
            Enable the new physics-based network visualization with smooth animations and intelligent discovery features.
          </p>
          
          <div style="margin-bottom: 1.5rem;">
            <label style="display: flex; align-items: center; color: #fff; cursor: pointer; font-size: 1rem; margin-bottom: 1rem;">
              <input type="checkbox" id="unified-network-toggle-admin" ${isEnabled ? 'checked' : ''} 
                style="margin-right: 12px; cursor: pointer; width: 20px; height: 20px;">
              <span style="font-weight: 600;">Enable Unified Network</span>
            </label>
            
            <label style="display: flex; align-items: center; color: #fff; cursor: pointer; font-size: 0.95rem;">
              <input type="checkbox" id="unified-network-debug-toggle-admin" ${isDebug ? 'checked' : ''} 
                style="margin-right: 12px; cursor: pointer; width: 18px; height: 18px;">
              <span>Debug Mode (verbose console logging)</span>
            </label>
          </div>
          
          <div style="padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; margin-bottom: 1.5rem;">
            <div style="font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem;">Status:</div>
            <div id="unified-network-status-admin" style="font-size: 1.1rem; font-weight: 600; color: ${isEnabled ? '#44ff44' : '#ff4444'};">
              ${isEnabled ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <button id="unified-network-reload-admin" style="
              padding: 0.875rem 1.25rem;
              background: linear-gradient(135deg, #00e0ff, #0080ff);
              border: none;
              border-radius: 8px;
              color: white;
              font-weight: 600;
              cursor: pointer;
              font-size: 0.95rem;
              transition: all 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,224,255,0.4)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
              <i class="fas fa-sync-alt"></i> Apply & Reload
            </button>
            
            <button id="unified-network-test-admin" style="
              padding: 0.875rem 1.25rem;
              background: rgba(68, 136, 255, 0.2);
              border: 1px solid rgba(68, 136, 255, 0.5);
              border-radius: 8px;
              color: #4488ff;
              font-weight: 600;
              cursor: pointer;
              font-size: 0.95rem;
              transition: all 0.2s;
            " onmouseover="this.style.background='rgba(68, 136, 255, 0.3)'" onmouseout="this.style.background='rgba(68, 136, 255, 0.2)'">
              <i class="fas fa-vial"></i> Run Tests
            </button>
          </div>
          
          <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,170,0,0.1); border: 1px solid rgba(255,170,0,0.3); border-radius: 8px;">
            <div style="color: #ffaa00; font-size: 0.85rem; line-height: 1.5;">
              <i class="fas fa-info-circle"></i> <strong>Note:</strong> Changes require a page reload to take effect. The unified network provides smooth physics-based animations and intelligent discovery features.
            </div>
          </div>
        </div>
        
        <!-- Quiet Mode Settings -->
        <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.3); border-radius: 12px;">
          <h3 style="color: #a855f7; margin: 0 0 1rem 0; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-volume-mute"></i> Quiet Mode
          </h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; line-height: 1.6;">
            Enable quiet mode to reduce visual noise and focus on key connections. This mode simplifies the network view and highlights relevant nodes.
          </p>
          
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.75rem; background: rgba(168,85,247,0.1); border-radius: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(168,85,247,0.15)'" onmouseout="this.style.background='rgba(168,85,247,0.1)'">
            <input type="checkbox" id="quiet-mode-toggle-admin" style="width: 20px; height: 20px; cursor: pointer;">
            <span style="color: #fff; font-weight: 600;">Enable Quiet Mode</span>
          </label>
          
          <div style="margin-top: 1rem; padding: 1rem; background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.3); border-radius: 8px;">
            <div style="color: #a855f7; font-size: 0.85rem; line-height: 1.5;">
              <i class="fas fa-info-circle"></i> <strong>Note:</strong> Quiet mode will reload the page to apply changes. Your network will be simplified to show only the most relevant connections.
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Wire up event listeners
    const toggle = document.getElementById('unified-network-toggle-admin');
    const debugToggle = document.getElementById('unified-network-debug-toggle-admin');
    const reloadBtn = document.getElementById('unified-network-reload-admin');
    const testBtn = document.getElementById('unified-network-test-admin');
    const status = document.getElementById('unified-network-status-admin');
    const quietModeToggle = document.getElementById('quiet-mode-toggle-admin');
    
    // Check current quiet mode state
    if (quietModeToggle) {
      const isQuietMode = localStorage.getItem('quiet-mode-enabled') === 'true';
      quietModeToggle.checked = isQuietMode;
      
      quietModeToggle.addEventListener('change', () => {
        if (quietModeToggle.checked) {
          localStorage.setItem('quiet-mode-enabled', 'true');
          if (confirm('Enable Quiet Mode? This will reload the page to apply changes.')) {
            window.location.reload();
          } else {
            quietModeToggle.checked = false;
            localStorage.removeItem('quiet-mode-enabled');
          }
        } else {
          localStorage.removeItem('quiet-mode-enabled');
          if (confirm('Disable Quiet Mode? This will reload the page to apply changes.')) {
            window.location.reload();
          } else {
            quietModeToggle.checked = true;
            localStorage.setItem('quiet-mode-enabled', 'true');
          }
        }
      });
    }
    
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        localStorage.setItem('enable-unified-network', 'true');
        status.textContent = '⚠️ Enabled (reload required)';
        status.style.color = '#ffaa00';
      } else {
        localStorage.removeItem('enable-unified-network');
        status.textContent = '⚠️ Disabled (reload required)';
        status.style.color = '#ffaa00';
      }
    });
    
    debugToggle.addEventListener('change', () => {
      if (debugToggle.checked) {
        // Enable both unified network debug AND general debug mode
        localStorage.setItem('unified-network-debug', 'true');
        localStorage.setItem('DEBUG', '1');
        console.log('🐛 Debug mode enabled - verbose console logging activated');
        console.log('   Reload the page to see full debug output');
      } else {
        // Disable both debug modes
        localStorage.removeItem('unified-network-debug');
        localStorage.removeItem('DEBUG');
        console.log('🐛 Debug mode disabled - console logging minimized');
        console.log('   Reload the page to apply changes');
      }
    });
    
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running Tests...';
      
      try {
        if (window.unifiedNetworkIntegration?.isActive()) {
          console.log('🧪 Running unified network tests...');
          
          // Check system health
          if (window.unifiedNetworkErrorIntegration) {
            const isHealthy = window.unifiedNetworkErrorIntegration.isHealthy();
            const stats = window.unifiedNetworkErrorIntegration.getStats();
            
            console.log('🏥 System Health:', { healthy: isHealthy, stats });
            
            if (isHealthy) {
              alert('✅ System is healthy! All tests passed.');
            } else {
              alert(`⚠️ System has ${stats.total} logged errors. Check console for details.`);
            }
          } else {
            alert('✅ Unified network is active and running!');
          }
        } else {
          alert('ℹ️ Unified network is not currently active. Enable it and reload to test.');
        }
        
        testBtn.innerHTML = '<i class="fas fa-check"></i> Tests Complete';
        setTimeout(() => {
          testBtn.innerHTML = '<i class="fas fa-vial"></i> Run Tests';
          testBtn.disabled = false;
        }, 2000);
      } catch (error) {
        console.error('❌ Test failed:', error);
        testBtn.innerHTML = '<i class="fas fa-times"></i> Test Failed';
        testBtn.disabled = false;
      }
    });
  }
}

// Admin function to add a person to the community
async function adminAddPerson() {
  const emailInput = document.getElementById('admin-add-email');
  const statusEl = document.getElementById('admin-add-status');
  
  if (!emailInput || !statusEl) return;
  
  const email = emailInput.value.trim();
  
  if (!email) {
    statusEl.innerHTML = '<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Please enter an email address</span>';
    return;
  }
  
  if (!email.includes('@')) {
    statusEl.innerHTML = '<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Please enter a valid email address</span>';
    return;
  }
  
  statusEl.innerHTML = '<span style="color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Adding person...</span>';
  
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');
    
    // Check if email already exists
    const { data: existing } = await supabase
      .from('community')
      .select('id, name, email')
      .eq('email', email)
      .maybeSingle();
    
    if (existing) {
      statusEl.innerHTML = `<span style="color: #ffaa00;"><i class="fas fa-info-circle"></i> User already exists: ${existing.name || email}</span>`;
      return;
    }
    
    // Create new community profile
    const { data: newProfile, error } = await supabase
      .from('community')
      .insert({
        email: email,
        name: email.split('@')[0], // Use email prefix as default name
        profile_completed: false,
        onboarding_completed: false,
        is_hidden: false
      })
      .select()
      .single();
    
    if (error) throw error;
    
    statusEl.innerHTML = `<span style="color: #00ff88;"><i class="fas fa-check-circle"></i> Successfully added ${email}! They can now log in and complete their profile.</span>`;
    emailInput.value = '';
    
    // Refresh synapse if available
    if (typeof window.refreshSynapse === 'function') {
      setTimeout(() => window.refreshSynapse(), 1000);
    }
    
  } catch (error) {
    console.error('Error adding person:', error);
    statusEl.innerHTML = `<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Error: ${error.message}</span>`;
  }
}

// Admin function to search for people
async function adminSearchPeople(query) {
  const listEl = document.getElementById('admin-people-list');
  if (!listEl) return;
  
  if (!query || query.length < 2) {
    listEl.innerHTML = `
      <div style="text-align: center; color: rgba(255,255,255,0.5); padding: 2rem;">
        <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
        <p>Search for people to manage</p>
      </div>
    `;
    return;
  }
  
  listEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');
    
    const { data: people, error } = await supabase
      .from('community')
      .select('id, name, email, image_url, is_hidden')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(50); // Increased limit to show more results including removed members
    
    if (error) throw error;
    
    if (!people || people.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: rgba(255,255,255,0.5); padding: 2rem;">
          <i class="fas fa-user-slash" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>No people found matching "${query}"</p>
        </div>
      `;
      return;
    }
    
    let html = '<div style="display: grid; gap: 0.75rem;">';
    people.forEach(person => {
      const initials = person.name ? person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
      const isRemoved = person.is_hidden || false;
      
      html += `
        <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: ${isRemoved ? 'rgba(255,107,107,0.05)' : 'rgba(0,224,255,0.05)'}; 
          border: 1px solid ${isRemoved ? 'rgba(255,107,107,0.2)' : 'rgba(0,224,255,0.2)'}; border-radius: 8px;">
          ${person.image_url ?
            `<img src="${person.image_url}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; ${isRemoved ? 'opacity: 0.6;' : ''}">` :
            `<div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); 
              display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; ${isRemoved ? 'opacity: 0.6;' : ''}">${initials}</div>`
          }
          <div style="flex: 1; min-width: 0;">
            <div style="color: white; font-weight: 600; font-size: 0.95rem; ${isRemoved ? 'opacity: 0.7;' : ''}">${person.name || 'Unnamed'}</div>
            <div style="color: #aaa; font-size: 0.85rem; ${isRemoved ? 'opacity: 0.7;' : ''}">${person.email || 'No email'}</div>
            ${isRemoved ? '<div style="color: #ff6b6b; font-size: 0.8rem; margin-top: 0.25rem; font-weight: 600;"><i class="fas fa-ban"></i> REMOVED</div>' : ''}
          </div>
          <button onclick="adminTogglePersonVisibility('${person.id}', ${!isRemoved}, '${(person.name || 'this member').replace(/'/g, "\\'")}', ${isRemoved})" 
            style="padding: 0.5rem 1rem; background: ${isRemoved ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,107,0.2)'}; 
            border: 1px solid ${isRemoved ? 'rgba(0,255,136,0.4)' : 'rgba(255,107,107,0.4)'}; 
            border-radius: 6px; color: ${isRemoved ? '#00ff88' : '#ff6b6b'}; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s;"
            onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <i class="fas fa-${isRemoved ? 'undo' : 'user-times'}"></i> ${isRemoved ? 'Reinstate' : 'Remove'}
          </button>
        </div>
      `;
    });
    html += '</div>';
    
    listEl.innerHTML = html;
    
  } catch (error) {
    console.error('Error searching people:', error);
    listEl.innerHTML = `<div style="color: #ff6b6b; padding: 1rem;"><i class="fas fa-exclamation-circle"></i> Error: ${error.message}</div>`;
  }
}

// Admin function to toggle person visibility (remove/reinstate)
async function adminTogglePersonVisibility(personId, shouldRemove, personName, currentlyRemoved) {
  console.log('🔧 adminTogglePersonVisibility called:', { personId, shouldRemove, personName, currentlyRemoved });
  
  try {
    // Show confirmation dialog for removal
    if (shouldRemove && !currentlyRemoved) {
      const confirmed = confirm(`Are you sure you want to remove "${personName}" from the community?\n\nThey will no longer be visible or searchable, but can be reinstated by an admin.`);
      if (!confirmed) {
        console.log('❌ User cancelled removal');
        return; // User cancelled
      }
    }
    
    const supabase = window.supabase;
    if (!supabase) {
      console.error('❌ Supabase not available');
      throw new Error('Supabase not available');
    }
    
    console.log('📝 Updating community record...');
    const { error } = await supabase
      .from('community')
      .update({ is_hidden: shouldRemove })
      .eq('id', personId);
    
    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log('✅ Successfully updated is_hidden to:', shouldRemove);
    
    // Show success message
    if (shouldRemove) {
      alert(`✅ ${personName} has been removed from view.\n\nThey are no longer accessible to the community but can be reinstated by an admin.`);
    } else {
      alert(`✅ ${personName} has been reinstated to the community.`);
    }
    
    // Refresh the search results
    const searchInput = document.getElementById('admin-search-people');
    if (searchInput && searchInput.value) {
      console.log('🔄 Refreshing search results...');
      await adminSearchPeople(searchInput.value);
    }
    
    // Refresh synapse if available
    if (typeof window.refreshSynapse === 'function') {
      console.log('🔄 Refreshing synapse...');
      setTimeout(() => window.refreshSynapse(), 500);
    }
    
    // Show notification
    if (typeof window.showNotification === 'function') {
      window.showNotification(
        shouldRemove ? `${personName} removed from community` : `${personName} reinstated to community`, 
        'success'
      );
    }
    
    console.log('✅ adminTogglePersonVisibility completed successfully');
    
  } catch (error) {
    console.error('❌ Error toggling visibility:', error);
    alert(`Error updating member status:\n\n${error.message}\n\nPlease check the console for details.`);
  }
}

// NOTE: Legacy admin people functions (adminAddPerson, adminSearchPeople, adminTogglePersonVisibility)
// have been replaced by the new Admin People Management system in adminPeoplePanel.js
// These functions are kept for backward compatibility but are no longer used by the admin panel

// ============================================================================
// THEME MANAGEMENT FUNCTIONS
// ============================================================================

async function loadAdminThemesList() {
  const listEl = document.getElementById('admin-themes-list');
  if (!listEl) return;

  try {
    const supabase = window.supabase;
    if (!supabase) {
      listEl.innerHTML = '<p style="color: #ff6b6b;">Supabase not available</p>';
      return;
    }

    const { data: themes, error } = await supabase
      .from('theme_circles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!themes || themes.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.6);">
          <i class="fas fa-bullseye" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
          <p>No theme circles yet. Create your first one!</p>
        </div>
      `;
      return;
    }

    // Load project counts for each theme
    for (const theme of themes) {
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('id, title, status')
        .eq('theme_id', theme.id)
        .in('status', ['active', 'in-progress', 'open']);

      if (!projError) {
        theme.assigned_projects = projects || [];
      } else {
        theme.assigned_projects = [];
      }
    }

    const now = new Date();
    const activeThemes = themes.filter(t => new Date(t.expires_at) > now && t.status === 'active');
    const expiredThemes = themes.filter(t => new Date(t.expires_at) <= now || t.status !== 'active');

    let html = '';

    if (activeThemes.length > 0) {
      html += `
        <div class="themes-section" style="margin-bottom: 2rem;">
          <h3 style="color: #00ff88; font-size: 1.1rem; margin-bottom: 1rem;">
            <i class="fas fa-check-circle"></i> Active Themes (${activeThemes.length})
          </h3>
          <div class="themes-grid" style="display: grid; gap: 1rem;">
            ${activeThemes.map(theme => renderAdminThemeCard(theme, false)).join('')}
          </div>
        </div>
      `;
    }

    if (expiredThemes.length > 0) {
      html += `
        <div class="themes-section">
          <h3 style="color: rgba(255,255,255,0.5); font-size: 1.1rem; margin-bottom: 1rem;">
            <i class="fas fa-archive"></i> Expired/Inactive (${expiredThemes.length})
          </h3>
          <div class="themes-grid" style="display: grid; gap: 1rem;">
            ${expiredThemes.map(theme => renderAdminThemeCard(theme, true)).join('')}
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    // Wire up event handlers
    wireAdminThemeCardEvents();

  } catch (error) {
    console.error('Error loading themes:', error);
    listEl.innerHTML = '<p style="color: #ff6b6b;">Error loading themes</p>';
  }
}

function renderAdminThemeCard(theme, isExpired = false) {
  const now = Date.now();
  const expires = new Date(theme.expires_at).getTime();
  const remaining = expires - now;
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const timeText = daysRemaining > 1 ? `${daysRemaining} days left` :
                   daysRemaining === 1 ? `1 day left` :
                   hoursRemaining > 0 ? `${hoursRemaining} hours left` : 'Expired';

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  return `
    <div class="admin-theme-card" data-theme-id="${theme.id}" style="
      background: ${isExpired ? 'rgba(0,0,0,0.2)' : 'rgba(0,224,255,0.05)'};
      border: 1px solid ${isExpired ? 'rgba(255,255,255,0.1)' : 'rgba(0,224,255,0.3)'};
      border-radius: 12px;
      padding: 1.25rem;
      ${isExpired ? 'opacity: 0.6;' : ''}
    ">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
        <div style="flex: 1;">
          <h4 style="color: ${isExpired ? 'rgba(255,255,255,0.5)' : '#00e0ff'}; margin: 0 0 0.5rem 0; font-size: 1.1rem;">
            ${escapeHtml(theme.title)}
          </h4>
          ${theme.description ? `
            <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
              ${escapeHtml(theme.description)}
            </p>
          ` : ''}
        </div>
        <span style="
          padding: 0.25rem 0.75rem;
          background: ${isExpired ? 'rgba(255,107,107,0.2)' : 'rgba(0,224,255,0.2)'};
          border: 1px solid ${isExpired ? 'rgba(255,107,107,0.5)' : 'rgba(0,224,255,0.5)'};
          border-radius: 12px;
          font-size: 0.75rem;
          color: ${isExpired ? '#ff6b6b' : '#00e0ff'};
          white-space: nowrap;
        ">
          ${timeText}
        </span>
      </div>

      ${theme.tags && theme.tags.length > 0 ? `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          ${theme.tags.map(tag => `
            <span style="
              padding: 0.25rem 0.5rem;
              background: rgba(0,224,255,0.1);
              border: 1px solid rgba(0,224,255,0.3);
              border-radius: 4px;
              font-size: 0.75rem;
              color: rgba(0,224,255,0.8);
            ">
              ${escapeHtml(tag)}
            </span>
          `).join('')}
        </div>
      ` : ''}

      <!-- Projects Section -->
      <div style="
        background: rgba(0,0,0,0.2);
        border-radius: 6px;
        padding: 0.75rem;
        margin-bottom: 0.75rem;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">
            <i class="fas fa-lightbulb"></i> Projects: ${theme.assigned_projects?.length || 0}
          </span>
          <button
            class="btn-manage-projects"
            data-theme-id="${theme.id}"
            style="
              padding: 0.35rem 0.75rem;
              background: rgba(0,224,255,0.1);
              border: 1px solid rgba(0,224,255,0.3);
              border-radius: 4px;
              color: #00e0ff;
              cursor: pointer;
              font-size: 0.75rem;
            "
          >
            <i class="fas fa-cog"></i> Manage
          </button>
        </div>
        ${theme.assigned_projects && theme.assigned_projects.length > 0 ? `
          <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">
            ${theme.assigned_projects.slice(0, 3).map(p => `• ${escapeHtml(p.title)}`).join('<br>')}
            ${theme.assigned_projects.length > 3 ? `<br>• ...and ${theme.assigned_projects.length - 3} more` : ''}
          </div>
        ` : `
          <div style="color: rgba(255,255,255,0.4); font-size: 0.75rem; font-style: italic;">
            No projects assigned yet
          </div>
        `}
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
        <button
          class="btn-edit-theme"
          data-theme-id="${theme.id}"
          style="
            flex: 1;
            padding: 0.5rem 1rem;
            background: rgba(0,224,255,0.1);
            border: 1px solid rgba(0,224,255,0.3);
            border-radius: 6px;
            color: #00e0ff;
            cursor: pointer;
            font-size: 0.85rem;
          "
        >
          <i class="fas fa-edit"></i> Edit
        </button>
        ${!isExpired ? `
          <button
            class="btn-extend-theme"
            data-theme-id="${theme.id}"
            style="
              flex: 1;
              padding: 0.5rem 1rem;
              background: rgba(0,255,136,0.1);
              border: 1px solid rgba(0,255,136,0.3);
              border-radius: 6px;
              color: #00ff88;
              cursor: pointer;
              font-size: 0.85rem;
            "
          >
            <i class="fas fa-clock"></i> Extend
          </button>
        ` : ''}
        <button
          class="btn-${isExpired ? 'delete' : 'archive'}-theme"
          data-theme-id="${theme.id}"
          style="
            padding: 0.5rem 1rem;
            background: rgba(255,107,107,0.1);
            border: 1px solid rgba(255,107,107,0.3);
            border-radius: 6px;
            color: #ff6b6b;
            cursor: pointer;
            font-size: 0.85rem;
          "
        >
          <i class="fas fa-${isExpired ? 'trash' : 'archive'}"></i>
        </button>
      </div>
    </div>
  `;
}

function wireAdminThemeCardEvents() {
  // Edit buttons
  document.querySelectorAll('.btn-edit-theme').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      await handleAdminEditTheme(themeId);
    });
  });

  // Extend buttons
  document.querySelectorAll('.btn-extend-theme').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      await handleAdminExtendTheme(themeId);
    });
  });

  // Archive buttons
  document.querySelectorAll('.btn-archive-theme').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      await handleAdminArchiveTheme(themeId);
    });
  });

  // Delete buttons
  document.querySelectorAll('.btn-delete-theme').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      await handleAdminDeleteTheme(themeId);
    });
  });

  // Manage projects buttons
  document.querySelectorAll('.btn-manage-projects').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      await handleAdminManageProjects(themeId);
    });
  });
}

async function handleAdminCreateTheme(form) {
  const supabase = window.supabase;
  if (!supabase) {
    alert('Supabase not available');
    return;
  }

  const formData = new FormData(form);
  const title = formData.get('title').trim();
  const description = formData.get('description').trim();
  const tagsRaw = formData.get('tags').trim();
  const duration = parseInt(formData.get('duration'), 10);
  const ctaText = formData.get('cta_text').trim();
  const ctaLink = formData.get('cta_link').trim();

  if (!title) {
    alert('Title is required');
    return;
  }

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const expiresAt = new Date(Date.now() + duration * 86400000).toISOString();

  const payload = {
    title,
    description: description || null,
    tags,
    expires_at: expiresAt,
    origin_type: 'admin',
    status: 'active',
    cta_text: ctaText || null,
    cta_link: ctaLink || null,
    activity_score: 0
  };

  try {
    const { error } = await supabase
      .from('theme_circles')
      .insert([payload]);

    if (error) throw error;

    // Show success notification
    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification('Theme circle created! ✨', 'success');
    } else {
      alert('Theme circle created successfully!');
    }

    // Clear form
    form.reset();

    // Switch to manage tab and reload
    const manageTabBtn = document.querySelector('.theme-tab-btn[data-theme-tab="manage"]');
    if (manageTabBtn) {
      manageTabBtn.click();
    }

    // Refresh synapse if available
    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to create theme:', error);
    alert(error.message || 'Failed to create theme');
  }
}

async function handleAdminEditTheme(themeId) {
  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { data: theme, error } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('id', themeId)
      .single();

    if (error) throw error;

    const title = prompt('Theme title:', theme.title);
    if (!title) return;

    const description = prompt('Description:', theme.description || '');
    const tagsRaw = prompt('Tags (comma-separated):', (theme.tags || []).join(', '));

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const { error: updateError } = await supabase
      .from('theme_circles')
      .update({ title, description: description || null, tags })
      .eq('id', themeId);

    if (updateError) throw updateError;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification('Theme updated!', 'success');
    } else {
      alert('Theme updated successfully!');
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to update theme:', error);
    alert(error.message || 'Failed to update theme');
  }
}

async function handleAdminExtendTheme(themeId) {
  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { data: theme, error } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('id', themeId)
      .single();

    if (error) throw error;

    const daysRaw = prompt('Extend by how many days?', '7');
    if (!daysRaw) return;

    const days = Math.max(1, Math.min(90, parseInt(daysRaw, 10)));
    const newExpiresAt = new Date(new Date(theme.expires_at).getTime() + days * 86400000).toISOString();

    const { error: updateError } = await supabase
      .from('theme_circles')
      .update({ expires_at: newExpiresAt })
      .eq('id', themeId);

    if (updateError) throw updateError;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification(`Extended by ${days} days! ⏰`, 'success');
    } else {
      alert(`Theme extended by ${days} days!`);
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to extend theme:', error);
    alert(error.message || 'Failed to extend theme');
  }
}

async function handleAdminArchiveTheme(themeId) {
  if (!confirm('Archive this theme? It will no longer appear in the network.')) return;

  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('theme_circles')
      .update({ status: 'archived' })
      .eq('id', themeId);

    if (error) throw error;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification('Theme archived', 'success');
    } else {
      alert('Theme archived successfully!');
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to archive theme:', error);
    alert(error.message || 'Failed to archive theme');
  }
}

async function handleAdminDeleteTheme(themeId) {
  if (!confirm('Permanently delete this theme? This cannot be undone.')) return;

  const supabase = window.supabase;
  if (!supabase) return;

  try {
    // Delete associated participants first
    await supabase
      .from('theme_participants')
      .delete()
      .eq('theme_id', themeId);

    // Delete theme
    const { error } = await supabase
      .from('theme_circles')
      .delete()
      .eq('id', themeId);

    if (error) throw error;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification('Theme deleted', 'success');
    } else {
      alert('Theme deleted successfully!');
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to delete theme:', error);
    alert(error.message || 'Failed to delete theme');
  }
}

async function handleAdminManageProjects(themeId) {
  const supabase = window.supabase;
  if (!supabase) return;

  try {
    // Get theme details
    const { data: theme, error: themeError } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('id', themeId)
      .single();

    if (themeError) throw themeError;

    // Load all active projects
    const { data: allProjects, error } = await supabase
      .from('projects')
      .select('id, title, status, theme_id')
      .in('status', ['active', 'in-progress', 'open'])
      .order('title', { ascending: true });

    if (error) throw error;

    // Separate assigned and unassigned projects
    const assignedProjects = allProjects.filter(p => p.theme_id === themeId);
    const availableProjects = allProjects.filter(p => !p.theme_id || p.theme_id !== themeId);

    // Build project list text
    let message = `Managing projects for: ${theme.title}\n\n`;
    message += `ASSIGNED PROJECTS (${assignedProjects.length}):\n`;

    if (assignedProjects.length > 0) {
      assignedProjects.forEach((p, idx) => {
        message += `${idx + 1}. ${p.title}\n`;
      });
    } else {
      message += `(none)\n`;
    }

    message += `\nAVAILABLE PROJECTS (${availableProjects.length}):\n`;
    if (availableProjects.length > 0) {
      availableProjects.slice(0, 10).forEach((p, idx) => {
        message += `${idx + 1}. ${p.title}\n`;
      });
      if (availableProjects.length > 10) {
        message += `...and ${availableProjects.length - 10} more\n`;
      }
    } else {
      message += `(all projects are assigned to themes)\n`;
    }

    message += `\nOptions:\n`;
    message += `- Type "assign <number>" to assign an available project\n`;
    message += `- Type "remove <number>" to unassign an assigned project\n`;
    message += `- Click Cancel to close\n`;

    const input = prompt(message);
    if (!input) return;

    const parts = input.trim().toLowerCase().split(' ');
    const action = parts[0];
    const num = parseInt(parts[1]);

    if (action === 'assign' && num > 0 && num <= availableProjects.length) {
      const project = availableProjects[num - 1];
      await assignProjectToTheme(project.id, themeId, project.title);
    } else if (action === 'remove' && num > 0 && num <= assignedProjects.length) {
      const project = assignedProjects[num - 1];
      await unassignProjectFromTheme(project.id, project.title);
    } else {
      alert('Invalid command. Please use "assign <number>" or "remove <number>"');
    }

  } catch (error) {
    console.error('Failed to manage projects:', error);
    alert('Failed to load projects');
  }
}

async function assignProjectToTheme(projectId, themeId, projectTitle) {
  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('projects')
      .update({ theme_id: themeId })
      .eq('id', projectId);

    if (error) throw error;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification(`✓ Assigned: ${projectTitle}`, 'success');
    } else {
      alert(`Project assigned: ${projectTitle}`);
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to assign project:', error);
    alert('Failed to assign project');
  }
}

async function unassignProjectFromTheme(projectId, projectTitle) {
  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('projects')
      .update({ theme_id: null })
      .eq('id', projectId);

    if (error) throw error;

    if (typeof window.showSynapseNotification === 'function') {
      window.showSynapseNotification(`✓ Removed: ${projectTitle}`, 'success');
    } else {
      alert(`Project removed: ${projectTitle}`);
    }

    await loadAdminThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }

  } catch (error) {
    console.error('Failed to unassign project:', error);
    alert('Failed to unassign project');
  }
}

// Keep old function name for backward compatibility
async function loadThemesList() {
  await loadAdminThemesList();
}

// ============================================================================
// END THEME MANAGEMENT FUNCTIONS
// ============================================================================

async function loadProjectsList() {
  const listEl = document.getElementById('admin-projects-list');
  if (!listEl) return;

  // Show loading state
  listEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: #00e0ff;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><br><br>Loading projects...</div>';

  try {
    const supabase = window.supabase;
    if (!supabase) {
      listEl.innerHTML = '<p style="color: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i> Supabase client not available</p>';
      return;
    }

    // Test connection first
    const { data: testData, error: testError } = await supabase
      .from('projects')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('Supabase connection test failed:', testError);
      listEl.innerHTML = `
        <div style="background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 8px; padding: 1.5rem; text-align: center;">
          <i class="fas fa-wifi" style="font-size: 2rem; color: #ff6b6b; margin-bottom: 1rem;"></i>
          <h3 style="color: #ff6b6b; margin-bottom: 0.5rem;">Database Connection Error</h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 1rem;">Unable to connect to Supabase database.</p>
          <p style="color: #888; font-size: 0.9rem;">Error: ${testError.message}</p>
          <button onclick="loadProjectsList()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; color: #ff6b6b; cursor: pointer;">
            <i class="fas fa-sync-alt"></i> Retry Connection
          </button>
        </div>
      `;
      return;
    }

    // Load projects and themes
    const [projectsResult, themesResult] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('theme_circles')
        .select('id, title, status')
        .eq('status', 'active')
        .order('title', { ascending: true })
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (themesResult.error) throw themesResult.error;

    const projects = projectsResult.data || [];
    const themes = themesResult.data || [];

    if (projects.length === 0) {
      listEl.innerHTML = '<p style="color: rgba(255,255,255,0.5);">No projects found</p>';
      return;
    }

    let html = '<div style="display: grid; gap: 1rem;">';
    projects.forEach(project => {
      const currentTheme = themes.find(t => t.id === project.theme_id);
      
      html += `
        <div style="background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${window.escapeHtml?.(project.name) || project.name || 'Untitled'}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.5rem;">
                Status: ${window.escapeHtml?.(project.status) || 'Unknown'}
                | Created: ${new Date(project.created_at).toLocaleDateString()}
              </div>
              ${project.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-bottom: 0.5rem;">${window.escapeHtml?.(project.description) || ''}</div>` : ''}
            </div>
            <button onclick="deleteProject('${project.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; padding: 0.5rem 1rem; color: #ff6b6b; font-weight: 600; cursor: pointer;">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
          
          <!-- Theme Assignment Section -->
          <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 1rem; border-left: 3px solid #00e0ff;">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
              <div style="color: #00e0ff; font-weight: 600; font-size: 0.9rem;">
                <i class="fas fa-bullseye"></i> Theme Assignment:
              </div>
              <div style="color: ${currentTheme ? '#00ff88' : 'rgba(255,255,255,0.5)'}; font-size: 0.9rem;">
                ${currentTheme ? `📍 ${window.escapeHtml?.(currentTheme.title) || currentTheme.title}` : '❌ No theme assigned'}
              </div>
            </div>
            
            <div style="display: flex; gap: 0.75rem; align-items: center;">
              <select id="theme-select-${project.id}" style="flex: 1; padding: 0.5rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; font-size: 0.9rem;">
                <option value="">Select a theme...</option>
                ${themes.map(theme => `
                  <option value="${theme.id}" ${theme.id === project.theme_id ? 'selected' : ''}>
                    ${window.escapeHtml?.(theme.title) || theme.title}
                  </option>
                `).join('')}
              </select>
              
              <button onclick="assignProjectToTheme('${project.id}')" 
                style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 4px; color: #000; font-weight: 600; cursor: pointer; font-size: 0.85rem; white-space: nowrap;">
                <i class="fas fa-link"></i> Assign
              </button>
              
              ${project.theme_id ? `
                <button onclick="removeProjectFromTheme('${project.id}')" 
                  style="padding: 0.5rem 1rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 4px; color: #ff6b6b; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
                  <i class="fas fa-unlink"></i> Remove
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    listEl.innerHTML = html;
  } catch (error) {
    console.error('Error loading projects:', error);
    listEl.innerHTML = '<p style="color: #ff6b6b;">Error loading projects</p>';
  }
}

window.openThemeCreator = function() {
  if (typeof window.openThemeAdminModal === 'function') {
    window.openThemeAdminModal();
  } else {
    // Fallback: simple prompt-based creation
    createThemePromptFlow();
  }
};

async function createThemePromptFlow() {
  const supabase = window.supabase;
  if (!supabase) {
    alert("Supabase not available");
    return;
  }

  const title = prompt("Theme title:");
  if (!title) return;

  const tagsRaw = prompt("Tags (comma-separated):", "");
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

  const days = parseInt(prompt("Expire in how many days?", "7") || "7");
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();

  const { error } = await supabase.from("theme_circles").insert([{
    title,
    tags,
    expires_at,
    origin_type: "admin",
    status: "active"
  }]);

  if (error) {
    console.error("Failed to create theme:", error);
    alert("Failed to create theme: " + error.message);
    return;
  }

  alert("Theme created successfully!");
  loadThemesList();

  if (typeof window.refreshThemeCircles === 'function') {
    await window.refreshThemeCircles();
  }
}

window.deleteTheme = async function(themeId) {
  console.log('🗑️ Delete theme called with ID:', themeId);
  
  if (!confirm("Are you sure you want to delete this theme?")) {
    console.log('🗑️ Delete cancelled by user');
    return;
  }

  const supabase = window.supabase;
  if (!supabase) {
    console.error('❌ Supabase not available');
    alert('Database connection not available');
    return;
  }

  try {
    console.log('🗑️ Attempting to delete theme:', themeId);
    
    const { error } = await supabase
      .from('theme_circles')
      .delete()
      .eq('id', themeId);

    if (error) {
      console.error('❌ Delete error:', error);
      throw error;
    }

    console.log('✅ Theme deleted successfully');
    alert("Theme deleted successfully!");
    
    // Refresh the themes list
    if (typeof loadThemesList === 'function') {
      loadThemesList();
    } else {
      console.warn('⚠️ loadThemesList not available, reloading page...');
      location.reload();
    }

    // Refresh theme circles visualization
    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }
  } catch (error) {
    console.error("❌ Error deleting theme:", error);
    alert("Failed to delete theme: " + (error.message || 'Unknown error'));
  }
};

// Test function for debugging
window.testDeleteTheme = function(themeId) {
  console.log('🧪 Testing deleteTheme function...');
  console.log('  Function available:', typeof window.deleteTheme);
  console.log('  Supabase available:', typeof window.supabase);
  console.log('  Theme ID:', themeId);
  
  if (themeId) {
    window.deleteTheme(themeId);
  } else {
    console.log('  Usage: window.testDeleteTheme(themeId)');
  }
};

window.deleteProject = async function(projectId) {
  console.log('🗑️ Delete project called with ID:', projectId);
  
  if (!confirm("Are you sure you want to delete this project?")) {
    console.log('🗑️ Delete cancelled by user');
    return;
  }

  const supabase = window.supabase;
  if (!supabase) {
    console.error('❌ Supabase not available');
    alert('Database connection not available');
    return;
  }

  try {
    console.log('🗑️ Attempting to delete project:', projectId);
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('❌ Delete error:', error);
      throw error;
    }

    console.log('✅ Project deleted successfully');
    alert("Project deleted successfully!");
    
    // Refresh the projects list
    if (typeof loadProjectsList === 'function') {
      loadProjectsList();
    } else {
      console.warn('⚠️ loadProjectsList not available, reloading page...');
      location.reload();
    }

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    alert("Failed to delete project: " + (error.message || 'Unknown error'));
  }
};

// Test function for debugging
window.testDeleteProject = function(projectId) {
  console.log('🧪 Testing deleteProject function...');
  console.log('  Function available:', typeof window.deleteProject);
  console.log('  Supabase available:', typeof window.supabase);
  console.log('  Project ID:', projectId);
  
  if (projectId) {
    window.deleteProject(projectId);
  } else {
    console.log('💡 Usage: window.testDeleteProject("project-id-here")');
  }
};

// -----------------------------
// Admin: Organizations Management
// -----------------------------
async function loadOrganizationsList() {
  const listEl = document.getElementById('admin-orgs-list');
  if (!listEl) return;

  // Show loading state
  listEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: #a855f7;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><br><br>Loading organizations...</div>';

  try {
    const supabase = window.supabase;
    if (!supabase) {
      listEl.innerHTML = '<p style="color: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i> Supabase client not available</p>';
      return;
    }

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!organizations || organizations.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
          <i class="fas fa-building" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
          <p style="color: rgba(255,255,255,0.5);">No organizations found</p>
        </div>
      `;
      return;
    }

    // Try to get member counts (may fail if table has issues)
    let memberCounts = {};
    try {
      const { data: counts } = await supabase
        .from('organization_members')
        .select('organization_id');

      if (counts) {
        counts.forEach(m => {
          memberCounts[m.organization_id] = (memberCounts[m.organization_id] || 0) + 1;
        });
      }
    } catch (e) {
      console.warn('Could not load member counts:', e);
    }

    let html = '<div style="display: grid; gap: 1rem;">';
    organizations.forEach(org => {
      const memberCount = memberCounts[org.id] || 0;
      html += `
        <div style="background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="display: flex; gap: 1rem; flex: 1;">
              <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(168,85,247,0.2); border: 2px solid rgba(168,85,247,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
                ${org.logo_url ? `<img src="${escapeHtml(org.logo_url)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : '<i class="fas fa-building" style="color: #a855f7;"></i>'}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${escapeHtml(org.name)}</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
                  ${org.industry ? `<span style="color: #a855f7;"><i class="fas fa-tag"></i> ${escapeHtml(Array.isArray(org.industry) ? org.industry.join(', ') : org.industry)}</span> | ` : ''}
                  ${org.location ? `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(org.location)} | ` : ''}
                  <i class="fas fa-users"></i> ${memberCount} member${memberCount !== 1 ? 's' : ''}
                </div>
                ${org.description ? `<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(org.description)}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
              <button onclick="window.editOrganization('${org.id}')" style="background: rgba(168,85,247,0.2); border: 1px solid rgba(168,85,247,0.4); border-radius: 6px; padding: 0.5rem 0.75rem; color: #a855f7; font-weight: 600; cursor: pointer;" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="window.deleteOrganization('${org.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; padding: 0.5rem 0.75rem; color: #ff6b6b; font-weight: 600; cursor: pointer;" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    listEl.innerHTML = html;
  } catch (error) {
    console.error('Error loading organizations:', error);
    listEl.innerHTML = '<p style="color: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i> Error loading organizations</p>';
  }
}

window.deleteOrganization = async function(orgId) {
  console.log('🗑️ Delete organization called with ID:', orgId);

  if (!confirm("Are you sure you want to delete this organization? This will also remove all member associations.")) {
    console.log('🗑️ Delete cancelled by user');
    return;
  }

  const supabase = window.supabase;
  if (!supabase) {
    console.error('❌ Supabase not available');
    alert('Database connection not available');
    return;
  }

  try {
    console.log('🗑️ Attempting to delete organization:', orgId);

    // First try to delete member associations (may fail if table doesn't exist)
    try {
      await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId);
    } catch (e) {
      console.warn('Could not delete member associations (table may not exist):', e);
    }

    // Delete the organization and return the deleted row to verify it worked
    const { data: deleted, error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId)
      .select();

    if (error) {
      console.error('❌ Delete error:', error);
      throw error;
    }

    // Check if any rows were actually deleted
    if (!deleted || deleted.length === 0) {
      console.error('❌ No rows deleted - RLS policy may be blocking');
      alert("Could not delete organization. You may not have permission to delete this organization.");
      return;
    }

    console.log('✅ Organization deleted successfully:', deleted);
    alert("Organization deleted successfully!");

    // Refresh the organizations list
    if (typeof loadOrganizationsList === 'function') {
      loadOrganizationsList();
    }

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }
  } catch (error) {
    console.error("❌ Error deleting organization:", error);
    alert("Failed to delete organization: " + (error.message || 'Unknown error'));
  }
};

window.editOrganization = async function(orgId) {
  console.log('✏️ Edit organization called with ID:', orgId);

  const supabase = window.supabase;
  if (!supabase) {
    alert('Database connection not available');
    return;
  }

  // Load current org data
  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    alert('Could not load organization data');
    return;
  }

  // Create edit modal
  const modal = document.createElement('div');
  modal.id = 'edit-org-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10010;
  `;

  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98)); border: 2px solid rgba(168,85,247,0.5); border-radius: 16px; padding: 2rem; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="color: #a855f7; margin: 0;"><i class="fas fa-edit"></i> Edit Organization</h3>
        <button onclick="document.getElementById('edit-org-modal').remove()" style="background: rgba(255,255,255,0.1); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <form id="edit-org-form">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Organization Name *</label>
          <input type="text" id="edit-org-name" value="${escapeHtml(org.name || '')}" required
            style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Description</label>
          <textarea id="edit-org-description" rows="3"
            style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;">${escapeHtml(org.description || '')}</textarea>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Industry (comma-separated)</label>
          <input type="text" id="edit-org-industry" value="${escapeHtml(Array.isArray(org.industry) ? org.industry.join(', ') : (org.industry || ''))}"
            style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;"
            placeholder="e.g., Technology, Education">
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Location</label>
          <input type="text" id="edit-org-location" value="${escapeHtml(org.location || '')}"
            style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Website</label>
          <input type="url" id="edit-org-website" value="${escapeHtml(org.website || '')}"
            style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
          <button type="submit" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            <i class="fas fa-save"></i> Save Changes
          </button>
          <button type="button" onclick="document.getElementById('edit-org-modal').remove()" style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer;">
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Handle form submission
  document.getElementById('edit-org-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get raw values
    const name = document.getElementById('edit-org-name').value.trim();
    const description = document.getElementById('edit-org-description').value.trim();
    const industryRaw = document.getElementById('edit-org-industry').value.trim();
    const location = document.getElementById('edit-org-location').value.trim();
    const website = document.getElementById('edit-org-website').value.trim();

    // Convert industry to array if it's a comma-separated string
    let industry = null;
    if (industryRaw) {
      // Check if it looks like an array already or needs to be split
      if (industryRaw.startsWith('[') || industryRaw.startsWith('{')) {
        // Try to parse as JSON array
        try {
          industry = JSON.parse(industryRaw.replace(/^\{|\}$/g, '[').replace(/\}$/, ']'));
        } catch {
          industry = industryRaw.split(',').map(s => s.trim()).filter(s => s);
        }
      } else {
        // Split by comma
        industry = industryRaw.split(',').map(s => s.trim()).filter(s => s);
      }
    }

    const updates = {
      name,
      description: description || null,
      industry: industry,
      location: location || null,
      website: website || null
    };

    if (!updates.name) {
      alert('Organization name is required');
      return;
    }

    try {
      const { data: updated, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', orgId)
        .select();

      if (error) throw error;

      // Check if any rows were actually updated
      if (!updated || updated.length === 0) {
        console.error('❌ No rows updated - RLS policy may be blocking');
        alert('Could not update organization. You may not have permission to edit this organization.');
        return;
      }

      console.log('✅ Organization updated:', updated);
      alert('Organization updated successfully!');
      modal.remove();
      loadOrganizationsList();

      // Refresh synapse view
      if (typeof window.refreshSynapseConnections === 'function') {
        window.refreshSynapseConnections();
      }
    } catch (err) {
      console.error('Error updating organization:', err);
      alert('Failed to update organization: ' + (err.message || 'Unknown error'));
    }
  });
};

console.log("✅ Dashboard Actions ready");

// -----------------------------
// Organizations Panel
// -----------------------------
function showOrganizationsPanel() {
  // Remove existing panel if present
  let panel = document.getElementById('organizations-panel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'organizations-panel';
  panel.style.cssText = `
    position: fixed;
    inset: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(168,85,247,0.5);
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 25px 70px rgba(0,0,0,0.7);
    z-index: 10003;
    backdrop-filter: blur(20px);
    overflow-y: auto;
  `;

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 2px solid rgba(168,85,247,0.3); padding-bottom: 1rem;">
      <h2 style="color: #a855f7; margin: 0; font-size: 1.75rem;">
        <i class="fas fa-building"></i> Organizations
      </h2>
      <button onclick="document.getElementById('organizations-panel').remove()"
        style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
        color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.25rem;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Tabs -->
    <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <button class="orgs-tab active-orgs-tab" data-tab="browse" style="padding: 0.75rem 1.5rem; background: rgba(168,85,247,0.1); border: none; border-bottom: 3px solid #a855f7; color: #a855f7; cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-search"></i> Browse Orgs
      </button>
      <button class="orgs-tab" data-tab="my-orgs" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-user-tag"></i> My Orgs
      </button>
      <button class="orgs-tab" data-tab="create" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-plus"></i> Create Org
      </button>
    </div>

    <!-- Tab Content -->
    <div id="orgs-tab-content" style="padding: 1rem 0;">
      <!-- Content will be loaded dynamically -->
    </div>
  `;

  document.body.appendChild(panel);

  // Wire up tabs
  panel.querySelectorAll('.orgs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.orgs-tab').forEach(t => {
        t.style.background = 'transparent';
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'rgba(255,255,255,0.6)';
        t.classList.remove('active-orgs-tab');
      });
      tab.style.background = 'rgba(168,85,247,0.1)';
      tab.style.borderBottomColor = '#a855f7';
      tab.style.color = '#a855f7';
      tab.classList.add('active-orgs-tab');

      const tabName = tab.dataset.tab;
      loadOrgsTabContent(tabName);
    });
  });

  // Load initial tab
  loadOrgsTabContent('browse');
}

async function loadOrgsTabContent(tabName) {
  const content = document.getElementById('orgs-tab-content');
  if (!content) return;

  const supabase = window.supabase;
  if (!supabase) {
    content.innerHTML = '<p style="color: #ff6b6b;">Database connection not available</p>';
    return;
  }

  if (tabName === 'browse') {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #a855f7;"></i>
        <p style="color: rgba(255,255,255,0.7); margin-top: 1rem;">Loading organizations...</p>
      </div>
    `;

    try {
      const { data: organizations, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      if (!organizations || organizations.length === 0) {
        content.innerHTML = `
          <div style="text-align: center; padding: 3rem;">
            <i class="fas fa-building" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
            <p style="color: rgba(255,255,255,0.5);">No organizations yet</p>
            <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Be the first to create one!</p>
          </div>
        `;
        return;
      }

      let html = '<div style="display: grid; gap: 1rem;">';
      for (const org of organizations) {
        html += `
          <div style="background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 12px; padding: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(168,85,247,0.2); border: 2px solid rgba(168,85,247,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
                ${org.logo_url ? `<img src="${org.logo_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : '<i class="fas fa-building" style="color: #a855f7;"></i>'}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(org.name)}</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${org.industry ? `<span style="color: #a855f7;"><i class="fas fa-tag"></i> ${escapeHtml(Array.isArray(org.industry) ? org.industry.join(', ') : org.industry)}</span>` : ''}
                  ${org.location ? `<span style="margin-left: 1rem;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(org.location)}</span>` : ''}
                </div>
                ${org.description ? `<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 0.5rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtml(org.description)}</div>` : ''}
              </div>
              <button onclick="joinOrganization('${org.id}')" style="background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; padding: 0.5rem 1rem; color: white; font-weight: 600; cursor: pointer; white-space: nowrap;">
                <i class="fas fa-plus"></i> Join
              </button>
            </div>
          </div>
        `;
      }
      html += '</div>';
      content.innerHTML = html;

    } catch (error) {
      console.error('Error loading organizations:', error);
      content.innerHTML = '<p style="color: #ff6b6b;">Error loading organizations</p>';
    }

  } else if (tabName === 'my-orgs') {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #a855f7;"></i>
        <p style="color: rgba(255,255,255,0.7); margin-top: 1rem;">Loading your organizations...</p>
      </div>
    `;

    try {
      // Get current user
      const currentUser = window.currentUserProfile;
      if (!currentUser) {
        content.innerHTML = '<p style="color: #ff6b6b;">Please log in to see your organizations</p>';
        return;
      }

      // Get user's organization memberships
      const { data: memberships, error: membershipsError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('community_id', currentUser.id);

      if (membershipsError) {
        // Handle table not exists error
        if (membershipsError.code === '42P01' || membershipsError.message?.includes('does not exist') ||
            membershipsError.code === 'PGRST116' || String(membershipsError.code) === '500') {
          content.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
              <i class="fas fa-tools" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
              <p style="color: rgba(255,255,255,0.5);">Organization membership is being set up</p>
              <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Please check back later or contact an administrator.</p>
            </div>
          `;
          return;
        }
        throw membershipsError;
      }

      if (!memberships || memberships.length === 0) {
        content.innerHTML = `
          <div style="text-align: center; padding: 3rem;">
            <i class="fas fa-user-tag" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
            <p style="color: rgba(255,255,255,0.5);">You haven't joined any organizations yet</p>
            <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Browse organizations to find ones to join!</p>
          </div>
        `;
        return;
      }

      // Get organization details
      const orgIds = memberships.map(m => m.organization_id);
      const { data: organizations, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (orgsError) throw orgsError;

      let html = '<div style="display: grid; gap: 1rem;">';
      for (const org of organizations) {
        const membership = memberships.find(m => m.organization_id === org.id);
        html += `
          <div style="background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.3); border-radius: 12px; padding: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(168,85,247,0.2); border: 2px solid rgba(168,85,247,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
                ${org.logo_url ? `<img src="${org.logo_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : '<i class="fas fa-building" style="color: #a855f7;"></i>'}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(org.name)}</div>
                <div style="color: #a855f7; font-size: 0.85rem;">
                  <i class="fas fa-user-shield"></i> ${escapeHtml(membership?.role || 'member')}
                </div>
              </div>
              <button onclick="leaveOrganization('${org.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 8px; padding: 0.5rem 1rem; color: #ff6b6b; font-weight: 600; cursor: pointer; white-space: nowrap;">
                <i class="fas fa-sign-out-alt"></i> Leave
              </button>
            </div>
          </div>
        `;
      }
      html += '</div>';
      content.innerHTML = html;

    } catch (error) {
      console.error('Error loading user organizations:', error);
      content.innerHTML = '<p style="color: #ff6b6b;">Error loading your organizations</p>';
    }

  } else if (tabName === 'create') {
    content.innerHTML = `
      <div style="max-width: 500px; margin: 0 auto;">
        <h3 style="color: #a855f7; margin-bottom: 1.5rem;"><i class="fas fa-plus-circle"></i> Create New Organization</h3>
        <form id="create-org-form">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Organization Name *</label>
            <input type="text" id="org-name" required
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Description</label>
            <textarea id="org-description" rows="3"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"></textarea>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Industry</label>
            <input type="text" id="org-industry" placeholder="e.g., Technology, Healthcare, Education"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Location</label>
            <input type="text" id="org-location" placeholder="e.g., Charleston, SC"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Website</label>
            <input type="url" id="org-website" placeholder="https://..."
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
            <button type="submit" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
              <i class="fas fa-plus"></i> Create Organization
            </button>
          </div>
        </form>
      </div>
    `;

    // Wire up form submission
    document.getElementById('create-org-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await createOrganization();
    });
  }
}

async function createOrganization() {
  const supabase = window.supabase;
  if (!supabase) {
    alert('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    alert('Please log in to create an organization');
    return;
  }

  const name = document.getElementById('org-name')?.value?.trim();
  const description = document.getElementById('org-description')?.value?.trim();
  const industryRaw = document.getElementById('org-industry')?.value?.trim();
  const industry = parseTextArray(industryRaw);
  const location = document.getElementById('org-location')?.value?.trim();
  const website = document.getElementById('org-website')?.value?.trim();

  if (!name) {
    alert('Organization name is required');
    return;
  }

  // Generate a unique slug
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Check if slug exists and make unique if needed
  const { data: existing } = await supabase
    .from('organizations')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    // Add a numeric suffix
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  try {
    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{
        name,
        slug,
        description: description || null,
        industry: industry && industry.length ? industry : null,
        location: location || null,
        website: website || null
      }])
      .select()
      .single();

    if (orgError) throw orgError;

    // Add creator as owner (this may fail if organization_members table doesn't exist)
    try {
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert([{
          organization_id: org.id,
          community_id: currentUser.id,
          role: 'owner'
        }]);

      if (memberError) {
        console.warn('Could not add owner membership (table may not exist):', memberError.message);
        // Don't fail the whole operation - org was created successfully
      }
    } catch (memberErr) {
      console.warn('Exception adding owner membership:', memberErr.message);
    }

    alert('Organization created successfully!' +
      (await checkOrgMembersTableExists(supabase) ? '' : '\n\nNote: Membership features are being set up.'));

    // Refresh the organizations list
    loadOrgsTabContent('browse');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error creating organization:', error);
    alert('Failed to create organization: ' + (error.message || 'Unknown error'));
  }
}

async function joinOrganization(orgId) {
  const supabase = window.supabase;
  if (!supabase) {
    alert('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    alert('Please log in to join an organization');
    return;
  }

  try {
    // Check if already a member
    const { data: existing, error: checkError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('community_id', currentUser.id)
      .maybeSingle();

    // Handle case where table might not exist (500 error or PGRST116)
    if (checkError) {
      console.error('Error checking membership:', checkError);
      if (checkError.code === '42P01' || checkError.message?.includes('does not exist') ||
          checkError.code === 'PGRST116' || checkError.message?.includes('relation') ||
          String(checkError.code) === '500') {
        alert('Organization membership feature is being set up. Please try again later or contact an administrator.');
        return;
      }
      // For other errors, continue to try joining
    }

    if (existing) {
      alert('You are already a member of this organization');
      return;
    }

    // Add membership
    const { error } = await supabase
      .from('organization_members')
      .insert([{
        organization_id: orgId,
        community_id: currentUser.id,
        role: 'member'
      }]);

    if (error) {
      // Handle specific error codes
      if (error.code === '42P01' || error.message?.includes('does not exist') ||
          error.code === 'PGRST116' || String(error.code) === '500') {
        alert('Organization membership feature is being set up. Please try again later or contact an administrator.');
        return;
      }
      throw error;
    }

    alert('You have joined the organization!');

    // Refresh the list
    loadOrgsTabContent('browse');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error joining organization:', error);
    alert('Failed to join organization: ' + (error.message || 'Unknown error'));
  }
}

async function leaveOrganization(orgId) {
  if (!confirm('Are you sure you want to leave this organization?')) {
    return;
  }

  const supabase = window.supabase;
  if (!supabase) {
    alert('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    alert('Please log in');
    return;
  }

  try {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('community_id', currentUser.id);

    if (error) {
      // Handle table not exists error
      if (error.code === '42P01' || error.message?.includes('does not exist') ||
          error.code === 'PGRST116' || String(error.code) === '500') {
        alert('Organization membership feature is being set up. Please try again later.');
        return;
      }
      throw error;
    }

    alert('You have left the organization');

    // Refresh the list
    loadOrgsTabContent('my-orgs');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error leaving organization:', error);
    alert('Failed to leave organization: ' + (error.message || 'Unknown error'));
  }
}

// HTML escape helper
function parseTextArray(raw) {
  // Converts comma-separated text or JSON array string into a clean text[]
  if (!raw) return null;

  // Already an array
  if (Array.isArray(raw)) {
    const cleaned = raw.map(v => String(v).trim()).filter(Boolean);
    return cleaned.length ? Array.from(new Set(cleaned)) : null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // JSON array input: ["Tech","Health"]
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const cleaned = arr.map(v => String(v).trim()).filter(Boolean);
        return cleaned.length ? Array.from(new Set(cleaned)) : null;
      }
    } catch (_) {
      // fall through to comma-split
    }
  }

  // Comma/semicolon separated: Tech, Health; Education
  const parts = s.split(/[;,]/g).map(v => v.trim()).filter(Boolean);
  return parts.length ? Array.from(new Set(parts)) : null;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper to check if organization_members table exists
async function checkOrgMembersTableExists(supabase) {
  try {
    const { error } = await supabase
      .from('organization_members')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

// Make organization functions globally available
window.showOrganizationsPanel = showOrganizationsPanel;
window.joinOrganization = joinOrganization;
window.leaveOrganization = leaveOrganization;

// Simple notification helper if not already defined
if (typeof window.showNotification !== 'function') {
  window.showNotification = function(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Use toast notification if available
    if (typeof window.showToastNotification === 'function') {
      window.showToastNotification(message, type);
    } else {
      // Fallback to alert for important messages
      if (type === 'error') {
        alert(message);
      }
    }
  };
}

// Theme assignment functions (defined here, exposed to window below)
async function assignProjectToTheme(projectId) {
  try {
    const supabase = window.supabase;
    if (!supabase) {
      console.error('Supabase not available');
      alert('Database connection not available');
      return;
    }

    const selectElement = document.getElementById(`theme-select-${projectId}`);
    const themeId = selectElement?.value;

    if (!themeId) {
      alert('Please select a theme first');
      return;
    }

    console.log(`🔗 Assigning project ${projectId} to theme ${themeId}...`);

    // Get the theme name for the confirmation message
    const selectedThemeName = selectElement.options[selectElement.selectedIndex].text;

    const { error } = await supabase
      .from('projects')
      .update({ theme_id: themeId })
      .eq('id', projectId);

    if (error) throw error;

    console.log('✅ Project assigned to theme successfully');

    // Show prominent success notification
    alert(`✅ SUCCESS!\n\nProject has been assigned to theme: ${selectedThemeName}`);

    // Refresh the projects list to show updated assignment
    loadProjectsList();

    // Refresh synapse view if available
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error assigning project to theme:', error);
    alert(`❌ ERROR\n\nFailed to assign project to theme:\n${error.message || 'Unknown error'}`);
  }
}

async function removeProjectFromTheme(projectId) {
  try {
    const supabase = window.supabase;
    if (!supabase) {
      console.error('Supabase not available');
      alert('Database connection not available');
      return;
    }

    // Confirm before removing
    if (!confirm('Are you sure you want to remove this project from its theme?')) {
      return;
    }

    console.log(`🔗 Removing project ${projectId} from theme...`);

    const { error } = await supabase
      .from('projects')
      .update({ theme_id: null })
      .eq('id', projectId);

    if (error) throw error;

    console.log('✅ Project removed from theme successfully');

    // Show prominent success notification
    alert('✅ SUCCESS!\n\nProject has been removed from its theme');

    // Refresh the projects list to show updated assignment
    loadProjectsList();

    // Refresh synapse view if available
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error removing project from theme:', error);
    alert(`❌ ERROR\n\nFailed to remove project from theme:\n${error.message || 'Unknown error'}`);
  }
}

// Make functions globally available
window.assignProjectToTheme = assignProjectToTheme;
window.removeProjectFromTheme = removeProjectFromTheme;

// Dashboard Actions initialization complete
if (window.__DASHBOARD_ACTIONS_INITIALIZED__) {
  console.log("✅ Dashboard Actions ready");
}

// Connection status checker
window.checkSupabaseStatus = async function() {
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(0,224,255,0.4);
    border-radius: 16px;
    padding: 2rem;
    z-index: 10005;
    backdrop-filter: blur(20px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    min-width: 400px;
    text-align: center;
  `;

  statusDiv.innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <i class="fas fa-stethoscope" style="font-size: 3rem; color: #00e0ff; margin-bottom: 1rem;"></i>
      <h3 style="color: #00e0ff; margin-bottom: 0.5rem;">Database Connection Status</h3>
      <p style="color: rgba(255,255,255,0.7);">Checking Supabase connection...</p>
    </div>
    <div id="status-results" style="text-align: left;">
      <div style="color: #888; margin-bottom: 0.5rem;">
        <i class="fas fa-spinner fa-spin"></i> Testing connection...
      </div>
    </div>
    <button onclick="this.parentElement.remove()" style="margin-top: 1.5rem; padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer;">
      Close
    </button>
  `;

  document.body.appendChild(statusDiv);

  const resultsDiv = statusDiv.querySelector('#status-results');
  
  try {
    // Test 1: Basic connection
    resultsDiv.innerHTML += '<div style="color: #888; margin-bottom: 0.5rem;"><i class="fas fa-spinner fa-spin"></i> Testing basic connection...</div>';
    
    const startTime = Date.now();
    const { data, error } = await window.supabase.from('community').select('count').limit(1);
    const responseTime = Date.now() - startTime;

    if (error) {
      resultsDiv.innerHTML += `<div style="color: #ff6b6b; margin-bottom: 0.5rem;"><i class="fas fa-times"></i> Connection failed: ${error.message}</div>`;
    } else {
      resultsDiv.innerHTML += `<div style="color: #00ff88; margin-bottom: 0.5rem;"><i class="fas fa-check"></i> Connection successful (${responseTime}ms)</div>`;
    }

    // Test 2: Projects table
    resultsDiv.innerHTML += '<div style="color: #888; margin-bottom: 0.5rem;"><i class="fas fa-spinner fa-spin"></i> Testing projects table...</div>';
    
    const { data: projects, error: projectsError } = await window.supabase.from('projects').select('count').limit(1);
    
    if (projectsError) {
      resultsDiv.innerHTML += `<div style="color: #ff6b6b; margin-bottom: 0.5rem;"><i class="fas fa-times"></i> Projects table error: ${projectsError.message}</div>`;
    } else {
      resultsDiv.innerHTML += `<div style="color: #00ff88; margin-bottom: 0.5rem;"><i class="fas fa-check"></i> Projects table accessible</div>`;
    }

    // Test 3: Themes table
    resultsDiv.innerHTML += '<div style="color: #888; margin-bottom: 0.5rem;"><i class="fas fa-spinner fa-spin"></i> Testing themes table...</div>';
    
    const { data: themes, error: themesError } = await window.supabase.from('theme_circles').select('count').limit(1);
    
    if (themesError) {
      resultsDiv.innerHTML += `<div style="color: #ff6b6b; margin-bottom: 0.5rem;"><i class="fas fa-times"></i> Themes table error: ${themesError.message}</div>`;
    } else {
      resultsDiv.innerHTML += `<div style="color: #00ff88; margin-bottom: 0.5rem;"><i class="fas fa-check"></i> Themes table accessible</div>`;
    }

    // Summary
    const hasErrors = error || projectsError || themesError;
    if (hasErrors) {
      resultsDiv.innerHTML += `
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 6px;">
          <div style="color: #ff6b6b; font-weight: 600; margin-bottom: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> Issues Detected</div>
          <div style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">
            The database connection has issues. This may be due to:
            <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
              <li>Network connectivity problems</li>
              <li>Supabase service outage</li>
              <li>Database configuration issues</li>
            </ul>
          </div>
        </div>
      `;
    } else {
      resultsDiv.innerHTML += `
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); border-radius: 6px;">
          <div style="color: #00ff88; font-weight: 600;"><i class="fas fa-check-circle"></i> All Systems Operational</div>
          <div style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">Database connection is working properly.</div>
        </div>
      `;
    }

  } catch (error) {
    resultsDiv.innerHTML += `<div style="color: #ff6b6b; margin-bottom: 0.5rem;"><i class="fas fa-times"></i> Unexpected error: ${error.message}</div>`;
  }
}

// Close any missing function braces
window.openAdminPanel = openAdminPanel;