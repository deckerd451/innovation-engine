// Main navigation: Home · Explore · Network · Inbox · You.
//
// One component at every width. #app-nav is a side bar on desktop and a
// bottom bar on phones and tablets; only CSS differs. This file is its only
// router: it owns the current destination (body[data-destination]) and maps
// each destination onto the existing screens.
//
//   Home, Explore, Network  pages. Desktop uses CommandDashboard's Home and
//                           Network views (Explore is the Home view without
//                           the focus cards); mobile uses MobileNav surfaces.
//   Inbox                   opens the existing Messages interface.
//   You                     opens the existing profile interface.
//
// Browser history is not touched: Back and notification links behave as
// before, and entity panels (node-panel.js) open over any destination.
(function () {
  'use strict';
  if (window.AppNav) return;

  const PAGES = ['home', 'explore', 'network'];
  const DESTINATIONS = [...PAGES, 'inbox', 'you'];
  const STORAGE_KEY = 'app-destination';
  const isDesktop = () => window.innerWidth >= 1024;

  let current = null;
  let layout = null;

  const nav = () => document.getElementById('app-nav');
  const buttons = () => [...document.querySelectorAll('#app-nav [data-destination]')];
  const isShown = (id) => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  };

  function mark(page) {
    buttons().forEach((button) => {
      if (button.dataset.destination === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  // Switching pages must not leave an overlay that belonged to the previous
  // one on top of the next.
  function closeOverlays() {
    window.MobileTaskAssistance?.close?.();
    if (isShown('messages-modal')) window.closeMessagesModal?.();
    if (isShown('profile-modal')) window.closeProfileModal?.();
  }

  function showPage(page) {
    if (isDesktop()) {
      window.MobileYou?.hide?.();
      window.CommandDashboard?.setWorkspaceView?.(page === 'network' ? 'network' : 'today');
      const scroller = document.querySelector('#command-dashboard .cd-scroll-area');
      if (page === 'explore') {
        document.getElementById('centered-search-container')?.scrollIntoView({ block: 'start' });
      } else if (scroller) {
        scroller.scrollTop = 0;
      }
    } else {
      window.MobileNav?.show?.(page);
    }
  }

  function go(destination) {
    if (!DESTINATIONS.includes(destination)) return;
    if (destination === 'inbox') {
      if (typeof window.openMessagesModal === 'function') window.openMessagesModal();
      else window.openMessagingInterface?.();
      return;
    }
    if (destination === 'you') {
      window.openProfileModal?.();
      return;
    }
    closeOverlays();
    current = destination;
    layout = isDesktop() ? 'desktop' : 'mobile';
    document.body.dataset.destination = destination;
    mark(destination);
    try { sessionStorage.setItem(STORAGE_KEY, destination); } catch (_) {}
    showPage(destination);
    window.dispatchEvent(new CustomEvent('app-destination-changed', { detail: { destination } }));
  }

  // Desktop restores the last page this session (as the Home | Network
  // switcher did); phones and tablets always open on Home.
  function initialDestination() {
    if (!isDesktop()) return 'home';
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (PAGES.includes(saved)) return saved;
      if (sessionStorage.getItem('buildspace-view') === 'network') return 'network';
    } catch (_) {}
    return 'home';
  }

  function setUnread(count) {
    const badge = document.getElementById('app-nav-inbox-badge');
    const inbox = document.querySelector('#app-nav [data-destination="inbox"]');
    const n = Math.max(0, parseInt(count, 10) || 0);
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? '99+' : String(n);
    }
    inbox?.setAttribute('aria-label', n ? `Inbox, ${n} unread` : 'Inbox');
  }

  function wire() {
    const bar = nav();
    if (!bar || bar.dataset.wired === 'true') return;
    bar.dataset.wired = 'true';
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-destination]');
      if (button && bar.contains(button)) go(button.dataset.destination);
    });
    // Arrow keys move between destinations (left/right on the bottom bar,
    // up/down on the side bar); Enter or Space activates as for any button.
    bar.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in keys)) return;
      const all = buttons();
      const index = all.indexOf(document.activeElement);
      if (index < 0) return;
      all[(index + keys[event.key] + all.length) % all.length].focus();
      event.preventDefault();
    });
  }

  // The navigation appears with the signed-in app and goes away on sign-out.
  function showNav() {
    const bar = nav();
    if (!bar) return;
    bar.hidden = false;
    document.body.classList.add('app-nav-visible');
    if (!current) go(initialDestination());
  }
  function hideNav() {
    const bar = nav();
    if (bar) bar.hidden = true;
    document.body.classList.remove('app-nav-visible');
  }

  // Crossing the desktop breakpoint re-applies the current page in the new
  // layout (mobile surfaces vs desktop views).
  function syncLayout() {
    if (!current) return;
    const next = isDesktop() ? 'desktop' : 'mobile';
    if (next === layout) return;
    layout = next;
    showPage(current);
  }

  window.AppNav = {
    go,
    current: () => current,
    destinations: DESTINATIONS.slice(),
    setUnread,
  };

  wire();
  window.addEventListener('app-ready', showNav);
  window.addEventListener('profile-loaded', showNav);
  window.addEventListener('user-logged-out', hideNav);
  window.addEventListener('total-unread-messages-updated', (event) => setUnread(event.detail?.count));
  window.addEventListener('resize', syncLayout, { passive: true });
  window.addEventListener('orientationchange', syncLayout, { passive: true });
  if (window.currentUserProfile?.id) showNav();
})();
