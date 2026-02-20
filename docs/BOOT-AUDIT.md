# Boot Audit — Innovation Engine
**Date:** 2026-02-20
**Branch:** `claude/fix-cancel-button-1leZQ`

---

## 1. Scope

This audit covers three risk areas discovered during a systematic codebase review:

| Area | Risk |
|------|------|
| Competing module implementations | Two scripts define the same globals → race conditions / overwrite bugs |
| Stale asset caching | SW cache-first strategy + unversioned CSS → users see old UI after deploys |
| Unified Network toggle inconsistency | Three files used `=== 'true'` (default OFF) while the canonical file used `!== 'false'` (default ON) |

---

## 2. Findings

### 2.1 Competing Auth Implementation

| File | Role | Status |
|------|------|--------|
| `/auth.js` | Canonical OAuth controller (V5). Sets `window.setupLoginDOM` and `window.initLoginSystem`. | ✅ Active |
| `assets/js/login.js` | Legacy OAuth controller. Exports `setupLoginDOM` / `initLoginSystem`. | ❌ Dead code — imported only by `assets/js/main.js` which is NOT loaded by `index.html` |

**Root cause:** `index.html` loads root-level `main.js`, which polls for `window.setupLoginDOM` set by `auth.js`. The legacy `assets/js/main.js` (which imported `login.js`) was never wired into `index.html`.

**Fix applied:** Added a deprecation guard at the top of `assets/js/login.js` that emits a `console.error` if the file is loaded while `auth.js` is already active (`window.__CH_IE_AUTH_V5__`).

---

### 2.2 Competing Profile Editor Implementation

| File | Role | Status |
|------|------|--------|
| `/profile.js` | Canonical V3 editor. Exposes `window.CHProfile.openEditorV3` and `window.openProfileEditor`. | ✅ Active |
| `assets/js/node-panel.js` | Proxy — delegates to `CHProfile.openEditorV3` with safe fallback. | ✅ Correct |

No functional fix required. `node-panel.js` already uses the proxy pattern correctly.

---

### 2.3 Stale Asset Caching

**Service Worker (`sw.js`):**

| Before | After |
|--------|-------|
| `VERSION = "v2"` — old caches survive deploys | `VERSION = "v3"` — old `v2` cache is purged on next activate |
| Static assets: **cache-first** — stale JS/CSS served indefinitely | Static assets: **network-first** — SW fetches fresh copy; falls back to cache offline only |

**CSS versioning (`index.html`):**

All nine local CSS `<link>` tags had no cache-busting query string. They now carry `?v=20260220-1`.
To push CSS changes live, increment this version string in `index.html`.

**`boot-diagnostics.js`** (new) embeds `BUILD_ID = '20260220-1'` which is printed as a console banner on every load, making it easy to confirm whether a fresh build has been delivered.

---

### 2.4 Unified Network Toggle — Default Inconsistency

The canonical implementation in `unified-network-integration.js` uses:

```js
ENABLE_UNIFIED_NETWORK: localStorage.getItem('enable-unified-network') !== 'false'
// → default ON (key absent = enabled)
```

Three other files used a different check that made the default OFF:

| File | Old check | Fixed to |
|------|-----------|----------|
| `assets/js/unified-network-synapse-bridge.js:33` | `=== 'true'` | `!== 'false'` |
| `assets/js/mobile-safe-area-debug.js:18` | `=== 'true'` | `!== 'false'` |
| `assets/js/dashboard-actions.js:1540` | `=== 'true'` | `!== 'false'` |

The admin panel toggle in `dashboard-actions.js` also used `localStorage.removeItem` to disable, which left the key absent and therefore re-enabled the feature after the check was fixed. The toggle event handler was updated:

- **Enable:** `removeItem('enable-unified-network')` — key absent → default ON
- **Disable:** `setItem('enable-unified-network', 'false')` — only explicit `'false'` disables

---

## 3. Changes Summary

| File | Change |
|------|--------|
| `assets/js/boot-diagnostics.js` | **New** — BUILD_ID banner, global-overwrite detection, `window.__bootDiag` API |
| `assets/js/login.js` | Added deprecation guard at top |
| `sw.js` | VERSION v2 → v3; static assets strategy cache-first → network-first |
| `index.html` | CSS links versioned `?v=20260220-1`; `boot-diagnostics.js` injected first; forced sign-out script added |
| `assets/js/unified-network-synapse-bridge.js` | `isUnifiedNetworkEnabled` `=== 'true'` → `!== 'false'` |
| `assets/js/mobile-safe-area-debug.js` | unified-network gate `=== 'true'` → `!== 'false'` |
| `assets/js/dashboard-actions.js` | admin toggle read `=== 'true'` → `!== 'false'`; disable writes `'false'` instead of removeItem |

---

## 4. How to Use `boot-diagnostics.js`

```js
// Enable verbose output (survives page reloads):
localStorage.setItem('DEBUG_BOOT', '1');

// Inspect global ownership at runtime:
window.__bootDiag.dump();

// Check for overwrites:
window.__bootDiag.getOverwrites();

// Confirm build stamp:
window.__bootDiag.BUILD_ID;  // → '20260220-1'
```

---

## 5. Remaining Recommendations (out of scope for this PR)

- **Cache-busting automation:** The CSS `?v=` string and `BUILD_ID` constant in `boot-diagnostics.js` are currently edited by hand. A simple build script (`npm run bump-version`) or a CI step that injects a git SHA would remove the manual step.
- **SW scope test:** After deploying, verify in DevTools → Application → Service Workers that the v3 worker activates and the v2 cache is deleted.
- **`assets/js/main.js` removal:** This file is dead code (not loaded by `index.html`). It can be removed in a follow-up cleanup PR along with its dependencies (`assets/js/globals.js`, `assets/js/login.js`).
