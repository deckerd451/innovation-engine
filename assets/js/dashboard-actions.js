// ================================================================
// Dashboard Actions - Wire up consolidated bottom bar
// ================================================================

// Prevent duplicate initialization
if (window.__DASHBOARD_ACTIONS_INITIALIZED__) {
  console.log("⚠️ Dashboard Actions already initialized, skipping...");
} else {
  window.__DASHBOARD_ACTIONS_INITIALIZED__ = true;
  console.log("%c🎮 Dashboard Actions Loading", "color:#0ff; font-weight:bold;");
}

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

// Wire up Admin button
// Per yellow instructions: Admin button shows full community view AND allows theme/project management
document.getElementById('btn-admin')?.addEventListener('click', () => {
  openAdminPanel();
});

// Wire up View Controls button (backward compatibility if it exists)
document.getElementById('btn-view-controls')?.addEventListener('click', () => {
  toggleViewControls();
});

// Wire up Bottom Bar Toggle
document.getElementById('bottom-bar-toggle')?.addEventListener('click', () => {
  toggleBottomBar();
});

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

  console.log('⚠️ Admin check failed - no admin credentials found');
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

// -----------------------------
// Legend on Synapse Screen (Collapsible)
// -----------------------------
let legendCollapsed = false;

function createSynapseLegend() {
  // Remove existing legend if present
  const existingLegend = document.getElementById('synapse-legend-overlay');
  if (existingLegend) return; // Already exists

  const legend = document.createElement('div');
  legend.id = 'synapse-legend-overlay';
  legend.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(26,26,46,0.95));
    border: 2px solid rgba(0,224,255,0.3);
    border-radius: 12px;
    padding: 1rem;
    z-index: 100;
    backdrop-filter: blur(10px);
    min-width: 200px;
    max-width: 250px;
    transition: all 0.3s ease;
  `;

  // Check if user is admin for analytics button
  const showAnalytics = isAdminUser();

  legend.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;" id="legend-header">
      <h4 style="color: #00e0ff; font-size: 0.9rem; margin: 0; font-weight: 700; cursor: pointer; flex: 1;" id="legend-title">
        <i class="fas fa-filter"></i> Filter View
      </h4>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button id="legend-refresh-btn" style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer; padding: 0.35rem 0.5rem; font-size: 0.75rem; transition: all 0.2s;" title="Refresh Network">
          <i class="fas fa-sync-alt" id="refresh-icon"></i>
        </button>
        <i class="fas fa-chevron-up" id="legend-toggle-icon" style="color: #00e0ff; font-size: 0.8rem; transition: transform 0.3s; cursor: pointer;"></i>
      </div>
    </div>

    <div id="legend-content" style="transition: all 0.3s ease; overflow: hidden;">
      ${showAnalytics ? `
        <button id="legend-analytics-btn" style="width: 100%; padding: 0.65rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; margin-bottom: 0.75rem; box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3); transition: all 0.2s; font-size: 0.85rem;">
          <i class="fas fa-chart-line"></i> Analytics
        </button>
      ` : ''}

      <div id="legend-people" data-filter="people" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3);">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(0,224,255,0.3); border: 2px solid #00e0ff; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600;">People</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
      </div>
      <div id="legend-projects" data-filter="projects" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3);">
        <div style="width: 24px; height: 24px; transform: rotate(45deg); background: rgba(0,255,136,0.3); border: 2px solid #00ff88; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600; margin-left: 0.25rem;">Projects</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
      </div>
      <div id="legend-themes" data-filter="themes" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(255,170,0,0.1); border: 1px solid rgba(255,170,0,0.3);">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: transparent; border: 3px solid #ffa500; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600;">Themes</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
      </div>
      <div id="legend-connections" data-filter="connections" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2);">
        <div style="width: 30px; height: 2px; background: #00e0ff; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600;">Connections</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
      </div>

      <!-- Discovery Mode Toggle -->
      <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button id="toggle-discovery-btn" style="
          width: 100%;
          padding: 0.75rem;
          background: linear-gradient(135deg, #00ff88, #00e0ff);
          border: none;
          border-radius: 8px;
          color: #000;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0,255,136,0.3);
        ">
          <i class="fas fa-globe"></i> <span id="discovery-btn-text">Discovery Mode</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(legend);

  // Wire up collapse/expand
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

  legendTitle.addEventListener('click', toggleCollapse);
  toggleIcon.addEventListener('click', toggleCollapse);

  // Wire up analytics button
  const analyticsBtn = document.getElementById('legend-analytics-btn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      if (typeof window.openAnalyticsModal === 'function') {
        window.openAnalyticsModal();
      }
    });
    analyticsBtn.addEventListener('mouseenter', () => {
      analyticsBtn.style.transform = 'translateY(-2px)';
      analyticsBtn.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.5)';
    });
    analyticsBtn.addEventListener('mouseleave', () => {
      analyticsBtn.style.transform = 'translateY(0)';
      analyticsBtn.style.boxShadow = '0 2px 8px rgba(255, 107, 107, 0.3)';
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

  // Track filter state
  const filterState = {
    people: true,
    projects: true,
    themes: true,
    connections: true
  };

  // Add click handlers for each filter
  ['people', 'projects', 'themes', 'connections'].forEach(filterType => {
    const element = document.getElementById(`legend-${filterType}`);
    if (!element) return;

    element.addEventListener('click', () => {
      filterState[filterType] = !filterState[filterType];

      // Update visual state
      const checkIcon = element.querySelector('.fa-check');
      if (filterState[filterType]) {
        checkIcon.style.display = 'block';
        element.style.opacity = '1';
      } else {
        checkIcon.style.display = 'none';
        element.style.opacity = '0.4';
      }

      // Apply filter to synapse visualization
      applyVisualizationFilters(filterState);
    });
  });

  // Wire up discovery mode toggle button
  const discoveryBtn = document.getElementById('toggle-discovery-btn');
  const discoveryBtnText = document.getElementById('discovery-btn-text');
  
  if (discoveryBtn && discoveryBtnText) {
    console.log('🔍 Wiring up discovery mode toggle button');
    
    // Update button text based on current mode
    const updateDiscoveryButton = () => {
      const currentMode = window.synapseShowFullCommunity || false;
      console.log('🔍 Updating discovery button, current mode:', currentMode);
      
      if (currentMode) {
        discoveryBtnText.textContent = 'My Network';
        discoveryBtn.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8c8c)';
        discoveryBtn.title = 'Switch to filtered view (only your connections)';
      } else {
        discoveryBtnText.textContent = 'Discovery Mode';
        discoveryBtn.style.background = 'linear-gradient(135deg, #00ff88, #00e0ff)';
        discoveryBtn.title = 'Show all people and projects in the community';
      }
    };

    // Expose update function globally so synapse can call it
    window.updateDiscoveryButtonState = updateDiscoveryButton;

    // Initial state - check after a delay to let synapse initialize
    setTimeout(() => {
      updateDiscoveryButton();
      console.log('🔍 Initial discovery button state set');
    }, 1000);

    // Click handler
    discoveryBtn.addEventListener('click', async () => {
      console.log('🔍 Discovery button clicked');
      console.log('🔍 Current state BEFORE toggle:', window.synapseShowFullCommunity);
      console.log('🔍 toggleFullCommunityView available:', typeof window.toggleFullCommunityView);
      
      if (typeof window.toggleFullCommunityView === 'function') {
        try {
          // Toggle the mode
          console.log('🔍 Calling toggleFullCommunityView...');
          await window.toggleFullCommunityView();
          console.log('🔍 Toggle complete, new mode:', window.synapseShowFullCommunity);
          
          // Update button appearance (will be called by synapse too, but ensure it happens)
          updateDiscoveryButton();
          
          // Show notification
          if (typeof window.showNotification === 'function') {
            const mode = window.synapseShowFullCommunity ? 'Discovery Mode' : 'My Network';
            window.showNotification(`Switched to ${mode}`, 'success');
          }
        } catch (error) {
          console.error('❌ Error toggling discovery mode:', error);
        }
      } else {
        console.warn('⚠️ toggleFullCommunityView not available');
        alert('Discovery mode toggle not available yet. Please wait for synapse to initialize.');
      }
    });

    // Hover effects
    discoveryBtn.addEventListener('mouseenter', () => {
      discoveryBtn.style.transform = 'translateY(-2px)';
      discoveryBtn.style.boxShadow = '0 4px 12px rgba(0,255,136,0.5)';
    });

    discoveryBtn.addEventListener('mouseleave', () => {
      discoveryBtn.style.transform = 'translateY(0)';
      discoveryBtn.style.boxShadow = '0 2px 8px rgba(0,255,136,0.3)';
    });
    
    console.log('✅ Discovery button wired up successfully');
  } else {
    console.warn('⚠️ Discovery button elements not found:', { discoveryBtn, discoveryBtnText });
  }
}

// Apply filters to the synapse visualization
function applyVisualizationFilters(filterState) {
  // Try to call the synapse filtering function if it exists
  if (typeof window.filterSynapseNodes === 'function') {
    window.filterSynapseNodes(filterState);
    return;
  }

  // Use D3 to filter nodes and links properly
  if (window.d3) {
    const svg = window.d3.select('#synapse-svg');

    // Filter nodes based on their data type
    // Nodes have class "synapse-node" and we filter by d.type
    svg.selectAll('.synapse-node')
      .style('opacity', d => {
        if (d.type === 'person' && !filterState.people) return 0;
        if (d.type === 'project' && !filterState.projects) return 0;
        return 1;
      })
      .style('pointer-events', d => {
        if (d.type === 'person' && !filterState.people) return 'none';
        if (d.type === 'project' && !filterState.projects) return 'none';
        return 'all';
      });

    // Filter theme circles separately (use correct class name)
    svg.selectAll('.theme-container')
      .style('opacity', d => {
        if (!filterState.themes) return 0.2;
        return 1;
      })
      .style('pointer-events', d => {
        if (!filterState.themes) return 'none';
        return 'all';
      });

    // Also filter theme labels
    svg.selectAll('.theme-labels')
      .style('opacity', d => {
        if (!filterState.themes) return 0;
        return 1;
      });

    // Filter connections/links
    svg.selectAll('.links line')
      .style('opacity', d => {
        if (!filterState.connections) return 0;

        // If filtering people/projects, also filter links involving them
        const sourceType = typeof d.source === 'object' ? d.source.type : null;
        const targetType = typeof d.target === 'object' ? d.target.type : null;

        if (sourceType === 'person' && !filterState.people) return 0;
        if (targetType === 'person' && !filterState.people) return 0;
        if (sourceType === 'project' && !filterState.projects) return 0;
        if (targetType === 'project' && !filterState.projects) return 0;

        return d.status === 'suggested' ? 0.5 : 0.8;
      });

    console.log('🔍 D3 Filters applied:', filterState);
  } else {
    console.warn('⚠️ D3 not available for filtering');
  }
}

// Initialize legend when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for synapse to load
  setTimeout(createSynapseLegend, 1000);
});

// Also create legend when profile is loaded
window.addEventListener('profile-loaded', () => {
  // Prevent duplicate legend creation
  if (window.__LEGEND_PROFILE_LISTENER_ADDED__) return;
  window.__LEGEND_PROFILE_LISTENER_ADDED__ = true;
  
  setTimeout(createSynapseLegend, 500);

  // Show admin button if user is admin
  if (isAdminUser()) {
    const adminBtn = document.getElementById('btn-admin');
    if (adminBtn) {
      adminBtn.style.display = 'flex';
      console.log('👑 Admin button shown');
    }
  }
});

// -----------------------------
// Bottom Bar Collapse/Expand
// -----------------------------
let bottomBarCollapsed = false;

function toggleBottomBar() {
  const bottomBar = document.getElementById('bottom-stats-bar');
  const toggleBtn = document.getElementById('bottom-bar-toggle');
  const toggleIcon = toggleBtn?.querySelector('i');

  if (!bottomBar || !toggleBtn) return;

  bottomBarCollapsed = !bottomBarCollapsed;

  if (bottomBarCollapsed) {
    // Collapse the bar - slide down out of view
    bottomBar.style.transform = 'translateY(100%)';
    bottomBar.style.opacity = '0';
    toggleBtn.style.bottom = '8px';
    toggleBtn.style.borderRadius = '8px 8px 0 0';
    if (toggleIcon) {
      toggleIcon.className = 'fas fa-chevron-up';
    }
    console.log('📉 Bottom bar collapsed');
  } else {
    // Expand the bar - slide up into view
    bottomBar.style.transform = 'translateY(0)';
    bottomBar.style.opacity = '1';
    toggleBtn.style.bottom = '90px';
    toggleBtn.style.borderRadius = '8px 8px 0 0';
    if (toggleIcon) {
      toggleIcon.className = 'fas fa-chevron-down';
    }
    console.log('📈 Bottom bar expanded');
  }
}

// Make toggleBottomBar available globally
window.toggleBottomBar = toggleBottomBar;

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
    <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <button class="admin-tab active-admin-tab" data-tab="view" style="padding: 0.75rem 1.5rem; background: rgba(0,224,255,0.1); border: none; border-bottom: 3px solid #00e0ff; color: #00e0ff; cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-eye"></i> View Community
      </button>
      <button class="admin-tab" data-tab="themes" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-bullseye"></i> Manage Themes
      </button>
      <button class="admin-tab" data-tab="projects" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-rocket"></i> Manage Projects
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
    });
  });

  // Load initial tab
  loadAdminTabContent('view');
}

function loadAdminTabContent(tabName) {
  const content = document.getElementById('admin-tab-content');
  if (!content) return;

  if (tabName === 'view') {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <div style="font-size: 3rem; color: #00e0ff; margin-bottom: 1rem;">
          <i class="fas fa-globe"></i>
        </div>
        <h3 style="color: #fff; font-size: 1.5rem; margin-bottom: 1rem;">View Full Community</h3>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 2rem;">Toggle to see all users, projects, and themes in the network (not just your connections).</p>
        <button id="admin-toggle-view-btn" style="padding: 1rem 2rem; background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 10px; color: #000; font-weight: 700; cursor: pointer; font-size: 1.1rem; transition: all 0.2s; box-shadow: 0 4px 15px rgba(0,255,136,0.3);">
          <i class="fas fa-eye"></i> Show Full Community
        </button>
      </div>
    `;

    document.getElementById('admin-toggle-view-btn')?.addEventListener('click', () => {
      if (typeof window.toggleFullCommunityView === 'function') {
        window.toggleFullCommunityView(true);
        document.getElementById('admin-panel')?.remove();
        if (typeof window.showNotification === 'function') {
          window.showNotification('Showing full community view', 'success');
        }
      }
    });
  } else if (tabName === 'themes') {
    content.innerHTML = `
      <div style="margin-bottom: 2rem;">
        <button onclick="openThemeCreator()" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 8px; color: #000; font-weight: 600; cursor: pointer;">
          <i class="fas fa-plus"></i> Create New Theme
        </button>
      </div>
      <div id="admin-themes-list" style="color: rgba(255,255,255,0.7);">
        Loading themes...
      </div>
    `;
    loadThemesList();
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
  }
}

