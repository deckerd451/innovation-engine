// ================================================================
// COMMAND DASHBOARD — Collapsible Panel
// ================================================================
// Adds a toggle tab to the right edge of the command dashboard.
// Panel opens automatically on every new login (profile-loaded event).
// State persisted in sessionStorage (clears when browser/tab closes).
// Desktop only (≥ 1024px).
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CD_PANEL_COLLAPSE_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // Desktop only
  if (window.innerWidth < 1024) return;
  window.addEventListener('resize', () => {
    if (window.innerWidth < 1024) {
      // Remove collapsed state on mobile breakpoint
      document.body.classList.remove('panel-collapsed');
    }
  }, { passive: true });

  const STORAGE_KEY = 'cdPanelCollapsed';

  // ── State management ───────────────────────────────────────────

  function setCollapsed(collapsed) {
    const icon = document.getElementById('cd-panel-tab-icon');
    const tab  = document.getElementById('cd-panel-tab');

    if (collapsed) {
      document.body.classList.add('panel-collapsed');
      sessionStorage.setItem(STORAGE_KEY, 'true');
      if (icon) icon.className = 'fas fa-chevron-right';
      if (tab)  tab.title = 'Expand panel';
      if (tab)  tab.setAttribute('aria-label', 'Expand navigation panel');
    } else {
      document.body.classList.remove('panel-collapsed');
      sessionStorage.removeItem(STORAGE_KEY);
      if (icon) icon.className = 'fas fa-chevron-left';
      if (tab)  tab.title = 'Collapse panel';
      if (tab)  tab.setAttribute('aria-label', 'Collapse navigation panel');
    }

    // Let D3 / Synapse know the viewport changed after the CSS transition
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  }

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    const btn = document.getElementById('cd-panel-tab');
    if (!btn) return;

    // Always open at login — reset state when profile loads
    window.addEventListener('profile-loaded', () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setCollapsed(false);
    }, { once: true });

    // Restore within-session state (default = open)
    const storedCollapsed = sessionStorage.getItem(STORAGE_KEY) === 'true';
    setCollapsed(storedCollapsed);

    // Toggle on click
    btn.addEventListener('click', () => {
      const isCollapsed = document.body.classList.contains('panel-collapsed');
      setCollapsed(!isCollapsed);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
