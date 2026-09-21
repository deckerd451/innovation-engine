// Mobile navigation. Event and Nearby use Nearify-owned context; legacy BLE
// modules remain available to desktop/test surfaces but are not mobile paths.
(() => {
  'use strict';
  if (window.__CH_MOBILE_NAV_LOADED__ || window.innerWidth >= 1024) return;
  window.__CH_MOBILE_NAV_LOADED__ = true;

  const tabs = {
    'event-mode': () => window.NearifyMobileContext?.showEvent(),
    suggestions: () => window.NearifyMobileContext?.showNearby(),
    themes: () => typeof window.openThemeDiscoveryModal === 'function'
      ? window.openThemeDiscoveryModal()
      : alert('Themes are not available yet. Please refresh and try again.'),
    messages: () => window.UnifiedNotifications?.showPanel
      ? window.UnifiedNotifications.showPanel('actions')
      : window.openMessagesModal?.(),
    profile: showMobileProfileSheet,
  };

  function showMobileProfileSheet() {
    if (typeof window.openProfileModal !== 'function') return;
    window.openProfileModal();
    setTimeout(() => {
      const button = document.getElementById('logout-btn');
      if (!button || window.innerWidth >= 1024) return;
      const replacement = button.cloneNode(true);
      button.parentNode.replaceChild(replacement, button);
      replacement.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation(); showMobileLogoutConfirm();
      });
    }, 100);
  }

  function showMobileLogoutConfirm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10002;display:flex;align-items:center;justify-content:center;padding:1rem;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:linear-gradient(135deg,rgba(10,14,39,.98),rgba(16,20,39,.98));border:2px solid rgba(255,107,107,.4);border-radius:16px;padding:1.5rem;max-width:350px;width:100%;';
    modal.innerHTML = '<h3 style="color:#ff6b6b;margin:0 0 1rem;font-size:1.25rem;"><i class="fas fa-sign-out-alt"></i> Logout?</h3><p style="color:#ddd;margin:0 0 1.5rem;font-size:.9rem;">Are you sure you want to logout?</p><div style="display:flex;gap:.5rem;"><button id="logout-cancel" style="flex:1;padding:.75rem;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;font-weight:600;">Cancel</button><button id="logout-confirm" style="flex:1;padding:.75rem;background:rgba(255,107,107,.2);border:1px solid rgba(255,107,107,.4);border-radius:8px;color:#ff6b6b;font-weight:700;">Logout</button></div>';
    overlay.appendChild(modal); document.body.appendChild(overlay);
    modal.querySelector('#logout-cancel').onclick = () => overlay.remove();
    modal.querySelector('#logout-confirm').onclick = () => { overlay.remove(); window.doLogout?.(); };
    overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
  }

  function wire() {
    document.querySelectorAll('.mob-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => tabs[button.dataset.tab]?.());
    });
    const source = document.getElementById('cd-messages-badge');
    const target = document.getElementById('mob-tab-messages-badge');
    if (source && target) {
      const sync = () => { const hidden = source.style.display === 'none' || !source.textContent.trim(); target.style.display = hidden ? 'none' : ''; target.textContent = source.textContent; };
      new MutationObserver(sync).observe(source, { attributes: true, childList: true, characterData: true }); sync();
    }
  }
  window.addEventListener('resize', () => { const bar = document.getElementById('mobile-tab-bar'); if (bar) bar.style.display = window.innerWidth >= 1024 ? 'none' : ''; }, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
