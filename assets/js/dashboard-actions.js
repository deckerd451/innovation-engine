// ================================================================
// Dashboard Actions - Wire up consolidated bottom bar
// ================================================================

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
document.getElementById('btn-admin')?.addEventListener('click', () => {
  if (typeof openThemeAdminModal === 'function') {
    openThemeAdminModal();
  } else {
    console.warn('Admin modal not available');
  }
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
      <div id="legend-projects" data-filter="projects" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3);">
        <div style="width: 24px; height: 24px; transform: rotate(45deg); background: rgba(255,107,107,0.3); border: 2px solid #ff6b6b; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600; margin-left: 0.25rem;">Projects</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
      </div>
      <div id="legend-connections" data-filter="connections" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2);">
        <div style="width: 30px; height: 2px; background: #00e0ff; flex-shrink: 0;"></div>
        <span style="color: #fff; font-size: 0.85rem; font-weight: 600;">Connections</span>
        <i class="fas fa-check" style="margin-left: auto; color: #00ff88; font-size: 0.9rem;"></i>
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
    connections: true
  };

  // Add click handlers for each filter
  ['people', 'projects', 'connections'].forEach(filterType => {
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

    // Filter theme circles separately
    svg.selectAll('.theme-circle')
      .style('opacity', 1)  // Always show themes
      .style('pointer-events', 'all');

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

console.log("✅ Dashboard Actions ready");
