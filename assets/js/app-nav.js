// Main navigation: Home · Explore · Inbox · You.
//
// Network has no tab of its own: it lives in You. "Your Network" and "View
// Network Map" there (profile.js), Home's connections row and every other
// route into Network (AppNav.go('network'), AppNav.openNetwork) still open
// the same page, with You marked current and "‹ You" above its list.
//
// One component at every width. #app-nav is a side bar on desktop and a
// bottom bar on phones and tablets; only CSS differs. This file is its only
// router: it owns the current destination (body[data-destination]) and maps
// each destination onto the existing screens.
//
//   Home, Explore, Network  pages. Desktop uses CommandDashboard's Home and
//                           Network views (Home shows home-view.js's sections,
//                           Explore the Explore list, Network the people list
//                           beside the map); mobile uses MobileNav surfaces.
//                           Network adds "People you met" at every width.
//   Inbox, You              screens: the existing Messages interface
//                           (#messages-modal) and profile (#profile-modal),
//                           shown beside the navigation, never over it. Their
//                           open functions (openMessagesModal,
//                           openProfileModal) call enter(), so every entry
//                           point -- notifications, Message buttons, profile
//                           links -- lands on the right destination. Leaving a
//                           screen hides it and keeps its state (open
//                           conversation, drafts, scroll, profile edits);
//                           sign-out clears it.
//
// Browser history is not touched: Back and notification links behave as
// before, and entity panels (node-panel.js) open over any destination.
(function () {
  'use strict';
  if (window.AppNav) return;

  const PAGES = ['home', 'explore', 'network'];
  const SCREENS = { inbox: 'messages-modal', you: 'profile-modal' };
  const DESTINATIONS = [...PAGES, ...Object.keys(SCREENS)];
  const STORAGE_KEY = 'app-destination';
  // The page content under Inbox and You: not reachable while they show.
  const PAGE_CONTENT = ['main-content', 'mobile-you-screen', 'mobile-header-actions'];
  const isDesktop = () => window.innerWidth >= 1024;

  let current = null;
  let page = null; // the last page, shown again when a screen is left
  let layout = null;

  const nav = () => document.getElementById('app-nav');
  const buttons = () => [...document.querySelectorAll('#app-nav [data-destination]')];

  // Network is part of You, so You stays marked while it shows.
  function mark(page) {
    if (page === 'network') page = 'you';
    buttons().forEach((button) => {
      if (button.dataset.destination === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  // Leaving a screen gives the page content back exactly as it was
  // (MobileNav keeps parts of it unreachable on phones).
  let pageInert = null;
  function setPageInert(inert) {
    if (inert) {
      pageInert = pageInert || {};
      PAGE_CONTENT.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!(id in pageInert)) pageInert[id] = el.inert;
        el.inert = true;
      });
    } else if (pageInert) {
      PAGE_CONTENT.forEach((id) => {
        const el = document.getElementById(id);
        if (el && id in pageInert) el.inert = pageInert[id];
      });
      pageInert = null;
    }
  }

  // Hides a screen without clearing it (window.closeMessagesModal and
  // closeProfileModal leave the destination instead).
  function hideScreen(destination) {
    if (destination === 'inbox') window.hideMessagesModal?.();
    if (destination === 'you') window.hideProfileModal?.();
  }

  // Focus left inside a screen that is going away moves to the navigation.
  function rescueFocus(destination) {
    const screen = document.getElementById(SCREENS[destination]);
    if (screen && screen.contains(document.activeElement)) {
      document.querySelector(`#app-nav [data-destination="${current}"]`)?.focus({ preventScroll: true });
    }
  }

  function setCurrent(destination) {
    current = destination;
    document.body.dataset.destination = destination;
    mark(destination);
    window.dispatchEvent(new CustomEvent('app-destination-changed', { detail: { destination } }));
  }

  // Switching destinations must not leave an overlay that belonged to the
  // previous one on top of the next.
  function leave(previous) {
    window.MobileTaskAssistance?.close?.();
    if (SCREENS[previous]) hideScreen(previous);
  }

  // Inbox and You: called by openMessagesModal and openProfileModal, which
  // then show their screen.
  function enter(destination) {
    if (!SCREENS[destination] || current === destination) return;
    const previous = current;
    leave(previous);
    setCurrent(destination);
    setPageInert(true);
    if (SCREENS[previous]) rescueFocus(previous);
    // Move focus into the screen (its content is focusable once shown).
    window.setTimeout(() => {
      if (current !== destination) return;
      const target = document.querySelector(`#${SCREENS[destination]} .modal-content`);
      if (target && !target.contains(document.activeElement)) target.focus({ preventScroll: true });
    }, 0);
  }

  // "People you met" (nearify-events-panel.js) belongs to Network: the same
  // section under the people list on phones, tablets and desktop.
  async function syncNetworkHistory(page) {
    if (page !== 'network') {
      window.NearifyEventsPanel?.unmount?.();
      return;
    }
    if (!window.NearifyEventsPanel?.mount) {
      try { await import('./nearify-events-panel.js?v=met-once-20261027'); } catch (error) {
        console.warn('[AppNav] People you met is unavailable:', error);
      }
    }
    if (current !== 'network') return;
    await window.NearifyEventsPanel?.mount?.(document.getElementById('cd-explore-body'));
  }

  function showPage(page) {
    if (isDesktop()) {
      window.MobileNav?.reset?.();
      window.CommandDashboard?.setWorkspaceView?.(page === 'network' ? 'network' : 'today');
      // Network lists people; the other resource tabs are Explore's. The
      // list's heading names the page (MobileNav does this on phones).
      if (page === 'network') window.CommandDashboard?.selectResourceTab?.('people');
      const heading = document.querySelector('#cd-explore-toggle span');
      if (heading) heading.textContent = page === 'network' ? 'Your Network' : 'Explore';
      const scroller = document.querySelector('#command-dashboard .cd-scroll-area');
      if (page === 'explore') {
        document.getElementById('centered-search-container')?.scrollIntoView({ block: 'start' });
      } else if (scroller) {
        scroller.scrollTop = 0;
      }
      if (page === 'home') window.HomeView?.show?.();
    } else {
      window.MobileNav?.show?.(page);
    }
    syncNetworkHistory(page);
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
    const previous = current;
    // Back from Inbox or You to the page underneath: it is as it was left
    // (scroll, open sections), not shown afresh.
    const returning = !!SCREENS[previous] && destination === page;
    leave(previous);
    page = destination;
    layout = isDesktop() ? 'desktop' : 'mobile';
    setCurrent(destination);
    setPageInert(false);
    if (SCREENS[previous]) rescueFocus(previous);
    try { sessionStorage.setItem(STORAGE_KEY, destination); } catch (_) {}
    if (!returning) showPage(destination);
  }

  // Your Network (from You, Home and elsewhere): its people and requests, or
  // with map, the network map. Desktop shows the map beside the list; phones
  // and tablets show one or the other.
  function openNetwork({ map = false } = {}) {
    go('network');
    if (isDesktop() || current !== 'network') return;
    if (map) window.MobileNav?.showMap?.();
    else if (document.body.classList.contains('mobile-surface-map')) window.MobileNav?.show?.('network');
  }

  // Closing Inbox or You (their close button on desktop) returns to the page
  // they were opened from.
  function exit(destination) {
    if (current === destination) go(page || 'home');
    else hideScreen(destination);
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
      if (!button || !bar.contains(button)) return;
      // Inbox again, from a conversation, returns to the conversation list.
      if (button.dataset.destination === 'inbox' && current === 'inbox') {
        window.MessagingModule?.showList?.();
        return;
      }
      go(button.dataset.destination);
    });
    // "‹ You" above Your Network's list goes back to You.
    document.getElementById('cd-network-back')?.addEventListener('click', () => go('you'));
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
  // Sign-out: Inbox and You are hidden (Messages and the profile clear
  // their content themselves, in messaging.js and profile.js) and the next
  // sign-in chooses its first page again.
  function hideNav() {
    const bar = nav();
    if (bar) bar.hidden = true;
    document.body.classList.remove('app-nav-visible', 'app-nav-typing');
    Object.keys(SCREENS).forEach(hideScreen);
    setPageInert(false);
    current = null;
    page = null;
    delete document.body.dataset.destination;
    mark(null);
  }

  // The on-screen keyboard: the bottom bar steps aside while a text field in
  // Inbox or You has focus (the composer then sits on the keyboard, as it
  // did before the bar was shown there). CSS limits it to touch screens.
  function isTyping() {
    const el = document.activeElement;
    return !!el && !!el.closest?.('#messages-modal, #profile-modal') &&
      (el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName) ||
        (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|range|color|image)$/i.test(el.type)));
  }
  // It steps aside at once and comes back a moment after the field loses
  // focus, so a tap that took the focus (Send, say) lands before the layout
  // moves.
  let typingTimer = 0;
  function syncTyping() {
    window.clearTimeout(typingTimer);
    if (isTyping()) {
      document.body.classList.add('app-nav-typing');
      return;
    }
    typingTimer = window.setTimeout(() => {
      document.body.classList.toggle('app-nav-typing', isTyping());
    }, 300);
  }

  // Crossing the desktop breakpoint re-applies the current page in the new
  // layout (mobile surfaces vs desktop views).
  function syncLayout() {
    if (!page) return;
    const next = isDesktop() ? 'desktop' : 'mobile';
    if (next === layout) return;
    layout = next;
    // Under Inbox or You the page is laid out again and stays unreachable.
    const covered = !!SCREENS[current];
    if (covered) setPageInert(false);
    showPage(page);
    if (covered) setPageInert(true);
  }

  window.AppNav = {
    go,
    openNetwork,
    enter,
    exit,
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
  document.addEventListener('focusin', syncTyping);
  document.addEventListener('focusout', syncTyping);
  if (window.currentUserProfile?.id) showNav();
})();
