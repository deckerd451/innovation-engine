// ================================================================
// MOBILE BOTTOM TAB BAR
// ================================================================
// Wires up the #mobile-tab-bar buttons to app actions.
// Only active on <1024px. Does nothing on desktop.
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_MOBILE_NAV_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // Only active on mobile
  if (window.innerWidth >= 1024) return;

  // Re-check on resize (e.g., orientation change)
  window.addEventListener('resize', () => {
    const tabBar = document.getElementById('mobile-tab-bar');
    if (!tabBar) return;
    
    if (window.innerWidth >= 1024) {
      // Desktop - hide mobile nav
      tabBar.style.display = 'none';
    } else {
      // Mobile - show mobile nav (let CSS handle it)
      tabBar.style.display = '';
    }
  }, { passive: true });

  // ── Tab definitions ────────────────────────────────────────────
  const TABS = {
    'event-mode': {
      activate() {
        // Toggle BLE Event Mode
        if (window.BLEPassiveNetworking) {
          const isScanning = window.BLEPassiveNetworking.isScanning();
          if (isScanning) {
            window.BLEPassiveNetworking.stopEventMode();
          } else {
            // Show privacy notice first time
            if (!localStorage.getItem('ble_privacy_accepted')) {
              showMobilePrivacyNotice().then(accepted => {
                if (accepted) {
                  localStorage.setItem('ble_privacy_accepted', 'true');
                  window.BLEPassiveNetworking.startEventMode();
                }
              });
            } else {
              window.BLEPassiveNetworking.startEventMode();
            }
          }
        } else {
          alert('BLE not available in this browser. Use Chrome or Edge.');
        }
        return false; // Don't mark as active - it's a toggle
      }
    },
    suggestions: {
      activate() {
        // Show BLE suggestions modal
        if (window.BLEPassiveNetworking) {
          showMobileSuggestionsModal();
        } else {
          alert('BLE not available in this browser.');
        }
        return false; // modal, not a destination
      }
    },
    start: {
      activate() {
        // Open the daily brief / START modal
        if (typeof window.openStartModal === 'function') {
          window.openStartModal();
        } else if (window.StartDailyDigest?.show) {
          window.StartDailyDigest.show();
        } else {
          // Fallback: click the hidden start button
          document.getElementById('btn-start-nav')?.click() ||
          document.getElementById('btn-start-center')?.click();
        }
        // Don't mark as active — it's a modal, not a destination
        return false;
      }
    },
    messages: {
      activate() {
        if (window.UnifiedNotifications?.showPanel) {
          window.UnifiedNotifications.showPanel();
        } else if (typeof window.openMessagesModal === 'function') {
          window.openMessagesModal();
        }
        return false; // modal, not a destination
      }
    },
    profile: {
      activate() {
        // Show profile modal with logout option
        showMobileProfileSheet();
        return false; // modal, not a destination
      }
    },
  };

  // ── Active state ───────────────────────────────────────────────
  let _active = null; // No default active state for mobile

  function setActive(tab) {
    _active = tab;
    document.querySelectorAll('.mob-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  // ── Helper: Mobile Privacy Notice ──────────────────────────────
  function showMobilePrivacyNotice() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        z-index: 10001;
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
        padding: 1.5rem;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      `;

      modal.innerHTML = `
        <h3 style="color:#00ff88; margin:0 0 1rem 0; font-size:1.25rem;">Event Mode Privacy</h3>
        <div style="color:#ddd; line-height:1.6; font-size:0.9rem; margin-bottom:1.5rem;">
          <p style="margin:0 0 0.75rem 0;">Event Mode scans for nearby Bluetooth beacons to help you discover people you were near at events.</p>
          <p style="margin:0 0 0.75rem 0;"><strong>Your Privacy:</strong></p>
          <ul style="margin:0 0 0.75rem 1rem; padding:0;">
            <li>Opt-in only (you control when it's active)</li>
            <li>No raw location data recorded</li>
            <li>You decide who to connect with</li>
          </ul>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button id="ble-privacy-accept" style="
            flex:1; padding:0.75rem; background:linear-gradient(135deg,#00ff88,#00e0ff);
            border:none; border-radius:8px; color:#000; font-weight:700; cursor:pointer;">
            Accept & Continue
          </button>
          <button id="ble-privacy-cancel" style="
            flex:1; padding:0.75rem; background:rgba(255,255,255,0.1);
            border:1px solid rgba(255,255,255,0.2); border-radius:8px; color:#fff; font-weight:600; cursor:pointer;">
            Cancel
          </button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      modal.querySelector('#ble-privacy-accept').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      modal.querySelector('#ble-privacy-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  // ── Helper: Mobile Suggestions Modal ───────────────────────────
  async function showMobileSuggestionsModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(10px);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      overflow-y: auto;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98));
      border: 2px solid rgba(138,43,226,0.4);
      border-radius: 16px;
      padding: 1.5rem;
      max-width: 500px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    `;

    modal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h3 style="color:#8a2be2; margin:0; font-size:1.25rem;">Suggested Connections</h3>
        <button id="ble-suggestions-close" style="
          background:rgba(255,107,107,0.2); border:1px solid rgba(255,107,107,0.4);
          border-radius:50%; width:32px; height:32px; color:#ff6b6b; cursor:pointer; font-size:1.1rem;">
          ×
        </button>
      </div>
      <div id="mobile-suggestions-content" style="min-height:100px;">
        <div style="text-align:center; padding:2rem; color:#aaa;">
          <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
          <p style="margin-top:1rem;">Loading...</p>
        </div>
      </div>
      <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1);">
        <button id="ble-generate-suggestions" style="
          width:100%; padding:0.75rem; background:linear-gradient(135deg,#8a2be2,#4b0082);
          border:none; border-radius:8px; color:#fff; font-weight:700; cursor:pointer;">
          Generate New Suggestions
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    modal.querySelector('#ble-suggestions-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Load suggestions
    loadMobileSuggestions();

    // Generate button
    modal.querySelector('#ble-generate-suggestions').addEventListener('click', async () => {
      const content = modal.querySelector('#mobile-suggestions-content');
      content.innerHTML = '<div style="text-align:center; padding:2rem; color:#aaa;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i><p style="margin-top:1rem;">Generating...</p></div>';
      await window.BLEPassiveNetworking.generateSuggestions();
      await loadMobileSuggestions();
      syncSuggestionsBadge();
    });
  }

  async function loadMobileSuggestions() {
    const content = document.getElementById('mobile-suggestions-content');
    if (!content) return;

    try {
      const suggestions = await window.BLEPassiveNetworking.fetchSuggestions();

      if (suggestions.length === 0) {
        content.innerHTML = `
          <div style="text-align:center; padding:2rem; color:#aaa;">
            <i class="fas fa-user-friends" style="font-size:3rem; opacity:0.5;"></i>
            <p style="margin-top:1rem;">No suggestions yet.</p>
            <p style="font-size:0.85rem; margin-top:0.5rem;">Make sure Event Mode was active during the event.</p>
          </div>
        `;
        return;
      }

      content.innerHTML = suggestions.map(s => `
        <div class="mobile-suggestion-card" data-edge-id="${s.edgeId}" style="
          background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          border-radius:12px; padding:1rem; margin-bottom:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
            <div style="
              width:40px; height:40px; border-radius:50%;
              background:linear-gradient(135deg,#8a2be2,#4b0082);
              display:flex; align-items:center; justify-content:center;
              font-weight:bold; color:#fff; font-size:0.9rem;">
              ${s.displayName.substring(0,2).toUpperCase()}
            </div>
            <div style="flex:1;">
              <div style="color:#fff; font-weight:600; font-size:0.95rem;">${s.displayName}</div>
              <div style="color:#aaa; font-size:0.75rem;">
                ${s.overlapMinutes} min • ${Math.round(s.confidence * 100)}% match
              </div>
            </div>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button onclick="handleMobileSuggestionAccept('${s.edgeId}')" style="
              flex:1; padding:0.5rem; background:rgba(0,255,136,0.2);
              border:1px solid rgba(0,255,136,0.4); border-radius:6px;
              color:#00ff88; font-weight:600; font-size:0.85rem; cursor:pointer;">
              Accept
            </button>
            <button onclick="handleMobileSuggestionIgnore('${s.edgeId}')" style="
              flex:1; padding:0.5rem; background:rgba(255,255,255,0.05);
              border:1px solid rgba(255,255,255,0.2); border-radius:6px;
              color:#aaa; font-weight:600; font-size:0.85rem; cursor:pointer;">
              Ignore
            </button>
          </div>
        </div>
      `).join('');

    } catch (error) {
      console.error('Failed to load suggestions:', error);
      content.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#ff6b6b;">
          <i class="fas fa-exclamation-triangle" style="font-size:3rem;"></i>
          <p style="margin-top:1rem;">Failed to load suggestions.</p>
        </div>
      `;
    }
  }

  // ── Helper: Mobile Profile Sheet with Logout ───────────────────
  function showMobileProfileSheet() {
    // Open the existing profile modal (which already has logout button)
    if (typeof window.openProfileModal === 'function') {
      window.openProfileModal();
      
      // On mobile, intercept the logout button to show confirmation
      setTimeout(() => {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn && window.innerWidth < 1024) {
          // Remove existing listeners and add mobile confirmation
          const newLogoutBtn = logoutBtn.cloneNode(true);
          logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
          
          newLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMobileLogoutConfirm();
          });
        }
      }, 100);
    }
  }

  // ── Helper: Mobile Logout Confirmation ─────────────────────────
  function showMobileLogoutConfirm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(10px);
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98));
      border: 2px solid rgba(255,107,107,0.4);
      border-radius: 16px;
      padding: 1.5rem;
      max-width: 350px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    `;

    modal.innerHTML = `
      <h3 style="color:#ff6b6b; margin:0 0 1rem 0; font-size:1.25rem;">
        <i class="fas fa-sign-out-alt"></i> Logout?
      </h3>
      <p style="color:#ddd; margin:0 0 1.5rem 0; font-size:0.9rem;">
        Are you sure you want to logout?
      </p>
      <div style="display:flex; gap:0.5rem;">
        <button id="logout-cancel" style="
          flex:1; padding:0.75rem; background:rgba(255,255,255,0.1);
          border:1px solid rgba(255,255,255,0.2); border-radius:8px;
          color:#fff; font-weight:600; cursor:pointer;">
          Cancel
        </button>
        <button id="logout-confirm" style="
          flex:1; padding:0.75rem; background:rgba(255,107,107,0.2);
          border:1px solid rgba(255,107,107,0.4); border-radius:8px;
          color:#ff6b6b; font-weight:700; cursor:pointer;">
          Logout
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#logout-cancel').addEventListener('click', () => overlay.remove());
    modal.querySelector('#logout-confirm').addEventListener('click', () => {
      overlay.remove();
      if (window.doLogout) window.doLogout();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Global handlers for suggestion actions ─────────────────────
  window.handleMobileSuggestionAccept = async function(edgeId) {
    const success = await window.BLEPassiveNetworking.acceptSuggestion(edgeId);
    if (success) {
      const card = document.querySelector(`[data-edge-id="${edgeId}"]`);
      if (card) card.remove();
      syncSuggestionsBadge();
      if (typeof window.refreshSynapseConnections === 'function') {
        window.refreshSynapseConnections();
      }
    }
  };

  window.handleMobileSuggestionIgnore = async function(edgeId) {
    const success = await window.BLEPassiveNetworking.ignoreSuggestion(edgeId);
    if (success) {
      const card = document.querySelector(`[data-edge-id="${edgeId}"]`);
      if (card) card.remove();
      syncSuggestionsBadge();
    }
  };

  // ── Wire buttons ───────────────────────────────────────────────
  function wire() {
    document.querySelectorAll('.mob-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        const def = TABS[tab];
        if (!def) return;
        const result = def.activate();
        // activate() returns false for modals (don't change active highlight)
        if (result !== false) setActive(tab);
      });
    });
    // No default active state for mobile
  }

  // ── Badge sync: messages + suggestions ─────────────────────────
  function syncBadge() {
    // Sync messages badge from bell badge
    const bellBadge = document.getElementById('cd-bell-badge');
    const tabBadge  = document.getElementById('mob-tab-messages-badge');
    if (bellBadge && tabBadge) {
      const observer = new MutationObserver(() => {
        const hidden = bellBadge.style.display === 'none' || !bellBadge.textContent.trim();
        tabBadge.style.display = hidden ? 'none' : '';
        tabBadge.textContent   = bellBadge.textContent;
      });
      observer.observe(bellBadge, { attributes: true, childList: true, characterData: true });
      // Initial sync
      const hidden = bellBadge.style.display === 'none';
      tabBadge.style.display = hidden ? 'none' : '';
      tabBadge.textContent   = bellBadge.textContent;
    }

    // Sync suggestions badge
    syncSuggestionsBadge();
  }

  function syncSuggestionsBadge() {
    if (!window.BLEPassiveNetworking) return;

    window.BLEPassiveNetworking.fetchSuggestions().then(suggestions => {
      const badge = document.getElementById('mob-tab-suggestions-badge');
      if (badge) {
        if (suggestions.length > 0) {
          badge.textContent = suggestions.length;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    }).catch(err => {
      console.error('Failed to sync suggestions badge:', err);
    });
  }

  // ── Listen for BLE state changes ───────────────────────────────
  window.addEventListener('ble-state-changed', (e) => {
    const { isScanning } = e.detail;
    const btn = document.getElementById('mob-tab-event-mode');
    if (btn) {
      if (isScanning) {
        btn.classList.add('active');
        btn.querySelector('i').style.animation = 'pulse 2s infinite';
      } else {
        btn.classList.remove('active');
        btn.querySelector('i').style.animation = 'none';
      }
    }
  });

  // ── Refresh suggestions badge periodically ─────────────────────
  setInterval(() => {
    if (window.BLEPassiveNetworking && !document.hidden) {
      syncSuggestionsBadge();
    }
  }, 30000); // Every 30 seconds

  // ── Init (after DOM ready) ─────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wire(); syncBadge(); });
  } else {
    wire();
    // Badge sync needs the bell to be populated first
    setTimeout(syncBadge, 500);
  }

})();
