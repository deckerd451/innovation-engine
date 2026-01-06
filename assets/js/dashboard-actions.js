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

// Wire up View Controls button (combines Filters + Legend)
document.getElementById('btn-view-controls')?.addEventListener('click', () => {
  toggleViewControls();
});

// -----------------------------
// Admin detection (best-effort)
// -----------------------------
function isAdminUser() {
  // Try common places your app might store role
  const role =
    window?.appState?.communityProfile?.role ||
    window?.appState?.profile?.role ||
    window?.currentUserProfile?.role ||
    window?.communityProfile?.role ||
    window?.userRole;

  if (typeof role === "string") {
    const r = role.toLowerCase();
    return r === "admin" || r === "superadmin" || r === "owner";
  }

  // If you have a boolean somewhere
  if (window?.appState?.isAdmin === true) return true;

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
        <button id="btn-create-theme"
          style="width: 100%; padding: 0.75rem; background: rgba(255,215,0,0.10);
          border: 1px solid rgba(255,215,0,0.35); border-radius: 8px; color: #ffd700;
          cursor: pointer; font-weight: 700; text-align: left;">
          <i class="fas fa-bullseye"></i> Create Theme Circle
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

    <!-- View Options Section -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem;">
        <i class="fas fa-eye"></i> View Options
      </h4>
      <button onclick="document.getElementById('btn-filters')?.click(); document.getElementById('view-controls-panel').remove();"
        style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1);
        border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff;
        cursor: pointer; font-weight: 600; text-align: left;">
        <i class="fas fa-filter"></i> Filters
      </button>
    </div>

    <!-- Legend Section -->
    <div>
      <h4 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem;">
        <i class="fas fa-info-circle"></i> Legend
      </h4>
      <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2);
        border-radius: 8px; padding: 1rem;">
        <div style="margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <div style="width: 30px; height: 30px; border-radius: 50%; background: rgba(0,224,255,0.3);
              border: 2px solid #00e0ff;"></div>
            <span style="color: #ddd; font-size: 0.9rem;">People</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <div style="width: 30px; height: 30px; transform: rotate(45deg); background: rgba(255,107,107,0.3);
              border: 2px solid #ff6b6b;"></div>
            <span style="color: #ddd; font-size: 0.9rem; margin-left: 0.25rem;">Projects</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 40px; height: 2px; background: #00e0ff;"></div>
            <span style="color: #ddd; font-size: 0.9rem;">Connections</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Wire up admin button after insert into DOM
  panel.querySelector("#btn-create-theme")?.addEventListener("click", () => {
    createThemeCirclePromptFlow();
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

console.log("✅ Dashboard Actions ready");
