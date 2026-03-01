// ================================================================
// VISIBILITY GUARD — Pause/resume polling when tab is hidden
// ================================================================
// Usage:
//   const id = visibilitySetInterval(callback, 30000);
//   visibilityClearInterval(id);
//
// When the page is hidden (user switches tabs or locks phone),
// all registered intervals are cleared. When the page becomes
// visible again, they are re-registered with their original delay.
// ================================================================

(() => {
  'use strict';

  const GUARD = '__CH_VISIBILITY_GUARD_LOADED__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  const _registry = new Map(); // id → { fn, delay, nativeId }
  let _nextId = 1;
  let _paused = false;

  function _isHidden() {
    return document.hidden || document.visibilityState === 'hidden';
  }

  function visibilitySetInterval(fn, delay) {
    const id = _nextId++;
    const entry = { fn, delay, nativeId: null };
    _registry.set(id, entry);
    if (!_paused && !_isHidden()) {
      entry.nativeId = setInterval(fn, delay);
    }
    return id;
  }

  function visibilityClearInterval(id) {
    const entry = _registry.get(id);
    if (!entry) return;
    if (entry.nativeId !== null) clearInterval(entry.nativeId);
    _registry.delete(id);
  }

  function _pauseAll() {
    _paused = true;
    _registry.forEach(entry => {
      if (entry.nativeId !== null) {
        clearInterval(entry.nativeId);
        entry.nativeId = null;
      }
    });
  }

  function _resumeAll() {
    _paused = false;
    _registry.forEach(entry => {
      if (entry.nativeId === null) {
        // Run once immediately to refresh data after being away
        try { entry.fn(); } catch {}
        entry.nativeId = setInterval(entry.fn, entry.delay);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (_isHidden()) {
      _pauseAll();
    } else {
      _resumeAll();
    }
  });

  // Expose
  window.visibilitySetInterval  = visibilitySetInterval;
  window.visibilityClearInterval = visibilityClearInterval;

})();