async function loadThemesList() {
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
      listEl.innerHTML = '<p style="color: rgba(255,255,255,0.5);">No themes found</p>';
      return;
    }

    let html = '<div style="display: grid; gap: 1rem;">';
    themes.forEach(theme => {
      const isActive = theme.status === 'active';
      const isExpired = new Date(theme.expires_at) < new Date();
      html += `
        <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${theme.title}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
                Status: <span style="color: ${isActive && !isExpired ? '#00ff88' : '#ff6b6b'}">${isActive && !isExpired ? 'Active' : 'Inactive/Expired'}</span>
                | Expires: ${new Date(theme.expires_at).toLocaleDateString()}
                | Activity Score: ${theme.activity_score || 0}
              </div>
            </div>
            <button onclick="deleteTheme('${theme.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; padding: 0.5rem 1rem; color: #ff6b6b; font-weight: 600; cursor: pointer;">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    listEl.innerHTML = html;
  } catch (error) {
    console.error('Error loading themes:', error);
    listEl.innerHTML = '<p style="color: #ff6b6b;">Error loading themes</p>';
  }
}

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
              <div style="color: #fff; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">${project.title}</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.5rem;">
                Status: ${project.status || 'Unknown'}
                | Created: ${new Date(project.created_at).toLocaleDateString()}
              </div>
              ${project.description ? `<div style="color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-bottom: 0.5rem;">${project.description}</div>` : ''}
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
                ${currentTheme ? `📍 ${currentTheme.title}` : '❌ No theme assigned'}
              </div>
            </div>
            
            <div style="display: flex; gap: 0.75rem; align-items: center;">
              <select id="theme-select-${project.id}" style="flex: 1; padding: 0.5rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; font-size: 0.9rem;">
                <option value="">Select a theme...</option>
                ${themes.map(theme => `
                  <option value="${theme.id}" ${theme.id === project.theme_id ? 'selected' : ''}>
                    ${theme.title}
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
  if (!confirm("Are you sure you want to delete this theme?")) return;

  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('theme_circles')
      .delete()
      .eq('id', themeId);

    if (error) throw error;

    alert("Theme deleted successfully!");
    loadThemesList();

    if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
    }
  } catch (error) {
    console.error("Error deleting theme:", error);
    alert("Failed to delete theme");
  }
};

