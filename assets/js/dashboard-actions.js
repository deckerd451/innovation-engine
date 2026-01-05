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
  const messagesTab = document.querySelector('[data-tab="messages"]');
  if (messagesTab) {
    messagesTab.click();
  } else {
    console.warn('Messages tab not found');
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
        <i class="fas fa-sliders-h"></i> View Controls
      </h3>
      <button onclick="document.getElementById('view-controls-panel').remove()"
        style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
        color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Filters Section -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem;">
        <i class="fas fa-filter"></i> Filters
      </h4>
      <button onclick="document.getElementById('btn-filters')?.click(); document.getElementById('view-controls-panel').remove();"
        style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.1);
        border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff;
        cursor: pointer; font-weight: 600;">
        <i class="fas fa-filter"></i> Open Filters
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

// Make sendMessage available globally for profile cards
window.sendMessage = async function(userId) {
  try {
    // Close the node panel
    if (typeof closeNodePanel === 'function') {
      closeNodePanel();
    }

    // Switch to messages tab
    const messagesTab = document.querySelector('[data-tab="messages"]');
    if (messagesTab) {
      messagesTab.click();
    }

    // Wait for messaging module to initialize
    await new Promise(resolve => setTimeout(resolve, 300));

    // Start conversation with this user
    if (window.MessagingModule && typeof window.MessagingModule.startConversation === 'function') {
      await window.MessagingModule.startConversation(userId);
      console.log('Started conversation with user:', userId);
    } else {
      console.error('Messaging module not available');
      alert('Messaging feature is loading. Please try again in a moment.');
    }
  } catch (error) {
    console.error('Error starting conversation:', error);
    alert('Failed to start conversation. Please try again.');
  }
};

console.log("✅ Dashboard Actions ready");
