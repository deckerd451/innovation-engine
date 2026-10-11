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
      removeMobileNetworkHistory();
      renderMobileRightNow();
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
      removeMobileRightNow();
      removeMobileNetworkHistory();
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
      removeMobileRightNow();
      renderMobileNetworkHistory();
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

  const escape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function removeMobileRightNow() {
    document.getElementById('cd-mobile-right-now')?.remove();
  }

  async function renderMobileRightNow() {
    if (window.innerWidth >= 1024) return;
    const focus = document.getElementById('cd-focus');
    if (!focus) return;
    let card = document.getElementById('cd-mobile-right-now');
    if (!card) {
      card = document.createElement('section');
      card.id = 'cd-mobile-right-now';
      card.className = 'cd-mobile-context-card';
      card.setAttribute('aria-labelledby', 'cd-mobile-right-now-title');
      focus.appendChild(card);
    }
    card.innerHTML = '<div class="cd-mobile-context-loading">Reading your current intent…</div>';
    const client = window.supabase;
    if (!client) return;
    try {
      const { data, error } = await client.rpc('get_my_community_intents');
      if (error) throw error;
      const intents = Array.isArray(data?.intents) ? data.intents.filter((item) => item?.active) : [];
      const rows = intents.map((item) => {
        const label = item.intent_type === 'offering' ? 'Can help with' : 'Looking for';
        return `<div class="cd-mobile-intent-row"><span>${escape(label)}</span><strong>${escape(item.subject_label || 'Something useful')}</strong></div>`;
      }).join('');
      card.innerHTML = `<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Right now</div>
        <p class="cd-mobile-context-copy">Your current focus helps the right people find you.</p>
        <div class="cd-mobile-intent-list">${rows || '<div class="cd-mobile-intent-empty">Nothing shared yet. Add a focus from your profile.</div>'}</div>
        <button type="button" class="cd-mobile-context-link" data-open-profile-intent>Update in Profile</button>`;
      card.querySelector('[data-open-profile-intent]')?.addEventListener('click', () => {
        window.openProfileModal?.();
        window.setTimeout(() => {
          const intentCard = document.querySelector('#profile-modal .ch-right-now-card');
          intentCard?.classList.add('mobile-intent-editor-open');
          intentCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      });
    } catch (error) {
      console.warn('[MobileNav] current intent load failed:', error);
      card.innerHTML = '<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Right now</div><div class="cd-mobile-intent-empty">Your current focus is unavailable. You can update it from Profile.</div>';
    }
  }

  function removeMobileNetworkHistory() {
    document.getElementById('cd-mobile-network-history')?.remove();
  }

  async function renderMobileNetworkHistory() {
    if (window.innerWidth >= 1024) return;
    const host = document.getElementById('cd-explore-body');
    if (!host) return;
    if (!window.NearifyEventsPanel?.render) {
      try { await import('./nearify-events-panel.js?v=1'); } catch (error) {
        console.warn('[MobileNav] event history module unavailable:', error);
      }
    }
    if (!window.NearifyEventsPanel?.render) return;
    removeMobileNetworkHistory();
    const section = document.createElement('section');
    section.id = 'cd-mobile-network-history';
    section.className = 'cd-mobile-network-history';
    section.setAttribute('aria-label', 'People you met');
    section.innerHTML = window.NearifyEventsPanel.render();
    host.appendChild(section);
    await window.NearifyEventsPanel.init(section);
  }

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
    if (window.innerWidth < 1024) {
      wire();
      if (document.querySelector('.mob-tab[data-tab="home"].active')) renderMobileRightNow();
    }
  }
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  syncViewport();
})();
