// Mobile navigation. Event and Nearby use Nearify-owned context; legacy BLE
// modules remain available to desktop/test surfaces but are not mobile paths.
(() => {
  'use strict';
  if (window.__CH_MOBILE_NAV_LOADED__) return;
  window.__CH_MOBILE_NAV_LOADED__ = true;

  const tabs = {
    home: () => {
      // Restore the view classes immediately so Home works even if the
      // dashboard module is still recovering from a delayed load.
      document.body.classList.add('buildspace-view-today');
      document.body.classList.remove('buildspace-view-network');
      window.CommandDashboard?.setWorkspaceView?.('today');
      const dashboard = document.getElementById('command-dashboard');
      dashboard?.classList.remove('cd-mobile-panel');
      dashboard?.style.removeProperty('display');
      document.body.classList.remove('mobile-network-list');
      setMobileMapButton(false);
      document.getElementById('cd-panel-tab')?.focus();
    },
    explore: () => {
      document.body.classList.add('buildspace-view-today');
      document.body.classList.remove('buildspace-view-network');
      window.CommandDashboard?.setWorkspaceView?.('today');
      const dashboard = document.getElementById('command-dashboard');
      dashboard?.classList.add('cd-mobile-panel');
      dashboard?.style.removeProperty('display');
      document.body.classList.remove('mobile-network-list');
      setMobileMapButton(false);
      document.querySelector('[data-resource="people"]')?.click();
      const exploreToggle = document.getElementById('cd-explore-toggle');
      if (exploreToggle) exploreToggle.querySelector('span').textContent = 'Explore';
      const toggle = document.getElementById('cd-explore-toggle');
      if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
      document.getElementById('cd-explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    network: () => {
      // Mobile Network opens as a readable people list. The existing graph
      // remains available through the explicit View map action.
      document.body.classList.add('buildspace-view-today');
      document.body.classList.remove('buildspace-view-network');
      window.CommandDashboard?.setWorkspaceView?.('today');
      const dashboard = document.getElementById('command-dashboard');
      dashboard?.classList.add('cd-mobile-panel');
      dashboard?.style.removeProperty('display');
      document.body.classList.add('mobile-network-list');
      document.querySelector('[data-resource="people"]')?.click();
      const toggle = document.getElementById('cd-explore-toggle');
      if (toggle) {
        toggle.querySelector('span').textContent = 'Network';
        if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
      }
      setMobileMapButton(true);
      document.getElementById('cd-explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
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

  function setMobileMapButton(show) {
    const row = document.querySelector('#cd-explore .cd-section-toggle-row');
    if (!row) return;
    let button = document.getElementById('cd-mobile-view-map');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'cd-mobile-view-map';
      button.className = 'cd-mobile-view-map';
      button.innerHTML = '<i class="fas fa-project-diagram" aria-hidden="true"></i><span>View map</span>';
      button.addEventListener('click', () => {
        window.CommandDashboard?.setWorkspaceView?.('network');
        document.getElementById('command-dashboard')?.classList.remove('cd-mobile-panel');
        document.body.classList.remove('mobile-network-list');
        button.hidden = true;
      });
      row.appendChild(button);
    }
    button.hidden = !show;
  }

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
      if (button.dataset.mobileNavWired === 'true') return;
      button.dataset.mobileNavWired = 'true';
      button.addEventListener('click', () => {
        document.querySelectorAll('.mob-tab[data-tab]').forEach((tab) => {
          const active = tab === button;
          tab.classList.toggle('active', active);
          if (active) tab.setAttribute('aria-current', 'page');
          else tab.removeAttribute('aria-current');
        });
        tabs[button.dataset.tab]?.();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const all = [...document.querySelectorAll('.mob-tab[data-tab]')];
        const next = all[(all.indexOf(button) + (event.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
        next?.focus();
        event.preventDefault();
      });
    });
  }
  function syncViewport() {
    const bar = document.getElementById('mobile-tab-bar');
    if (bar) bar.style.display = window.innerWidth >= 1024 ? 'none' : '';
    if (window.innerWidth < 1024) wire();
  }
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  syncViewport();
})();
