/**
 * boot-diagnostics.js
 * ===================
 * Lightweight boot-time diagnostics module.
 *
 * Enabled via:  localStorage.setItem('DEBUG_BOOT', '1')
 * Disabled via: localStorage.removeItem('DEBUG_BOOT')
 *
 * Responsibilities:
 *  1. Print a BUILD_ID banner so every page-load is stamped in the console.
 *  2. Track which script first claimed each global (window.*) we care about
 *     and warn when a later script overwrites it.
 *  3. Expose window.__bootDiag API for runtime inspection.
 */

(function () {
  'use strict';

  // ─── BUILD STAMP ──────────────────────────────────────────────────────────
  // Frozen at deploy-time; change this value whenever you cut a new build.
  const BUILD_ID = '20260220-1';

  const DEBUG = localStorage.getItem('DEBUG_BOOT') === '1';

  function log(...args) {
    if (DEBUG) console.log('[boot-diag]', ...args);
  }
  function warn(...args) {
    // Always warn — overwrites are bugs regardless of DEBUG flag.
    console.warn('[boot-diag]', ...args);
  }

  // ─── GLOBAL-OWNERSHIP REGISTRY ────────────────────────────────────────────
  // These are the globals that multiple scripts historically competed over.
  const WATCHED_GLOBALS = [
    'openProfileEditor',
    'openProfileModal',
    'closeProfileModal',
    'initLoginSystem',
    'setupLoginDOM',
    'unifiedNetworkApi',
    'unifiedNetworkIntegration',
    '__authReady',
    'CHProfile',
  ];

  const registry = {}; // { globalName: { claimedBy, claimedAt, value } }
  const overwrites = []; // { globalName, prev, next, detectedAt }

  /**
   * Install a Property Descriptor trap on window for each watched global.
   * Detects the first setter and any subsequent ones.
   */
  function watchGlobal(name) {
    let _value = window[name]; // capture whatever is already there

    // If already set before this script ran, record it as an unknown prior claim.
    if (_value !== undefined) {
      registry[name] = { claimedBy: 'pre-diagnostics', claimedAt: Date.now(), value: _value };
    }

    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get() {
          return _value;
        },
        set(newVal) {
          if (_value !== undefined && _value !== newVal) {
            const entry = {
              globalName: name,
              prev: _value,
              next: newVal,
              detectedAt: new Date().toISOString(),
            };
            overwrites.push(entry);
            warn(`Global overwrite detected: window.${name}`, entry);
          }
          if (registry[name] === undefined) {
            registry[name] = { claimedBy: 'unknown', claimedAt: Date.now(), value: newVal };
            log(`window.${name} claimed for the first time`);
          }
          _value = newVal;
        },
      });
    } catch (e) {
      // Some globals (e.g. from third-party libs) are non-configurable.
      log(`Could not watch window.${name}:`, e.message);
    }
  }

  WATCHED_GLOBALS.forEach(watchGlobal);

  // ─── BANNER ───────────────────────────────────────────────────────────────
  const banner = `%c[Innovation Engine] BUILD ${BUILD_ID}  |  boot-diagnostics active (DEBUG_BOOT=${DEBUG ? '1' : '0'})`;
  console.log(banner, 'background:#0a0a1a;color:#00e0ff;font-weight:bold;padding:2px 6px;border-radius:3px;');

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  window.__bootDiag = Object.freeze({
    BUILD_ID,
    getRegistry: () => ({ ...registry }),
    getOverwrites: () => [...overwrites],
    isDebug: () => DEBUG,
    /**
     * Dump a summary table to the console.
     * Call: window.__bootDiag.dump()
     */
    dump() {
      console.group('[boot-diag] Global ownership registry');
      console.table(
        Object.fromEntries(
          Object.entries(registry).map(([k, v]) => [k, {
            claimedBy: v.claimedBy,
            claimedAt: new Date(v.claimedAt).toISOString(),
            type: typeof v.value,
          }])
        )
      );
      if (overwrites.length) {
        console.warn(`[boot-diag] ${overwrites.length} overwrite(s) detected:`);
        console.table(overwrites.map(o => ({
          global: o.globalName,
          prevType: typeof o.prev,
          nextType: typeof o.next,
          detectedAt: o.detectedAt,
        })));
      } else {
        console.log('[boot-diag] ✅ No global overwrites detected.');
      }
      console.groupEnd();
    },
  });

  log('Boot diagnostics initialised. BUILD_ID =', BUILD_ID);
})();
