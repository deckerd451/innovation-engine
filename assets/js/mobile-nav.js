// Mobile surfaces for the shared navigation (app-nav.js routes; this file
// only shows the Home, Explore and Network surfaces on phones and tablets).
// Event and Nearby use Nearify-owned context; legacy BLE modules remain
// available to desktop/test surfaces but are not mobile paths.
(() => {
  'use strict';
  if (window.__CH_MOBILE_NAV_LOADED__) return;
  window.__CH_MOBILE_NAV_LOADED__ = true;

  const pages = {
    home: () => {
      setMobileSurface('you');
      window.MobileYou?.show();
      // Preserve the existing lifecycle signal for integrations that use the
      // Today entry as a cue to refresh continuity data.
      window.dispatchEvent(new CustomEvent('mobile-today-entered'));
    },
    explore: () => setDiscoverMode('explore'),
    network: () => setDiscoverMode('network', 'community'),
    // Nearify-context surfaces and theme discovery, kept for their callers
    // (MobileNav.show('event-mode') etc.); not part of the main navigation.
    'event-mode': () => window.NearifyMobileContext?.showEvent(),
    suggestions: () => window.NearifyMobileContext?.showNearby(),
    themes: () => typeof window.openThemeDiscoveryModal === 'function'
      ? window.openThemeDiscoveryModal()
      : alert('Themes are not available yet. Please refresh and try again.'),
  };

  function setDiscoverMode(mode, surface = mode === 'network' ? 'community' : 'discover') {
    window.MobileYou?.hide();
    setMobileSurface(surface);
    const isNetwork = mode === 'network';
    document.body.classList.add('buildspace-view-today');
    document.body.classList.remove('buildspace-view-network');
    window.CommandDashboard?.setWorkspaceView?.('today');
    const dashboard = document.getElementById('command-dashboard');
    dashboard?.classList.add('cd-mobile-panel');
    dashboard?.style.removeProperty('display');
    document.body.classList.toggle('mobile-network-list', isNetwork);
    setMobileMapButton(isNetwork);
    removeMobileRightNow();
    // Network lists people ("People you met" is added by app-nav.js).
    document.querySelector(`[data-resource="${isNetwork ? 'people' : 'themes'}"]`)?.click();
    const toggle = document.getElementById('cd-explore-toggle');
    const browse = document.querySelector('.cd-mobile-browse');
    if (browse) browse.open = true;
    if (toggle) {
      toggle.querySelector('span').textContent = isNetwork ? 'Network' : 'Explore';
      if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
    }
    // Start at the search box, which sits directly above the Explore list.
    (document.getElementById('centered-search-container') || document.getElementById('cd-explore'))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      const unreadMessages = window.UnifiedNotifications?.getUnreadMessages?.() || [];
      const topMessage = unreadMessages[0] || null;
      const peopleCount = document.querySelector('[data-count-for="people"]')?.textContent?.trim();
      const opportunityCount = document.querySelector('[data-count-for="opportunities"]')?.textContent?.trim();
      const hasPeople = peopleCount && Number.parseInt(peopleCount, 10) > 0;
      const hasOpportunities = opportunityCount && Number.parseInt(opportunityCount, 10) > 0;
      const firstIntent = intents[0]?.subject_label || '';
      const action = unread > 0 ? 'messages' : '';
      const headline = unread > 0
        ? (topMessage?.preview || `${unread} conversation${unread === 1 ? '' : 's'} waiting for you`)
        : intents.length
          ? `Find a useful connection around ${firstIntent}`
          : 'Give Buildspace one thing to work with';
      const copy = unread > 0
        ? `${unread} unread ${unread === 1 ? 'message' : 'messages'} · Reply while the context is fresh.`
        : intents.length
          ? 'Your focus is shared with people who may fit.'
          : 'Share what you need or can offer, and your suggestions get sharper.';
      const actionLabel = unread > 0 ? 'Open messages' : '';
      const countCopy = hasPeople || hasOpportunities
        ? `${hasPeople ? `${escape(peopleCount)} people` : ''}${hasPeople && hasOpportunities ? ' · ' : ''}${hasOpportunities ? `${escape(opportunityCount)} opportunities` : ''}`
        : '';
      const community = hasPeople || hasOpportunities || intents.length
        ? `<details class="cd-mobile-secondary-links"><summary>Community around you</summary><div class="cd-mobile-secondary-links-body">${rows || '<span>See who can help with your current focus.</span>'}${countCopy ? `<span>${countCopy}</span>` : ''}<button type="button" data-mobile-today-action="people">Find people</button></div></details>`
        : '';
      card.innerHTML = `<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Today</div>
        <div class="cd-mobile-greeting">${escape(greeting)}${name ? `, ${escape(name)}` : ''}</div>
        <div class="cd-mobile-next-headline">${escape(headline)}</div>
        <p class="cd-mobile-context-copy">${escape(copy)}</p>
        ${unread > 0 ? `<button type="button" class="cd-mobile-context-action" data-mobile-today-action="${action}">${escape(actionLabel)} <span aria-hidden="true">→</span></button>` : community}`;
      card.querySelectorAll('[data-mobile-today-action]').forEach((button) => button.addEventListener('click', (event) => {
        const nextAction = event.currentTarget.dataset.mobileTodayAction;
        if (nextAction === 'messages') {
          window.AppNav?.go?.('inbox');
        } else if (nextAction === 'people') {
          window.AppNav?.go?.('network');
        } else {
          window.openProfileModal?.();
          window.setTimeout(() => {
            const intentCard = document.querySelector('#profile-modal .ch-right-now-card');
            intentCard?.classList.add('mobile-intent-editor-open');
            intentCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }
      }));
    } catch (error) {
      console.warn('[MobileNav] current intent load failed:', error);
      card.innerHTML = '<div class="cd-mobile-context-eyebrow" id="cd-mobile-right-now-title">Right now</div><div class="cd-mobile-intent-empty">Your current focus is unavailable. You can update it from You.</div>';
    }
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

  function setMobileSurface(surface) {
    const surfaces = ['today', 'discover', 'community', 'you'];
    surfaces.forEach((name) => document.body.classList.toggle(`mobile-surface-${name}`, name === surface));
    const dashboard = document.getElementById('command-dashboard');
    const focus = document.getElementById('cd-focus');
    const explore = document.getElementById('cd-explore');
    const you = document.getElementById('mobile-you-screen');
    const graph = document.getElementById('synapse-main-view');
    if (dashboard) dashboard.dataset.mobileSurface = surface;
    if (graph) graph.dataset.mobileSurface = surface;
    if (you) you.dataset.mobileSurface = surface;
    if (dashboard) dashboard.inert = surface === 'you';
    if (you) { you.inert = surface !== 'you'; you.setAttribute('aria-hidden', surface === 'you' ? 'false' : 'true'); }
    if (focus) focus.inert = surface === 'discover' || surface === 'community';
    if (explore) explore.inert = surface !== 'discover' && surface !== 'community';
  }

  // Desktop layout (app-nav.js, on crossing the breakpoint): drop the phone
  // and tablet surface state so it cannot hide, disable or filter desktop
  // content.
  function reset() {
    ['today', 'discover', 'community', 'you'].forEach((name) => document.body.classList.remove(`mobile-surface-${name}`));
    document.body.classList.remove('mobile-network-list');
    window.MobileYou?.hide?.();
    const dashboard = document.getElementById('command-dashboard');
    dashboard?.classList.remove('cd-mobile-panel');
    ['command-dashboard', 'cd-focus', 'cd-explore'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.inert = false;
    });
    const you = document.getElementById('mobile-you-screen');
    if (you) { you.inert = true; you.setAttribute('aria-hidden', 'true'); }
    setMobileMapButton(false);
  }

  window.MobileNav = {
    reset,
    show(page) {
      if (['home', 'explore', 'network'].includes(page)) {
        // Leaving the Network map (opened with "View map") returns to the
        // list surfaces; the map is the desktop Network view.
        window.CommandDashboard?.setWorkspaceView?.('today');
      }
      pages[page]?.();
    },
  };
  window.addEventListener('profile-loaded', () => {
    if (document.body.classList.contains('mobile-surface-you')) window.MobileYou?.refresh?.();
  });
  window.addEventListener('total-unread-messages-updated', () => {
    if (document.body.classList.contains('mobile-surface-you')) window.MobileYou?.refresh?.();
  });
})();
