/**
 * BLE Passive Networking UI
 * 
 * Provides UI controls for BLE Event Mode and Suggested Connections
 */

(() => {
  'use strict';

  const GUARD = '__CH_BLE_UI_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ BLE UI already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // STATE
  // ============================================================================

  let isInitialized = false;
  let eventModeButton = null;
  let suggestionsButton = null;
  let statusIndicator = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize BLE UI
   */
  function initialize() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('🎨 [BLE UI] Initializing...');

    // Create UI elements
    createEventModeButton();
    createSuggestionsButton();
    createStatusIndicator();
    createEventModeGravityButton(); // NEW: Desktop Event Mode Gravity toggle

    // Listen for state changes
    window.addEventListener('ble-state-changed', handleStateChange);
    window.addEventListener('event-mode-changed', handleEventModeChange); // NEW

    // Check if BLE is available
    if (!window.BLEPassiveNetworking?.isBluetoothAvailable()) {
      showBluetoothUnavailableMessage();
    }

    console.log('✅ [BLE UI] Initialized');
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  /**
   * Create Event Mode button (desktop only)
   */
  function createEventModeButton() {
    // Skip on mobile - handled by mobile-nav.js
    if (window.innerWidth < 1024) return;

    // Add button next to refresh network button
    const refreshBtn = document.getElementById('btn-refresh-network');
    if (!refreshBtn || !refreshBtn.parentElement) return;

    eventModeButton = document.createElement('div');
    eventModeButton.id = 'btn-event-mode';
    eventModeButton.setAttribute('role', 'button');
    eventModeButton.setAttribute('tabindex', '0');
    eventModeButton.setAttribute('title', 'Toggle Event Mode (BLE scanning)');
    eventModeButton.setAttribute('aria-label', 'Toggle Event Mode');
    
    eventModeButton.style.cssText = `
      cursor: pointer;
      padding: 0.75rem;
      background: rgba(0,255,136,0.1);
      border: 1px solid rgba(0,255,136,0.3);
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: all 0.2s;
    `;

    eventModeButton.innerHTML = `
      <i class="fas fa-broadcast-tower" style="color:#00ff88; font-size:1.2rem;"></i>
    `;

    eventModeButton.addEventListener('click', toggleEventMode);
    eventModeButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleEventMode();
      }
    });

    // Insert before refresh button
    refreshBtn.parentElement.insertBefore(eventModeButton, refreshBtn);

    console.log('✅ [BLE UI] Event Mode button created');
  }

  /**
   * Create Suggestions button (desktop only)
   */
  function createSuggestionsButton() {
    // Skip on mobile - handled by mobile-nav.js
    if (window.innerWidth < 1024) return;

    // Add button next to Event Mode button
    if (!eventModeButton || !eventModeButton.parentElement) return;

    suggestionsButton = document.createElement('div');
    suggestionsButton.id = 'btn-ble-suggestions';
    suggestionsButton.setAttribute('role', 'button');
    suggestionsButton.setAttribute('tabindex', '0');
    suggestionsButton.setAttribute('title', 'View suggested connections');
    suggestionsButton.setAttribute('aria-label', 'View suggested connections');
    
    suggestionsButton.style.cssText = `
      cursor: pointer;
      padding: 0.75rem;
      background: rgba(138,43,226,0.1);
      border: 1px solid rgba(138,43,226,0.3);
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: all 0.2s;
    `;

    suggestionsButton.innerHTML = `
      <i class="fas fa-user-friends" style="color:#8a2be2; font-size:1.2rem;"></i>
      <span id="ble-suggestions-badge" style="
        position: absolute;
        top: -5px;
        right: -5px;
        background: #8a2be2;
        color: #fff;
        font-size: 0.7rem;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 18px;
        text-align: center;
        display: none;
      ">0</span>
    `;

    suggestionsButton.addEventListener('click', showSuggestionsModal);
    suggestionsButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSuggestionsModal();
      }
    });

    // Insert after Event Mode button
    eventModeButton.parentElement.insertBefore(suggestionsButton, eventModeButton.nextSibling);

    console.log('✅ [BLE UI] Suggestions button created');

    // Load initial count
    updateSuggestionsCount();
  }

  /**
   * Create status indicator
   */
  function createStatusIndicator() {
    // Add status indicator to bottom of screen
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'ble-status-indicator';
    statusIndicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10,14,39,0.95);
      border: 2px solid rgba(0,255,136,0.4);
      border-radius: 12px;
      padding: 0.75rem 1.5rem;
      display: none;
      align-items: center;
      gap: 0.75rem;
      z-index: 1000;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0,255,136,0.3);
    `;

    statusIndicator.innerHTML = `
      <i class="fas fa-broadcast-tower" style="color:#00ff88; font-size:1.2rem;"></i>
      <div>
        <div style="color:#fff; font-weight:600; font-size:0.9rem;">Event Mode Active</div>
        <div id="ble-closest-beacon" style="color:#aaa; font-size:0.8rem;">Scanning for beacons...</div>
      </div>
    `;

    document.body.appendChild(statusIndicator);

    console.log('✅ [BLE UI] Status indicator created');
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Toggle Event Mode
   */
  async function toggleEventMode() {
    if (!window.BLEPassiveNetworking) {
      alert('BLE Passive Networking not available');
      return;
    }

    const isScanning = window.BLEPassiveNetworking.isScanning();

    if (isScanning) {
      window.BLEPassiveNetworking.stopEventMode();
    } else {
      // Show privacy notice first time
      if (!localStorage.getItem('ble_privacy_accepted')) {
        const accepted = await showPrivacyNotice();
        if (!accepted) return;
        localStorage.setItem('ble_privacy_accepted', 'true');
      }

      await window.BLEPassiveNetworking.startEventMode();
    }
  }

  /**
   * Handle state change
   */
  function handleStateChange(event) {
    const { isScanning, closestBeacon } = event.detail;

    // Update button style
    if (eventModeButton) {
      if (isScanning) {
        eventModeButton.style.background = 'rgba(0,255,136,0.2)';
        eventModeButton.style.borderColor = 'rgba(0,255,136,0.6)';
        eventModeButton.querySelector('i').style.animation = 'pulse 2s infinite';
      } else {
        eventModeButton.style.background = 'rgba(0,255,136,0.1)';
        eventModeButton.style.borderColor = 'rgba(0,255,136,0.3)';
        eventModeButton.querySelector('i').style.animation = 'none';
      }
    }

    // Update status indicator
    if (statusIndicator) {
      if (isScanning) {
        statusIndicator.style.display = 'flex';
        
        const beaconText = document.getElementById('ble-closest-beacon');
        if (beaconText) {
          if (closestBeacon) {
            const energyPercent = Math.round(closestBeacon.energy * 100);
            beaconText.textContent = `${closestBeacon.label} (${energyPercent}% signal)`;
          } else {
            beaconText.textContent = 'Scanning for beacons...';
          }
        }
      } else {
        statusIndicator.style.display = 'none';
      }
    }
  }

  /**
   * Show privacy notice
   */
  async function showPrivacyNotice() {
    return new Promise((resolve) => {
      const modal = createModal({
        title: 'Event Mode Privacy',
        content: `
          <div style="color:#ddd; line-height:1.6;">
            <p style="margin-bottom:1rem;">
              <strong>How Event Mode Works:</strong>
            </p>
            <ul style="margin-left:1.5rem; margin-bottom:1rem;">
              <li>Your device scans for nearby Bluetooth beacons placed at the event venue</li>
              <li>We record anonymous proximity signals as "presence pings"</li>
              <li>After the event, you can see "People you were near" suggestions</li>
              <li>You decide whether to connect with them</li>
            </ul>
            <p style="margin-bottom:1rem;">
              <strong>Your Privacy:</strong>
            </p>
            <ul style="margin-left:1.5rem; margin-bottom:1rem;">
              <li>Event Mode is opt-in (you control when it's active)</li>
              <li>No raw location data is recorded</li>
              <li>Suggestions are opt-in (accept, ignore, or block)</li>
              <li>You can stop Event Mode anytime</li>
            </ul>
            <p style="color:#00ff88; font-weight:600;">
              Continue with Event Mode?
            </p>
          </div>
        `,
        buttons: [
          {
            text: 'Accept & Continue',
            primary: true,
            onClick: () => {
              modal.remove();
              resolve(true);
            }
          },
          {
            text: 'Cancel',
            onClick: () => {
              modal.remove();
              resolve(false);
            }
          }
        ]
      });
    });
  }

  /**
   * Show suggestions modal
   */
  async function showSuggestionsModal() {
    if (!window.BLEPassiveNetworking) return;

    const modal = createModal({
      title: 'Suggested Connections',
      content: '<div id="ble-suggestions-content" style="min-height:200px;"><div style="text-align:center; padding:2rem; color:#aaa;">Loading...</div></div>',
      buttons: [
        {
          text: 'Generate New Suggestions',
          primary: true,
          onClick: async () => {
            await generateAndRefreshSuggestions();
          }
        },
        {
          text: 'Close',
          onClick: () => modal.remove()
        }
      ],
      wide: true
    });

    // Load suggestions
    await loadSuggestions();
  }

  /**
   * Load suggestions
   */
  async function loadSuggestions() {
    const container = document.getElementById('ble-suggestions-content');
    if (!container) return;

    try {
      const suggestions = await window.BLEPassiveNetworking.fetchSuggestions();

      if (suggestions.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:2rem; color:#aaa;">
            <i class="fas fa-user-friends" style="font-size:3rem; margin-bottom:1rem; opacity:0.5;"></i>
            <p>No suggestions yet.</p>
            <p style="font-size:0.9rem; margin-top:0.5rem;">Make sure Event Mode was active during the event.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = suggestions.map(suggestion => `
        <div class="ble-suggestion-card" data-edge-id="${suggestion.edgeId}" style="
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1rem;
        ">
          <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem;">
            <div style="
              width:48px;
              height:48px;
              border-radius:50%;
              background:linear-gradient(135deg,#8a2be2,#4b0082);
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:bold;
              color:#fff;
            ">${suggestion.displayName.substring(0,2).toUpperCase()}</div>
            <div style="flex:1;">
              <div style="color:#fff; font-weight:600; font-size:1rem;">${suggestion.displayName}</div>
              <div style="color:#aaa; font-size:0.85rem;">
                <i class="fas fa-clock"></i> ${suggestion.overlapMinutes} min together
                <span style="margin-left:1rem;">
                  <i class="fas fa-chart-bar"></i> ${Math.round(suggestion.confidence * 100)}% match
                </span>
              </div>
            </div>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button onclick="window.BLEUIHandlers.acceptSuggestion('${suggestion.edgeId}')" style="
              flex:1;
              padding:0.5rem 1rem;
              background:rgba(0,255,136,0.2);
              border:1px solid rgba(0,255,136,0.4);
              border-radius:8px;
              color:#00ff88;
              font-weight:600;
              cursor:pointer;
              transition:all 0.2s;
            " onmouseover="this.style.background='rgba(0,255,136,0.3)'" onmouseout="this.style.background='rgba(0,255,136,0.2)'">
              <i class="fas fa-check"></i> Accept
            </button>
            <button onclick="window.BLEUIHandlers.ignoreSuggestion('${suggestion.edgeId}')" style="
              flex:1;
              padding:0.5rem 1rem;
              background:rgba(255,255,255,0.05);
              border:1px solid rgba(255,255,255,0.2);
              border-radius:8px;
              color:#aaa;
              font-weight:600;
              cursor:pointer;
              transition:all 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
              <i class="fas fa-times"></i> Ignore
            </button>
            <button onclick="window.BLEUIHandlers.blockSuggestion('${suggestion.edgeId}')" style="
              padding:0.5rem 1rem;
              background:rgba(255,107,107,0.1);
              border:1px solid rgba(255,107,107,0.3);
              border-radius:8px;
              color:#ff6b6b;
              font-weight:600;
              cursor:pointer;
              transition:all 0.2s;
            " onmouseover="this.style.background='rgba(255,107,107,0.2)'" onmouseout="this.style.background='rgba(255,107,107,0.1)'">
              <i class="fas fa-ban"></i> Block
            </button>
          </div>
        </div>
      `).join('');

    } catch (error) {
      console.error('❌ [BLE UI] Failed to load suggestions:', error);
      container.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#ff6b6b;">
          <i class="fas fa-exclamation-triangle" style="font-size:3rem; margin-bottom:1rem;"></i>
          <p>Failed to load suggestions.</p>
        </div>
      `;
    }
  }

  /**
   * Generate and refresh suggestions
   */
  async function generateAndRefreshSuggestions() {
    const container = document.getElementById('ble-suggestions-content');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:2rem; color:#aaa;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i><p style="margin-top:1rem;">Generating suggestions...</p></div>';

    try {
      await window.BLEPassiveNetworking.generateSuggestions();
      await loadSuggestions();
      await updateSuggestionsCount();
    } catch (error) {
      console.error('❌ [BLE UI] Failed to generate suggestions:', error);
      container.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#ff6b6b;">
          <i class="fas fa-exclamation-triangle" style="font-size:3rem; margin-bottom:1rem;"></i>
          <p>Failed to generate suggestions.</p>
        </div>
      `;
    }
  }

  /**
   * Update suggestions count badge
   */
  async function updateSuggestionsCount() {
    if (!window.BLEPassiveNetworking) return;

    try {
      const suggestions = await window.BLEPassiveNetworking.fetchSuggestions();
      const badge = document.getElementById('ble-suggestions-badge');
      
      if (badge) {
        if (suggestions.length > 0) {
          badge.textContent = suggestions.length;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('❌ [BLE UI] Failed to update suggestions count:', error);
    }
  }

  /**
   * Show Bluetooth unavailable message
   */
  function showBluetoothUnavailableMessage() {
    // Only show on desktop (mobile users should use native app)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) return;

    console.warn('⚠️ [BLE UI] Web Bluetooth not available');
    
    // Show subtle notice
    setTimeout(() => {
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          'BLE Event Mode requires Chrome or Edge browser',
          'info'
        );
      }
    }, 2000);
  }

  // ============================================================================
  // MODAL HELPER
  // ============================================================================

  function createModal({ title, content, buttons = [], wide = false }) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(10px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98));
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      padding: 2rem;
      max-width: ${wide ? '800px' : '500px'};
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    `;

    modal.innerHTML = `
      <h2 style="color:#00e0ff; margin-bottom:1.5rem; font-size:1.5rem;">${title}</h2>
      <div style="margin-bottom:1.5rem;">${content}</div>
      <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
        ${buttons.map(btn => `
          <button class="modal-btn ${btn.primary ? 'primary' : ''}" style="
            padding:0.75rem 1.5rem;
            background:${btn.primary ? 'linear-gradient(135deg,#00e0ff,#0080ff)' : 'rgba(255,255,255,0.1)'};
            border:${btn.primary ? 'none' : '1px solid rgba(255,255,255,0.2)'};
            border-radius:8px;
            color:#fff;
            font-weight:600;
            cursor:pointer;
            transition:all 0.2s;
          ">${btn.text}</button>
        `).join('')}
      </div>
    `;

    // Attach button handlers
    const btnElements = modal.querySelectorAll('.modal-btn');
    btnElements.forEach((btn, i) => {
      if (buttons[i]?.onClick) {
        btn.addEventListener('click', buttons[i].onClick);
      }
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    return overlay;
  }

  // ============================================================================
  // SUGGESTION HANDLERS (exposed globally for inline onclick)
  // ============================================================================

  window.BLEUIHandlers = {
    async acceptSuggestion(edgeId) {
      const success = await window.BLEPassiveNetworking.acceptSuggestion(edgeId);
      if (success) {
        // Remove card from UI
        const card = document.querySelector(`[data-edge-id="${edgeId}"]`);
        if (card) card.remove();
        
        // Update count
        await updateSuggestionsCount();
        
        // Refresh network view if available
        if (typeof window.refreshSynapseConnections === 'function') {
          window.refreshSynapseConnections();
        }
      }
    },

    async ignoreSuggestion(edgeId) {
      const success = await window.BLEPassiveNetworking.ignoreSuggestion(edgeId);
      if (success) {
        const card = document.querySelector(`[data-edge-id="${edgeId}"]`);
        if (card) card.remove();
        await updateSuggestionsCount();
      }
    },

    async blockSuggestion(edgeId) {
      const success = await window.BLEPassiveNetworking.blockSuggestion(edgeId);
      if (success) {
        const card = document.querySelector(`[data-edge-id="${edgeId}"]`);
        if (card) card.remove();
        await updateSuggestionsCount();
      }
    }
  };

  // ============================================================================
  // AUTO-INITIALIZE
  // ============================================================================

  // Initialize when profile is loaded
  window.addEventListener('profile-loaded', (event) => {
    const { profile } = event.detail;
    if (profile?.id && window.BLEPassiveNetworking) {
      initialize();
    }
  });

  // Add pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);

  // ============================================================================
  // EVENT MODE GRAVITY (Desktop Synapse Overlay)
  // ============================================================================

  let eventModeGravityButton = null;

  /**
   * Create Event Mode Gravity button (desktop only)
   */
  function createEventModeGravityButton() {
    // Skip on mobile
    if (window.innerWidth < 1024) return;

    // Add button next to suggestions button
    if (!suggestionsButton || !suggestionsButton.parentElement) return;

    eventModeGravityButton = document.createElement('div');
    eventModeGravityButton.id = 'btn-event-mode-gravity';
    eventModeGravityButton.setAttribute('role', 'button');
    eventModeGravityButton.setAttribute('tabindex', '0');
    eventModeGravityButton.setAttribute('title', 'Toggle Event Mode (Beacon Gravity)');
    eventModeGravityButton.setAttribute('aria-label', 'Toggle Event Mode Gravity');
    
    eventModeGravityButton.style.cssText = `
      cursor: pointer;
      padding: 0.75rem;
      background: rgba(138,43,226,0.1);
      border: 1px solid rgba(138,43,226,0.3);
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: all 0.2s;
    `;

    eventModeGravityButton.innerHTML = `
      <i class="fas fa-satellite-dish" style="color:#8a2be2; font-size:1.2rem;"></i>
    `;

    eventModeGravityButton.addEventListener('click', toggleEventModeGravity);
    eventModeGravityButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleEventModeGravity();
      }
    });

    // Insert after suggestions button
    suggestionsButton.parentElement.insertBefore(eventModeGravityButton, suggestionsButton.nextSibling);

    console.log('✅ [BLE UI] Event Mode Gravity button created');
  }

  /**
   * Toggle Event Mode Gravity
   */
  async function toggleEventModeGravity() {
    if (!window.EventModeGravity) {
      alert('Event Mode Gravity not available. Please ensure the module is loaded.');
      return;
    }

    const isActive = window.EventModeGravity.isActive();

    if (isActive) {
      window.EventModeGravity.disableEventMode();
    } else {
      // Use hardcoded beacon for now (from requirements)
      const beaconId = '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b';
      const groupId = 'f270cbe4-fbef-457c-a685-48f83b5492b8';

      await window.EventModeGravity.enableEventMode({ beaconId, groupId });
    }
  }

  /**
   * Handle Event Mode state change
   */
  function handleEventModeChange(event) {
    const { isActive, attendeeCount, suggestedEdgeCount } = event.detail;

    // Update button style
    if (eventModeGravityButton) {
      if (isActive) {
        eventModeGravityButton.style.background = 'rgba(138,43,226,0.2)';
        eventModeGravityButton.style.borderColor = 'rgba(138,43,226,0.6)';
        eventModeGravityButton.querySelector('i').style.animation = 'pulse 2s infinite';
      } else {
        eventModeGravityButton.style.background = 'rgba(138,43,226,0.1)';
        eventModeGravityButton.style.borderColor = 'rgba(138,43,226,0.3)';
        eventModeGravityButton.querySelector('i').style.animation = 'none';
      }
    }

    // Show notification
    if (isActive) {
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          `Event Mode active: ${attendeeCount} attendees, ${suggestedEdgeCount} suggestions`,
          'success'
        );
      }
    }
  }

  console.log('✅ BLE UI module loaded');

})();