window.deleteProject = async function(projectId) {
  if (!confirm("Are you sure you want to delete this project?")) return;

  const supabase = window.supabase;
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;

    alert("Project deleted successfully!");
    loadProjectsList();

    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }
  } catch (error) {
    console.error("Error deleting project:", error);
    alert("Failed to delete project");
  }
};

console.log("✅ Dashboard Actions ready");

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

// Make theme assignment functions globally available
window.assignProjectToTheme = assignProjectToTheme;
window.removeProjectFromTheme = removeProjectFromTheme;

// Theme assignment functions
async function assignProjectToTheme(projectId) {
  try {
    const supabase = window.supabase;
    if (!supabase) {
      console.error('Supabase not available');
      return;
    }

    const selectElement = document.getElementById(`theme-select-${projectId}`);
    const themeId = selectElement?.value;

    if (!themeId) {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Please select a theme first', 'error');
      }
      return;
    }

    console.log(`🔗 Assigning project ${projectId} to theme ${themeId}...`);

    const { error } = await supabase
      .from('projects')
      .update({ theme_id: themeId })
      .eq('id', projectId);

    if (error) throw error;

    console.log('✅ Project assigned to theme successfully');
    
    if (typeof window.showNotification === 'function') {
      window.showNotification('Project assigned to theme successfully!', 'success');
    }

    // Refresh the projects list to show updated assignment
    loadProjectsList();

    // Refresh synapse view if available
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error assigning project to theme:', error);
    if (typeof window.showNotification === 'function') {
      window.showNotification('Failed to assign project to theme', 'error');
    }
  }
}

async function removeProjectFromTheme(projectId) {
  try {
    const supabase = window.supabase;
    if (!supabase) {
      console.error('Supabase not available');
      return;
    }

    console.log(`🔗 Removing project ${projectId} from theme...`);

    const { error } = await supabase
      .from('projects')
      .update({ theme_id: null })
      .eq('id', projectId);

    if (error) throw error;

    console.log('✅ Project removed from theme successfully');
    
    if (typeof window.showNotification === 'function') {
      window.showNotification('Project removed from theme successfully!', 'success');
    }

    // Refresh the projects list to show updated assignment
    loadProjectsList();

    // Refresh synapse view if available
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error removing project from theme:', error);
    if (typeof window.showNotification === 'function') {
      window.showNotification('Failed to remove project from theme', 'error');
    }
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
};