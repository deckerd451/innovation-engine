// ================================================================
// SETTINGS MODAL
// ================================================================
// Provides a real settings UI for all users:
//   - Quiet Mode toggle
//   - Language selector
//   - Notification preferences
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
    const curLang   = (typeof window.getCurrentLanguage === 'function')
                        ? window.getCurrentLanguage()
                        : getSetting('preferred_language', 'en');
    const notifPush = getSetting('push-notifications-enabled', 'false') === 'true';
    const notifEmail= getSetting('email-notifications-enabled', 'true') === 'true';

    const langOptions = LANGUAGES.map(l =>
      `<option value="${l.code}" ${l.code === curLang ? 'selected' : ''}>${l.flag} ${l.label}</option>`
    ).join('');

    return `
      <div id="settings-modal-overlay" style="
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
      ">
        <div id="settings-modal" style="
          background: linear-gradient(135deg, #0a0f1e 0%, #0d1529 100%);
          border: 1px solid rgba(0,224,255,0.25);
          border-radius: 16px; width: 100%; max-width: 480px;
          max-height: 90vh; overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,224,255,0.1);
        ">
          <!-- Header -->
          <div style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 1.5rem 1.5rem 1rem;
            border-bottom: 1px solid rgba(0,224,255,0.1);
          ">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #00e0ff; font-size: 1rem;
              "><i class="fas fa-cog"></i></div>
              <span style="color: #fff; font-size: 1.2rem; font-weight: 700;">Settings</span>
            </div>
            <button id="settings-close-btn" style="
              background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
              color: rgba(255,255,255,0.7); width: 34px; height: 34px;
              border-radius: 50%; cursor: pointer; font-size: 1rem;
              display: flex; align-items: center; justify-content: center;
            "><i class="fas fa-times"></i></button>
          </div>

          <!-- Body -->
          <div style="padding: 1.25rem 1.5rem; display: grid; gap: 1.5rem;">

            <!-- Display -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">
                <i class="fas fa-eye"></i>&nbsp; Display
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

            <!-- Language -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">
                <i class="fas fa-globe"></i>&nbsp; Language
              </div>
              <div style="
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; padding: 0.85rem 1rem;
              ">
                <select id="settings-language" style="
                  width: 100%; background: transparent; border: none; color: #fff;
                  font-size: 0.95rem; cursor: pointer; outline: none; appearance: none;
                ">${langOptions}</select>
              </div>
            </section>

            <!-- Notifications -->
            <section>
              <div style="color: #00e0ff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">
                <i class="fas fa-bell"></i>&nbsp; Notifications
              </div>
              <div style="display: grid; gap: 0.5rem;">
                <label style="
                  display: flex; align-items: center; justify-content: space-between;
                  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                  border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
                ">
                  <div>
                    <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Email Notifications</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                      Receive updates via email
                    </div>
                  </div>
                  <input type="checkbox" id="settings-email-notif" ${notifEmail ? 'checked' : ''} style="
                    width: 20px; height: 20px; accent-color: #00e0ff; cursor: pointer; flex-shrink: 0;
                  ">
                </label>
                <label style="
                  display: flex; align-items: center; justify-content: space-between;
                  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                  border-radius: 10px; padding: 0.85rem 1rem; cursor: pointer;
                ">
                  <div>
                    <div style="color: #fff; font-size: 0.95rem; font-weight: 600;">Push Notifications</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-top: 0.2rem;">
                      Browser push alerts when you have new activity
                    </div>
                  </div>
                  <input type="checkbox" id="settings-push-notif" ${notifPush ? 'checked' : ''} style="
                    width: 20px; height: 20px; accent-color: #00e0ff; cursor: pointer; flex-shrink: 0;
                  ">
                </label>
              </div>
            </section>

            <!-- Developer -->
            <section>
              <div style="color: rgba(255,255,255,0.3); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">
                <i class="fas fa-code"></i>&nbsp; Developer
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
            padding: 1rem 1.5rem;
            border-top: 1px solid rgba(0,224,255,0.1);
            display: flex; gap: 0.75rem; justify-content: flex-end;
          ">
            <button id="settings-save-btn" style="
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
  function open() {
    if (document.getElementById('settings-modal-overlay')) return; // already open
    const div = document.createElement('div');
    div.innerHTML = buildModal();
    document.body.appendChild(div.firstElementChild);
    wireEvents();
  }

  function close() {
    const overlay = document.getElementById('settings-modal-overlay');
    if (overlay) overlay.remove();
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

    // Language
    const langEl = document.getElementById('settings-language');
    if (langEl && typeof window.setLanguage === 'function') {
      window.setLanguage(langEl.value);
    } else if (langEl) {
      setSetting('preferred_language', langEl.value);
    }

    // Email notifications
    const emailEl = document.getElementById('settings-email-notif');
    if (emailEl) setSetting('email-notifications-enabled', emailEl.checked ? 'true' : 'false');

    // Push notifications
    const pushEl = document.getElementById('settings-push-notif');
    if (pushEl) setSetting('push-notifications-enabled', pushEl.checked ? 'true' : 'false');

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
  // Keyboard close
  // ----------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('settings-modal-overlay')) close();
  });

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.SettingsModal = { open, close };

})();
