// ================================================================
// UNIFIED TOAST NOTIFICATION SYSTEM
// ================================================================
// Single source of truth for all in-app toasts.
// All other files should call window.showToast(message, type).
//
// Types: 'success' | 'error' | 'warning' | 'info'
// Usage: window.showToast('Saved!', 'success')
//        window.showToast('Something went wrong', 'error')
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_TOAST_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  // ── Config ──────────────────────────────────────────────────────
  const DURATION   = 3500;   // ms before auto-dismiss
  const MAX_TOASTS = 4;      // max visible at once
  const GAP        = 8;      // px gap between toasts

  const ICONS = {
    success: 'fa-check-circle',
    error:   'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info:    'fa-info-circle',
  };
  const COLORS = {
    success: { bg: 'rgba(0,255,136,0.12)', border: 'rgba(0,255,136,0.35)', icon: '#00ff88' },
    error:   { bg: 'rgba(255,80,80,0.12)',  border: 'rgba(255,80,80,0.4)',  icon: '#ff5050' },
    warning: { bg: 'rgba(255,170,0,0.12)', border: 'rgba(255,170,0,0.4)', icon: '#ffaa00' },
    info:    { bg: 'rgba(0,224,255,0.10)', border: 'rgba(0,224,255,0.35)', icon: '#00e0ff' },
  };

  // ── Container ────────────────────────────────────────────────────
  let _container = null;

  function _ensureContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    _container.style.cssText = `
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
      right: 16px;
      z-index: 99999;
      display: flex;
      flex-direction: column-reverse;
      gap: ${GAP}px;
      pointer-events: none;
      max-width: min(360px, calc(100vw - 32px));
    `;
    // On mobile with bottom nav, shift above nav bar
    if (window.innerWidth < 1024) {
      _container.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 76px)';
    }
    document.body.appendChild(_container);
    return _container;
  }

  // ── Core ─────────────────────────────────────────────────────────
  const _active = new Set();

  function showToast(message, type = 'info', duration = DURATION) {
    if (!message) return;
    type = ICONS[type] ? type : 'info';

    // Prune oldest if at cap
    if (_active.size >= MAX_TOASTS) {
      const oldest = _active.values().next().value;
      _dismiss(oldest);
    }

    const container = _ensureContainer();
    const c = COLORS[type];
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      background: ${c.bg};
      border: 1px solid ${c.border};
      border-radius: 10px;
      padding: 0.7rem 0.85rem;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      pointer-events: all;
      cursor: default;
      min-width: 220px;
      max-width: min(360px, calc(100vw - 32px));
      opacity: 0;
      transform: translateX(20px);
      transition: opacity 0.22s ease, transform 0.22s ease;
    `;

    toast.innerHTML = `
      <i class="fas ${ICONS[type]}" style="color:${c.icon}; font-size:1rem; margin-top:0.1rem; flex-shrink:0;"></i>
      <span style="color:rgba(255,255,255,0.92); font-size:0.875rem; line-height:1.4; flex:1;">${message}</span>
      <button aria-label="Dismiss" style="
        background:none; border:none; color:rgba(255,255,255,0.4);
        font-size:0.8rem; cursor:pointer; padding:0 0 0 0.25rem;
        flex-shrink:0; line-height:1;
      "><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);
    _active.add(toast);

    // Dismiss button
    toast.querySelector('button').addEventListener('click', () => _dismiss(toast));

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
      });
    });

    // Auto-dismiss
    const timer = setTimeout(() => _dismiss(toast), duration);
    toast._timer = timer;

    // Pause timer on hover
    toast.addEventListener('mouseenter', () => clearTimeout(toast._timer));
    toast.addEventListener('mouseleave', () => {
      toast._timer = setTimeout(() => _dismiss(toast), 1500);
    });

    return toast;
  }

  function _dismiss(toast) {
    if (!toast || !_active.has(toast)) return;
    clearTimeout(toast._timer);
    _active.delete(toast);
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }

  // ── Convenience wrappers ─────────────────────────────────────────
  showToast.success = (msg, dur) => showToast(msg, 'success', dur);
  showToast.error   = (msg, dur) => showToast(msg, 'error',   dur || 5000);
  showToast.warning = (msg, dur) => showToast(msg, 'warning', dur);
  showToast.info    = (msg, dur) => showToast(msg, 'info',    dur);

  // ── Global registration ──────────────────────────────────────────
  window.showToast = showToast;

  // Back-compat aliases used by various modules
  window.showToastNotification = showToast;
  window.showToastMobile       = showToast;
  window.showNotification      = (msg, type) => showToast(msg, type);

})();
