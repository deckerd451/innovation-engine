// ================================================================
// SWIPE-TO-DISMISS — Touch gesture for modals/panels
// ================================================================
// Attaches a swipe-down-to-close gesture to any overlay element.
// Also adds a visible drag handle bar at the top on mobile.
//
// Usage:
//   addSwipeDismiss(element, onDismiss)
//
// The element should be the inner modal panel (not the backdrop).
// onDismiss is called when the user swipes down far enough.
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_SWIPE_DISMISS_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  const THRESHOLD = 80;   // px downward to trigger dismiss
  const OPACITY_FACTOR = 0.4; // how much opacity fades per px

  /**
   * Attach swipe-to-dismiss to a modal panel element.
   * @param {HTMLElement} el       - The draggable inner panel
   * @param {Function}    dismiss  - Called to close the modal
   * @param {Object}      opts
   * @param {boolean}     opts.addHandle - inject a drag handle bar (default true on mobile)
   */
  function addSwipeDismiss(el, dismiss, opts = {}) {
    if (!el || typeof dismiss !== 'function') return;

    const isMobile = window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches;
    const addHandle = opts.addHandle ?? isMobile;

    // Inject drag handle bar
    if (addHandle && !el.querySelector('.swipe-handle')) {
      const handle = document.createElement('div');
      handle.className = 'swipe-handle';
      handle.setAttribute('aria-hidden', 'true');
      handle.style.cssText = `
        width: 36px; height: 4px;
        background: rgba(255,255,255,0.25);
        border-radius: 2px;
        margin: 0 auto 12px;
        flex-shrink: 0;
      `;
      el.insertBefore(handle, el.firstChild);
    }

    let startY = 0;
    let currentY = 0;
    let dragging = false;

    const originalTransition = el.style.transition;
    const backdrop = el.closest('[id*="overlay"], [id*="modal"], .modal-overlay, .overlay') ||
                     el.parentElement;

    function onTouchStart(e) {
      // Only initiate drag from the top 60px of the panel (handle zone)
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      if (touch.clientY - rect.top > 80) return; // too far down
      startY = touch.clientY;
      currentY = startY;
      dragging = true;
      el.style.transition = 'none';
    }

    function onTouchMove(e) {
      if (!dragging) return;
      const touch = e.touches[0];
      currentY = touch.clientY;
      const dy = Math.max(0, currentY - startY); // only downward
      el.style.transform = `translateY(${dy}px)`;
      if (backdrop && backdrop !== el) {
        backdrop.style.opacity = String(Math.max(0, 1 - dy * OPACITY_FACTOR / 100));
      }
      if (dy > 10) e.preventDefault(); // prevent page scroll while swiping
    }

    function onTouchEnd() {
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, currentY - startY);
      el.style.transition = originalTransition || 'transform 0.25s ease';

      if (dy >= THRESHOLD) {
        // Animate out and dismiss
        el.style.transform = `translateY(120%)`;
        setTimeout(dismiss, 220);
      } else {
        // Snap back
        el.style.transform = '';
        if (backdrop && backdrop !== el) backdrop.style.opacity = '';
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    // Return cleanup function
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }

  window.addSwipeDismiss = addSwipeDismiss;

  // ── Auto-attach to common modal patterns ───────────────────────
  // Listen for modals being added to the DOM and attach automatically
  // when the inner panel has a recognisable structure.

  const AUTO_SELECTORS = [
    // Settings modal
    { panel: '#settings-modal',          overlay: '#settings-modal-overlay',     closeBtn: '#settings-close-btn' },
    // Profile modal
    { panel: '#profile-modal .modal-content', overlay: '#profile-modal',         closeBtn: '.modal-close, .profile-modal-close, [id*="close"]' },
    // Messages panel (side sheet)
    { panel: '#messages-panel',          overlay: null,                          closeBtn: '[id*="messages-close"], .messages-close' },
    // Node side panel
    { panel: '#node-side-panel .panel-content, #node-side-panel', overlay: null, closeBtn: '#close-node-panel, .close-node-panel' },
  ];

  function _tryAutoAttach(entry) {
    const panel = document.querySelector(entry.panel);
    if (!panel || panel._swipeDismissAttached) return;
    const closeEl = entry.closeBtn ? document.querySelector(entry.closeBtn) : null;
    const dismiss = () => closeEl ? closeEl.click() : (document.querySelector(entry.overlay)?.remove());
    addSwipeDismiss(panel, dismiss);
    panel._swipeDismissAttached = true;
  }

  // Try on DOM ready and on mutations
  function _tryAll() {
    AUTO_SELECTORS.forEach(_tryAutoAttach);
  }

  const _observer = new MutationObserver(_tryAll);
  _observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState !== 'loading') {
    _tryAll();
  } else {
    document.addEventListener('DOMContentLoaded', _tryAll);
  }

})();
