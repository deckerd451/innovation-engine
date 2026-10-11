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
