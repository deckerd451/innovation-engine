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
    discover: () => setDiscoverMode('explore'),
    // Kept as an internal compatibility path for existing callers; Network
    // is now a mode inside Discover rather than a separate destination.
    network: () => setDiscoverMode('network'),
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

  function setDiscoverMode(mode) {
    const isNetwork = mode === 'network';
    document.body.classList.add('buildspace-view-today');
    document.body.classList.remove('buildspace-view-network');
    window.CommandDashboard?.setWorkspaceView?.('today');
    const dashboard = document.getElementById('command-dashboard');
    dashboard?.classList.add('cd-mobile-panel');
    dashboard?.style.removeProperty('display');
    ensureDiscoverModeControl();
    document.body.classList.toggle('mobile-network-list', isNetwork);
    setMobileMapButton(isNetwork);
    removeMobileRightNow();
    if (isNetwork) {
      document.querySelector('[data-resource="people"]')?.click();
      renderMobileNetworkHistory();
    } else {
      removeMobileNetworkHistory();
      document.querySelector('[data-resource="themes"]')?.click();
    }
    const toggle = document.getElementById('cd-explore-toggle');
    if (toggle) {
      toggle.querySelector('span').textContent = isNetwork ? 'My network' : 'Discover';
      if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
    }
    updateDiscoverModeControl(isNetwork ? 'network' : 'explore');
    document.getElementById('cd-explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateDiscoverModeControl(mode) {
    const control = document.getElementById('cd-mobile-discover-mode');
    if (!control) return;
    control.querySelectorAll('button[data-discover-mode]').forEach((button) => {
      const active = button.dataset.discoverMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function ensureDiscoverModeControl() {
    const explore = document.getElementById('cd-explore');
    const row = explore?.querySelector('.cd-section-toggle-row');
    if (!row || document.getElementById('cd-mobile-discover-mode')) return;
    const control = document.createElement('div');
    control.id = 'cd-mobile-discover-mode';
    control.className = 'cd-mobile-discover-mode';
    control.setAttribute('role', 'tablist');
    control.innerHTML = '<button type="button" role="tab" data-discover-mode="explore" aria-selected="true">Discover</button><button type="button" role="tab" data-discover-mode="network" aria-selected="false">My network</button>';
    control.querySelectorAll('button[data-discover-mode]').forEach((button) => {
      button.addEventListener('click', () => setDiscoverMode(button.dataset.discoverMode));
    });
    row.parentNode.insertBefore(control, row);
  }

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
      const profile = window.currentUserProfile || {};
      const name = String(profile.full_name || profile.name || profile.username || '').trim().split(/\s+/)[0];
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const unreadBadge = document.getElementById('cd-messages-badge');
      const unread = Number.parseInt(unreadBadge?.textContent || '0', 10) || 0;
      const peopleCount = document.querySelector('[data-count-for="people"]')?.textContent?.trim();
      const opportunityCount = document.querySelector('[data-count-for="opportunities"]')?.textContent?.trim();
      const hasPeople = peopleCount && Number.parseInt(peopleCount, 10) > 0;
      const hasOpportunities = opportunityCount && Number.parseInt(opportunityCount, 10) > 0;
      const firstIntent = intents[0]?.subject_label || '';
      const action = unread > 0 ? 'messages' : intents.length ? 'people' : 'profile-intent';
      const headline = unread > 0
        ? `${unread} conversation${unread === 1 ? '' : 's'} waiting for you`
        : intents.length
          ? `Find a useful connection around ${firstIntent}`
          : 'Give Buildspace one thing to work with';
      const copy = unread > 0
        ? 'A reply is the fastest way to keep momentum.'
        : intents.length
          ? 'Your focus is shared with people who may fit.'
          : 'Share what you need or can offer, and your suggestions get sharper.';
      const actionLabel = unread > 0 ? 'Open messages' : intents.length ? 'Find people' : 'Set your focus';
      const counts = hasPeople || hasOpportunities
        ? `<div class="cd-mobile-brief-meta">${hasPeople ? `${escape(peopleCount)} people` : ''}${hasPeople && hasOpportunities ? ' · ' : ''}${hasOpportunities ? `${escape(opportunityCount)} opportunities` : ''}</div>`
        : '';
      card.innerHTML = `<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Today</div>
        <div class="cd-mobile-greeting">${escape(greeting)}${name ? `, ${escape(name)}` : ''}</div>
        <div class="cd-mobile-next-headline">${escape(headline)}</div>
        <p class="cd-mobile-context-copy">${escape(copy)}</p>
        ${rows ? `<div class="cd-mobile-intent-list">${rows}</div>` : ''}
        ${counts}
        <button type="button" class="cd-mobile-context-action" data-mobile-today-action="${action}">${escape(actionLabel)} <span aria-hidden="true">→</span></button>`;
      card.querySelector('[data-mobile-today-action]')?.addEventListener('click', (event) => {
        const nextAction = event.currentTarget.dataset.mobileTodayAction;
        if (nextAction === 'messages') {
          tabs.messages();
        } else if (nextAction === 'people') {
          setDiscoverMode('network');
          document.querySelector('[data-resource="people"]')?.click();
        } else {
          window.openProfileModal?.();
          window.setTimeout(() => {
            const intentCard = document.querySelector('#profile-modal .ch-right-now-card');
            intentCard?.classList.add('mobile-intent-editor-open');
            intentCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }
      });
    } catch (error) {
      console.warn('[MobileNav] current intent load failed:', error);
      card.innerHTML = '<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Right now</div><div class="cd-mobile-intent-empty">Your current focus is unavailable. You can update it from You.</div>';
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
        document.body.classList.forEach((className) => {
          if (className.startsWith('mobile-tab-')) document.body.classList.remove(className);
        });
        document.body.classList.add(`mobile-tab-${button.dataset.tab}`);
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
      const activeTab = document.querySelector('.mob-tab[data-tab].active')?.dataset.tab || 'home';
      document.body.classList.forEach((className) => {
        if (className.startsWith('mobile-tab-')) document.body.classList.remove(className);
      });
      document.body.classList.add(`mobile-tab-${activeTab}`);
      if (document.querySelector('.mob-tab[data-tab="home"].active')) renderMobileRightNow();
    }
  }
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  window.addEventListener('profile-loaded', () => {
    if (document.querySelector('.mob-tab[data-tab="home"].active')) renderMobileRightNow();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  syncViewport();
})();
