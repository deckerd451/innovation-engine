// ================================================================
// SETTINGS MODAL
// ================================================================
// Provides a real settings UI for all users:
//   - Quiet Mode toggle
//   - Language, email and push notifications ("Coming soon": shown,
//     can't be changed, stored values left alone)
//   - Map discovery suggestions (unified-network-integration.js applies it)
//   - Debug mode toggle

(() => {
  'use strict';

  const GUARD = '__CH_SETTINGS_MODAL_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // ----------------------------------------------------------------
  // Supported languages (mirrors i18n-engine.js)
  // ----------------------------------------------------------------
  const LANGUAGES = [
    { code: 'en',    label: 'English',            flag: '🇺🇸' },
    { code: 'es',    label: 'Español',             flag: '🇪🇸' },
    { code: 'fr',    label: 'Français',            flag: '🇫🇷' },
    { code: 'de',    label: 'Deutsch',             flag: '🇩🇪' },
    { code: 'pt',    label: 'Português',           flag: '🇵🇹' },
    { code: 'zh-CN', label: '简体中文',             flag: '🇨🇳' },
    { code: 'ja',    label: '日本語',              flag: '🇯🇵' },
    { code: 'ko',    label: '한국어',              flag: '🇰🇷' },
  ];

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

  function applyQuietMode(enabled) {
    if (enabled) {
      document.body.classList.add('quiet-mode');
      setSetting('quiet-mode-enabled', 'true');
    } else {
      document.body.classList.remove('quiet-mode');
      removeSetting('quiet-mode-enabled');
    }
    window.dispatchEvent(new CustomEvent('quiet-mode-changed', { detail: { enabled } }));
  }

  // ----------------------------------------------------------------
  // Modal HTML
  // ----------------------------------------------------------------
  function buildModal() {
    const isQuiet   = getSetting('quiet-mode-enabled', 'false') === 'true';
    const isDebug   = getSetting('DEBUG', '0') === '1';
    // The language the app is actually shown in (no translations load yet).
    const curLang   = (typeof window.getCurrentLanguage === 'function')
                        ? window.getCurrentLanguage()
                        : 'en';
    const discovery = discoverySuggestionsEnabled();

    const langOptions = LANGUAGES.map(l =>
      `<option value="${l.code}" ${l.code === curLang ? 'selected' : ''}>${l.flag} ${l.label}</option>`
    ).join('');

    // Email, push and language aren't connected to anything yet: they show
    // as "Coming soon", can't be changed, and Save leaves what's stored.
    const comingSoon = `<span class="settings-coming-soon" style="
      display: inline-block; margin-left: 0.4rem; padding: 0.1rem 0.45rem; vertical-align: middle;
      border: 1px solid rgba(0,224,255,0.35); border-radius: 999px;
      color: #00e0ff; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.02em;
    ">Coming soon</span>`;

    return `
      <div id="settings-modal-overlay" style="
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
      ">
        <style>
          #settings-close-btn { width: 34px; height: 34px; }
          #settings-language option { background: #0d1529; color: #fff; }
          @media (pointer: coarse) {
            #settings-close-btn { width: 44px; height: 44px; }
            #settings-save-btn { min-height: 44px; }
          }
        </style>
        <!-- Header and Save stay in view; only the body scrolls. -->
        <div id="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabindex="-1" style="
          background: linear-gradient(135deg, #0a0f1e 0%, #0d1529 100%);
          border: 1px solid rgba(0,224,255,0.25);
          border-radius: 16px; width: 100%; max-width: 480px;
          max-height: 90vh; max-height: 90dvh; overflow: hidden;
          display: flex; flex-direction: column; outline: none;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,224,255,0.1);
        ">
          <!-- Header -->
          <div style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 1.25rem 1.5rem 0.75rem; flex-shrink: 0;
            border-bottom: 1px solid rgba(0,224,255,0.1);
          ">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div aria-hidden="true" style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #00e0ff; font-size: 1rem;
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
            padding: 1rem 1.5rem; display: grid; gap: 1rem;
            flex: 1 1 auto; min-height: 0; overflow-y: auto;
            overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          ">

            <!-- Display -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem;">
                <i class="fas fa-eye" aria-hidden="true"></i>&nbsp; Display
              </div>
              <label style="
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
              ">
                <div>
                  <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Quiet Mode</div>
                  <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                    Reduces visual noise, dims non-essential elements
                  </div>
                </div>
                <input type="checkbox" id="settings-quiet-mode" ${isQuiet ? 'checked' : ''} style="
                  width: 20px; height: 20px; accent-color: #00e0ff; cursor: pointer; flex-shrink: 0;
                ">
              </label>
            </section>

            <!-- Network -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem;">
                <i class="fas fa-project-diagram" aria-hidden="true"></i>&nbsp; Network
              </div>
              <label style="
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
              ">
                <div>
                  <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Map suggestions</div>
                  <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                    Highlight people and projects you might want to meet
                  </div>
                </div>
                <input type="checkbox" id="settings-discovery-suggestions" ${discovery ? 'checked' : ''} style="
                  width: 20px; height: 20px; accent-color: #00e0ff; cursor: pointer; flex-shrink: 0;
                ">
              </label>
            </section>

            <!-- Language -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem;">
                <i class="fas fa-globe" aria-hidden="true"></i>&nbsp; Language
              </div>
              <div style="
                display: flex; align-items: center; gap: 0.5rem;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; padding: 0.85rem 1rem; opacity: 0.6;
              ">
                <select id="settings-language" disabled aria-label="Language (coming soon)" style="
                  flex: 1; min-width: 0; background: transparent; border: none; color: #fff;
                  font-size: 0.95rem; cursor: not-allowed; outline: none; appearance: none;
                  backdrop-filter: none; -webkit-backdrop-filter: none;
                ">${langOptions}</select>
                ${comingSoon}
              </div>
            </section>

            <!-- Notifications -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem;">
                <i class="fas fa-bell" aria-hidden="true"></i>&nbsp; Notifications
              </div>
              <div style="display: grid; gap: 0.5rem;">
                <label style="
                  display: flex; align-items: center; justify-content: space-between;
                  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                  border-radius: 10px; padding: 0.85rem 1rem; cursor: not-allowed; opacity: 0.6;
                ">
                  <div>
                    <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Email Notifications${comingSoon}</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                      Receive updates via email
                    </div>
                  </div>
                  <input type="checkbox" id="settings-email-notif" disabled style="
                    width: 20px; height: 20px; accent-color: #00e0ff; cursor: not-allowed; flex-shrink: 0;
                  ">
                </label>
                <label style="
                  display: flex; align-items: center; justify-content: space-between;
                  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                  border-radius: 10px; padding: 0.85rem 1rem; cursor: not-allowed; opacity: 0.6;
                ">
                  <div>
                    <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Push Notifications${comingSoon}</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                      Browser push alerts when you have new activity
                    </div>
                  </div>
                  <input type="checkbox" id="settings-push-notif" disabled style="
                    width: 20px; height: 20px; accent-color: #00e0ff; cursor: not-allowed; flex-shrink: 0;
                  ">
                </label>
              </div>
            </section>

            <!-- Developer -->
            <section>
              <div style="color: rgba(255,255,255,0.3); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem;">
                <i class="fas fa-code" aria-hidden="true"></i>&nbsp; Developer
              </div>
              <label style="
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
                border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
              ">
                <div>
                  <div style="color: rgba(255,255,255,0.6); font-size: 0.95rem; font-weight: 600;">Debug Mode</div>
                  <div style="color: rgba(255,255,255,0.35); font-size: 0.8rem; margin-top: 0.2rem;">
                    Shows verbose console logs (reload required)
                  </div>
                </div>
                <input type="checkbox" id="settings-debug-mode" ${isDebug ? 'checked' : ''} style="
                  width: 20px; height: 20px; accent-color: #ffaa00; cursor: pointer; flex-shrink: 0;
                ">
              </label>
            </section>

          </div>

          <!-- Footer -->
          <div style="
            padding: 0.75rem 1.5rem; flex-shrink: 0;
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
  }

  function save() {
    // Quiet Mode
    const quietEl = document.getElementById('settings-quiet-mode');
    if (quietEl) applyQuietMode(quietEl.checked);

    // Map discovery suggestions
    const discoveryEl = document.getElementById('settings-discovery-suggestions');
    if (discoveryEl) applyDiscoverySuggestions(discoveryEl.checked);

    // Language, email and push are "Coming soon": nothing to save, and
    // whatever was stored before is left as it is.

    // Debug mode
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
