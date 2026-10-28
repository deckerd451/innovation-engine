// ================================================================
// SETTINGS MODAL
// ================================================================
// What a member can actually change, and where the rest lives:
//   - Map discovery suggestions (unified-network-integration.js applies it)
//   - Privacy: routes to the existing choices in You (photo visibility in
//     Edit Profile, the Nearify connection); no switches of its own
//   - Debug mode, only while debugging is already on (?debug=1 or DEBUG=1),
//     so a developer can turn it off; admins also have it in the admin panel
// Quiet Mode, language, email and push had no effect and are not shown.
// What they stored (quiet-mode-enabled, preferred_language, …) is left alone.

(() => {
  'use strict';

  const GUARD = '__CH_SETTINGS_MODAL_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  function getSetting(key, defaultVal) {
    try { const v = localStorage.getItem(key); return v === null ? defaultVal : v; }
    catch { return defaultVal; }
  }
  function setSetting(key, val) {
    try { localStorage.setItem(key, val); } catch {}
  }
  function removeSetting(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  // Map discovery suggestions: on unless turned off here. Someone who turned
  // discovery off in the old Discovery Preferences dialog (stored as
  // unified-network-preferences) stays off until they change it here. The
  // map reads the same value (storedDiscoveryEnabled() in state-manager.js).
  const DISCOVERY_KEY = 'discovery-suggestions-enabled';
  function discoverySuggestionsEnabled() {
    const saved = getSetting(DISCOVERY_KEY, null);
    if (saved !== null) return saved !== 'false';
    try {
      const legacy = JSON.parse(getSetting('unified-network-preferences', 'null'));
      if (legacy && (legacy.enabled === false || legacy.frequency === 'off')) return false;
    } catch {}
    return true;
  }
  function applyDiscoverySuggestions(enabled) {
    if (enabled === discoverySuggestionsEnabled()) return;
    setSetting(DISCOVERY_KEY, enabled ? 'true' : 'false');
    removeSetting('unified-network-preferences'); // the old dialog's value, now replaced
    window.dispatchEvent(new CustomEvent('discovery-suggestions-changed', { detail: { enabled } }));
  }

  // Debug Mode is for developers: shown only while debugging is on.
  function debugActive() {
    if (getSetting('DEBUG', '0') === '1') return true;
    try { return new URL(location.href).searchParams.get('debug') === '1'; } catch { return false; }
  }

  // ----------------------------------------------------------------
  // Modal HTML
  // ----------------------------------------------------------------
  function buildModal() {
    const discovery = discoverySuggestionsEnabled();
    const debug     = debugActive();
    const isDebug   = getSetting('DEBUG', '0') === '1';

    const heading = (icon, text, color = '#00e0ff') => `
              <div style="color: ${color}; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.4rem;">
                <i class="fas ${icon}" aria-hidden="true"></i>&nbsp; ${text}
              </div>`;
    const row = `
                display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; padding: 0.75rem 1rem;`;
    // A row that goes to where a choice already lives (no setting here).
    const route = (id, title, desc) => `
                <button type="button" id="${id}" class="settings-route" style="${row}
                  width: 100%; min-height: 44px; cursor: pointer; text-align: left; font: inherit; color: inherit;
                ">
                  <span>
                    <span style="display: block; color: #fff; font-size: 0.95rem; font-weight: 600;">${title}</span>
                    <span style="display: block; color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-top: 0.15rem;">${desc}</span>
                  </span>
                  <i class="fas fa-chevron-right" aria-hidden="true" style="color: rgba(255,255,255,0.45); flex-shrink: 0;"></i>
                </button>`;

    // The overlay's padding keeps the dialog clear of the notch, the status
    // bar and the home indicator (viewport-fit=cover).
    return `
      <div id="settings-modal-overlay" style="
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
                 max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      ">
        <style>
          #settings-close-btn { width: 34px; height: 34px; }
          #settings-modal .settings-route:hover,
          #settings-modal .settings-route:focus-visible { border-color: rgba(0,224,255,0.45); }
          @media (pointer: coarse) {
            #settings-close-btn { width: 44px; height: 44px; }
            #settings-save-btn { min-height: 44px; }
          }
        </style>
        <!-- Header and Save stay in view; only the body scrolls. -->
        <div id="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabindex="-1" style="
          background: linear-gradient(135deg, #0a0f1e 0%, #0d1529 100%);
          border: 1px solid rgba(0,224,255,0.25);
          border-radius: 16px; width: 100%; max-width: 440px;
          max-height: 90vh; max-height: 90dvh; overflow: hidden;
          display: flex; flex-direction: column; outline: none;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,224,255,0.1);
        ">
          <!-- Header -->
          <div style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 1rem 1.25rem 0.75rem; flex-shrink: 0;
            border-bottom: 1px solid rgba(0,224,255,0.1);
          ">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div aria-hidden="true" style="
                width: 32px; height: 32px; border-radius: 9px;
                background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #00e0ff; font-size: 0.95rem;
              "><i class="fas fa-cog"></i></div>
              <h2 id="settings-modal-title" style="margin: 0; color: #fff; font-size: 1.2rem; font-weight: 700;">Settings</h2>
            </div>
            <button type="button" id="settings-close-btn" aria-label="Close settings" style="
              background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
              color: rgba(255,255,255,0.7); flex-shrink: 0;
              border-radius: 50%; cursor: pointer; font-size: 1rem;
              display: flex; align-items: center; justify-content: center;
            "><i class="fas fa-times" aria-hidden="true"></i></button>
          </div>

          <!-- Body -->
          <div id="settings-modal-body" style="
            padding: 1rem 1.25rem; display: grid; gap: 1rem;
            flex: 1 1 auto; min-height: 0; overflow-y: auto;
            overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          ">

            <!-- Network -->
            <section>${heading('fa-project-diagram', 'Network')}
              <label style="${row} cursor: pointer;">
                <div>
                  <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Map suggestions</div>
                  <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-top: 0.15rem;">
                    Now and then, the Network Map highlights up to 3 people or projects outside your network you might want to meet. Turn off to stop these.
                  </div>
                </div>
                <input type="checkbox" id="settings-discovery-suggestions" ${discovery ? 'checked' : ''} style="
                  width: 20px; height: 20px; accent-color: #00e0ff; cursor: pointer; flex-shrink: 0;
                ">
              </label>
            </section>

            <!-- Privacy: the existing choices, in You -->
            <section>${heading('fa-user-shield', 'Privacy')}
              <div style="display: grid; gap: 0.5rem;">${route('settings-privacy-photo', 'Who sees your photo', 'Edit Profile → Show my photo to other signed-in members')}${route('settings-privacy-nearify', 'Nearify', 'Connect or disconnect Nearify in You')}
              </div>
            </section>
${debug ? `
            <!-- Developer (only while debugging is on) -->
            <section>${heading('fa-code', 'Developer', 'rgba(255,255,255,0.45)')}
              <label style="${row} cursor: pointer;">
                <div>
                  <div style="color: rgba(255,255,255,0.8); font-size: 0.95rem; font-weight: 600;">Debug Mode</div>
                  <div style="color: rgba(255,255,255,0.55); font-size: 0.8rem; margin-top: 0.15rem;">
                    Shows verbose console logs (reload required)
                  </div>
                </div>
                <input type="checkbox" id="settings-debug-mode" ${isDebug ? 'checked' : ''} style="
                  width: 20px; height: 20px; accent-color: #ffaa00; cursor: pointer; flex-shrink: 0;
                ">
              </label>
            </section>
` : ''}
          </div>

          <!-- Footer -->
          <div style="
            padding: 0.75rem 1.25rem; flex-shrink: 0;
            border-top: 1px solid rgba(0,224,255,0.1);
            display: flex; gap: 0.75rem; justify-content: flex-end;
          ">
            <button type="button" id="settings-save-btn" style="
              padding: 0.65rem 1.5rem;
              background: linear-gradient(135deg, #00e0ff, #0080ff);
              border: none; border-radius: 8px; color: #000;
              font-weight: 700; font-size: 0.95rem; cursor: pointer;
            ">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Open / Close
  // ----------------------------------------------------------------
  let opener = null; // focus returns here on close

  function open() {
    if (document.getElementById('settings-modal-overlay')) return; // already open
    opener = document.activeElement;
    const div = document.createElement('div');
    div.innerHTML = buildModal();
    document.body.appendChild(div.firstElementChild);
    wireEvents();
    document.getElementById('settings-modal')?.focus({ preventScroll: true });
  }

  function close() {
    const overlay = document.getElementById('settings-modal-overlay');
    if (!overlay) return;
    overlay.remove();
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
    opener = null;
  }

  // Tab and Shift+Tab stay inside the dialog.
  function trapTab(e) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const focusable = [...modal.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const inside = modal.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === modal)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  function wireEvents() {
    document.getElementById('settings-close-btn')?.addEventListener('click', close);
    document.getElementById('settings-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal-overlay') close();
    });
    document.getElementById('settings-save-btn')?.addEventListener('click', save);
    document.getElementById('settings-privacy-photo')?.addEventListener('click', () => showInYou('#edit-photo-visible', true));
    document.getElementById('settings-privacy-nearify')?.addEventListener('click', () => showInYou('#nearify-experience-row', false));
  }

  // Privacy rows go to the choice where it already lives, in You (Edit
  // Profile, or the profile itself). Settings closes as with Close: nothing
  // unsaved is kept.
  function showInYou(selector, editor) {
    close();
    if (editor) window.openProfileEditor?.();
    else window.openProfileModal?.();
    let tries = 0;
    (function find() {
      const el = document.querySelector(selector);
      if (el && el.getClientRects().length) {
        if (!el.matches('input, button, a, [tabindex]')) el.setAttribute('tabindex', '-1');
        // To the top: on phones You's actions are pinned along the bottom.
        // The Nearify row fills in when Nearify answers, so look again.
        el.scrollIntoView({ block: 'start' });
        el.focus({ preventScroll: true });
        setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'nearest' }); }, 800);
      } else if (++tries < 40) {
        setTimeout(find, 100);
      }
    })();
  }

  function save() {
    // Map discovery suggestions
    const discoveryEl = document.getElementById('settings-discovery-suggestions');
    if (discoveryEl) applyDiscoverySuggestions(discoveryEl.checked);

    // Debug mode (shown only while debugging is on)
    const debugEl = document.getElementById('settings-debug-mode');
    if (debugEl) {
      if (debugEl.checked) setSetting('DEBUG', '1');
      else removeSetting('DEBUG');
    }

    // Show brief confirmation toast if available
    if (typeof window.showToast === 'function') {
      window.showToast('Settings saved', 'success');
    } else if (typeof window.showNotification === 'function') {
      window.showNotification('Settings saved', 'success');
    }

    close();
  }

  // ----------------------------------------------------------------
  // Keyboard: Escape closes; Tab stays inside the dialog
  // ----------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('settings-modal-overlay')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') trapTab(e);
  });

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.SettingsModal = { open, close, discoverySuggestionsEnabled };

})();
