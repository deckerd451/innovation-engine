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
  // Open messages modal
  const messagesModal = document.getElementById('messages-modal');
  if (messagesModal) {
    messagesModal.classList.add('active');
    // Initialize messaging if needed
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
