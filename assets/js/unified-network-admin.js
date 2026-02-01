/**
 * Unified Network Discovery - Admin Controls
 * 
 * Provides admin UI for enabling/disabling the unified network feature
 */

// Add admin controls to the page
function addUnifiedNetworkAdminControls() {
  // Check if we're on the dashboard
  if (!document.getElementById('synapse-svg')) {
    return;
  }
  
  // Create admin panel
  const panel = document.createElement('div');
  panel.id = 'unified-network-admin-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(10, 14, 39, 0.95);
    border: 2px solid rgba(0, 224, 255, 0.5);
    border-radius: 12px;
    padding: 16px;
    z-index: 9999;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    min-width: 280px;
  `;
  
  const isEnabled = localStorage.getItem('enable-unified-network') === 'true';
  const isDebug = localStorage.getItem('unified-network-debug') === 'true';
  
  panel.innerHTML = `
    <div style="color: #00e0ff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">
      <i class="fas fa-network-wired"></i> Unified Network Discovery
    </div>
    
    <div style="margin-bottom: 12px;">
      <label style="display: flex; align-items: center; color: #fff; cursor: pointer; font-size: 13px;">
        <input type="checkbox" id="unified-network-toggle" ${isEnabled ? 'checked' : ''} 
          style="margin-right: 8px; cursor: pointer;">
        Enable Unified Network
      </label>
    </div>
    
    <div style="margin-bottom: 12px;">
      <label style="display: flex; align-items: center; color: #fff; cursor: pointer; font-size: 13px;">
        <input type="checkbox" id="unified-network-debug-toggle" ${isDebug ? 'checked' : ''} 
          style="margin-right: 8px; cursor: pointer;">
        Debug Mode
      </label>
    </div>
    
    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
      Status: <span id="unified-network-status" style="color: ${isEnabled ? '#44ff44' : '#ff4444'};">
        ${isEnabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
    
    <button id="unified-network-reload" style="
      width: 100%;
      margin-top: 12px;
      padding: 8px;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      border: none;
      border-radius: 6px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    ">
      <i class="fas fa-sync-alt"></i> Reload Page
    </button>
    
    <button id="unified-network-test" style="
      width: 100%;
      margin-top: 8px;
      padding: 8px;
      background: rgba(68, 136, 255, 0.2);
      border: 1px solid rgba(68, 136, 255, 0.5);
      border-radius: 6px;
      color: #4488ff;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    ">
      <i class="fas fa-vial"></i> Run Integration Test
    </button>
    
    <button id="unified-network-close" style="
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
    ">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(panel);
  
  // Setup event listeners
  const toggle = document.getElementById('unified-network-toggle');
  const debugToggle = document.getElementById('unified-network-debug-toggle');
  const reloadBtn = document.getElementById('unified-network-reload');
  const testBtn = document.getElementById('unified-network-test');
  const closeBtn = document.getElementById('unified-network-close');
  const status = document.getElementById('unified-network-status');
  
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      localStorage.setItem('enable-unified-network', 'true');
      status.textContent = 'Enabled (reload required)';
      status.style.color = '#ffaa00';
    } else {
      localStorage.removeItem('enable-unified-network');
      status.textContent = 'Disabled (reload required)';
      status.style.color = '#ffaa00';
    }
  });
  
  debugToggle.addEventListener('change', () => {
    if (debugToggle.checked) {
      localStorage.setItem('unified-network-debug', 'true');
    } else {
      localStorage.removeItem('unified-network-debug');
    }
  });
  
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });
  
  testBtn.addEventListener('click', async () => {
    if (window.runUnifiedNetworkIntegrationTest) {
      console.log('🧪 Running integration test...');
      await window.runUnifiedNetworkIntegrationTest();
    } else {
      console.error('❌ Integration test not available');
    }
  });
  
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });
  
  // Add keyboard shortcut to toggle panel
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + U: Toggle admin panel
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'U') {
      e.preventDefault();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });
  
  console.log('🎛️ Unified Network admin controls added (Ctrl+Shift+U to toggle)');
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addUnifiedNetworkAdminControls);
} else {
  addUnifiedNetworkAdminControls();
}

// Export for global access
if (typeof window !== 'undefined') {
  window.unifiedNetworkAdmin = {
    show: () => {
      const panel = document.getElementById('unified-network-admin-panel');
      if (panel) panel.style.display = 'block';
    },
    hide: () => {
      const panel = document.getElementById('unified-network-admin-panel');
      if (panel) panel.style.display = 'none';
    }
  };
}
