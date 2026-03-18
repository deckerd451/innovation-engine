// ================================================================
// COMMAND DASHBOARD — Collapsible & Resizable Panel
// ================================================================
// Collapse toggle: pill tab on the right edge, open at every login.
//   State: sessionStorage (resets when browser/tab closes).
//
// Resize handle: drag the right edge to widen/narrow the panel.
//   - Updates --cd-width on :root; all dependents (graph, search, tab) follow.
//   - Clamped between MIN_W (300px) and 65% of viewport.
//   - Double-click handle to reset to default width.
//   - State: localStorage (persists across sessions).
//
// Desktop only (≥ 1024px). Handlers always attached but check width at runtime.
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CD_PANEL_COLLAPSE_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  function isDesktop() {
    return window.innerWidth >= 1024;
  }

  window.addEventListener('resize', () => {
    if (!isDesktop()) {
      document.body.classList.remove('panel-collapsed');
    }
  }, { passive: true });

  const STORAGE_KEY   = 'cdPanelCollapsed';
  const STORAGE_KEY_W = 'cdPanelWidth';
  const DEFAULT_W     = 420;
  const MIN_W         = 300;

  function getMaxW() {
    return Math.floor(window.innerWidth * 0.65);
  }

  function applyWidth(px) {
    const clamped = Math.max(MIN_W, Math.min(getMaxW(), Math.round(px)));
    document.documentElement.style.setProperty('--cd-width', `${clamped}px`);
    return clamped;
  }

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

    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  }

  function initResize() {
    const handle = document.getElementById('cd-resize-handle');
    if (!handle) return;

    const saved = parseInt(localStorage.getItem(STORAGE_KEY_W), 10);
    if (saved >= MIN_W) applyWidth(saved);

    let dragging = false;
    let startX   = 0;
    let startW   = DEFAULT_W;

    function onStart(e) {
      if (!isDesktop()) return;
      if (document.body.classList.contains('panel-collapsed')) return;
      dragging = true;
      startX   = e.touches ? e.touches[0].clientX : e.clientX;
      startW   = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--cd-width'),
        10
      ) || DEFAULT_W;
      handle.classList.add('dragging');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      applyWidth(startW + (clientX - startX));
      e.preventDefault();
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      const w = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--cd-width'),
        10
      );
      if (w >= MIN_W) localStorage.setItem(STORAGE_KEY_W, w);
      window.dispatchEvent(new Event('resize'));
    }

    handle.addEventListener('dblclick', () => {
      applyWidth(DEFAULT_W);
      localStorage.removeItem(STORAGE_KEY_W);
      window.dispatchEvent(new Event('resize'));
    });

    handle.addEventListener('mousedown',  onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('touchmove',  onMove, { passive: false });
    document.addEventListener('mouseup',    onEnd);
    document.addEventListener('touchend',   onEnd);
  }

  function init() {
    const btn = document.getElementById('cd-panel-tab');
    if (!btn) return;

    window.addEventListener('profile-loaded', () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setCollapsed(false);
    }, { once: true });

    if (isDesktop()) {
      const storedCollapsed = sessionStorage.getItem(STORAGE_KEY) === 'true';
      setCollapsed(storedCollapsed);
    }

    btn.addEventListener('click', () => {
      if (!isDesktop()) return;
      const isCollapsed = document.body.classList.contains('panel-collapsed');
      setCollapsed(!isCollapsed);
    });

    initResize();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
