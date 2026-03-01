// ================================================================
// MOBILE BOTTOM TAB BAR
// ================================================================
// Wires up the #mobile-tab-bar buttons to app actions.
// Only active on <1024px. Does nothing on desktop.
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_MOBILE_NAV_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // Only active on mobile
  if (window.innerWidth >= 1024) return;

  // Re-check on resize (e.g., orientation change)
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      document.getElementById('mobile-tab-bar')?.style && (document.getElementById('mobile-tab-bar').style.display = 'none');
    }
  }, { passive: true });

  // ── Tab definitions ────────────────────────────────────────────
  const TABS = {
    network: {
      activate() {
        // Show the graph view (default state) — scroll to top of page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // If synapse view is hidden (split-view mode), restore it
        const sv = document.getElementById('synapse-main-view');
        if (sv) sv.style.display = '';
      }
    },
    people: {
      activate() {
        // Open the Explore section in the command dashboard (people tab)
        const exploreToggle = document.getElementById('cd-explore-toggle');
        if (exploreToggle && exploreToggle.getAttribute('aria-expanded') === 'false') {
          exploreToggle.click();
        }
        // Switch to People resource tab
        const peopleTab = document.querySelector('[data-resource="people"]');
        if (peopleTab) peopleTab.click();
        // Scroll dashboard into view on mobile split mode
        const dashboard = document.getElementById('command-dashboard');
        if (dashboard) dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    start: {
      activate() {
        // Open the daily brief / START modal
        if (typeof window.openStartModal === 'function') {
          window.openStartModal();
        } else if (window.StartDailyDigest?.show) {
          window.StartDailyDigest.show();
        } else {
          // Fallback: click the hidden start button
          document.getElementById('btn-start-nav')?.click() ||
          document.getElementById('btn-start-center')?.click();
        }
        // Don't mark as active — it's a modal, not a destination
        return false;
      }
    },
    messages: {
      activate() {
        if (window.UnifiedNotifications?.showPanel) {
          window.UnifiedNotifications.showPanel();
        } else if (typeof window.openMessagesModal === 'function') {
          window.openMessagesModal();
        }
        return false; // modal, not a destination
      }
    },
    profile: {
      activate() {
        if (typeof window.openProfileModal === 'function') {
          window.openProfileModal();
        }
        return false; // modal, not a destination
      }
    },
  };

  // ── Active state ───────────────────────────────────────────────
  let _active = 'network';

  function setActive(tab) {
    _active = tab;
    document.querySelectorAll('.mob-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  // ── Wire buttons ───────────────────────────────────────────────
  function wire() {
    document.querySelectorAll('.mob-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        const def = TABS[tab];
        if (!def) return;
        const result = def.activate();
        // activate() returns false for modals (don't change active highlight)
        if (result !== false) setActive(tab);
      });
    });
    setActive('network');
  }

  // ── Badge sync: mirror the bell badge onto the messages tab ───
  function syncBadge() {
    const bellBadge = document.getElementById('cd-bell-badge');
    const tabBadge  = document.getElementById('mob-tab-messages-badge');
    if (!bellBadge || !tabBadge) return;

    const observer = new MutationObserver(() => {
      const hidden = bellBadge.style.display === 'none' || !bellBadge.textContent.trim();
      tabBadge.style.display = hidden ? 'none' : '';
      tabBadge.textContent   = bellBadge.textContent;
    });
    observer.observe(bellBadge, { attributes: true, childList: true, characterData: true });
    // Initial sync
    const hidden = bellBadge.style.display === 'none';
    tabBadge.style.display = hidden ? 'none' : '';
    tabBadge.textContent   = bellBadge.textContent;
  }

  // ── Init (after DOM ready) ─────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wire(); syncBadge(); });
  } else {
    wire();
    // Badge sync needs the bell to be populated first
    setTimeout(syncBadge, 500);
  }

})();
