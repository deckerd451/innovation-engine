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

## 5. Canonical Profile API (added 2026-02-20)

### Single Source of Truth

| Global | Owner | Value |
|--------|-------|-------|
| `window.CHProfile.openEditorV3` | `profile.js` | The real async editor (avatar upload, form, etc.) |
| `window.CHProfile.openModal` | `profile.js` | Thin proxy → `window.openProfileModal()` |
| `window.openProfileEditor` | `profile.js` (locked) | Proxy → `CHProfile.openEditorV3()` |
| `window.openProfileModal` | `profile.js` (locked) | Opens profile node panel or modal |
| `window.closeProfileModal` | `profile.js` (locked) | Closes the profile modal |

### Why globals are locked

`boot-diagnostics.js` detected that `window.openProfileEditor` was overwritten twice on every page load:
1. By `node-panel.js` (line ~2444) — module-level assignment that ran after profile.js set the canonical proxy.
2. By `dashboardPane.js:wireGlobalFunctions()` for `openProfileModal` / `closeProfileModal`.

Each overwrite is benign in isolation (all three proxy implementations ultimately call `CHProfile.openEditorV3`), but they fire the boot-diag overwrite trap, create audit noise, and introduce a fragile ordering dependency.

**Fix applied:**
- `profile.js` locks the three globals with `Object.defineProperty` (setter blocks overwrites, logs a warning) immediately after all assignments are complete.
- `node-panel.js` — removed the `window.openProfileEditor = …` block entirely. The Edit Profile button already calls `window.openProfileEditor?.()` at click-time, which resolves to the locked proxy.
- `dashboardPane.js:wireGlobalFunctions()` — each assignment is now guarded with `if (!window.openProfileModal)` / `if (!window.closeProfileModal)`, so it only fires when profile.js has not yet set the global (should never happen in normal load order, but is defensive).

### Debugging

```js
// Check lock status:
window.__profileGlobalsLocked  // → true after profile.js loads

// Temporarily allow an overwrite (set BEFORE reload):
window.__ALLOW_PROFILE_GLOBAL_OVERWRITE = true
// (then reload — lock is skipped for that session)

// Verify 0 overwrites:
window.__bootDiag.dump()
// Expected: openProfileEditor, openProfileModal, closeProfileModal show no overwrite rows
```

### Unified Network default consistency

All five files that check the `enable-unified-network` localStorage key now use `!== 'false'` (default ON):

| File | Pattern |
|------|---------|
| `unified-network-integration.js` | `!== 'false'` ✅ |
| `unified-network-synapse-bridge.js` | `!== 'false'` ✅ (fixed) |
| `mobile-safe-area-debug.js` | `!== 'false'` ✅ (fixed) |
| `dashboard-actions.js` (admin toggle read) | `!== 'false'` ✅ (fixed) |
| `unified-network/error-integration.js` (fallback disable) | `setItem('false')` ✅ (fixed — was `removeItem`) |

`enableUnifiedNetwork()` now calls `removeItem` instead of `setItem('true')` so the "enabled" state is always represented by key absence, and "disabled" is always the explicit string `'false'`.

---

## 6. Quick Test Plan

After a hard reload with these changes:

1. **Hard reload** — `Ctrl+Shift+R` (or open a fresh Private Window to bypass any local storage)

2. **Boot banner** — Open DevTools Console. Confirm you see:
   ```
   [Innovation Engine] BUILD 20260220-1  |  boot-diagnostics active
   [PROFILE LOCK] globals locked (v3-uploader-20260220)
   ```

3. **Zero overwrites** — Run:
   ```js
   window.__bootDiag.dump()
   ```
   Expected: table shows `openProfileEditor`, `openProfileModal`, `closeProfileModal` with no overwrite rows.

4. **Profile editor from header** — Click the user-menu avatar in the top bar → Profile modal or node panel opens. Click "Edit Profile" → V3 editor (avatar upload + form fields) opens. Cancel closes it cleanly.

5. **Profile editor from node panel** — Click any node in the network that represents your own profile → node side-panel opens → click "Edit Profile" button → same V3 editor opens. Confirm it works identically to step 4.

6. **Unified Network default ON** — Open a fresh Private Window (no `localStorage`). Confirm the physics-based network loads by default without manually enabling it. In DevTools:
   ```js
   localStorage.getItem('enable-unified-network')  // → null (key absent = default ON)
   window.__bootDiag.dump()                         // → no unified-network overwrites
   ```

7. **Admin disable/re-enable** — Open Admin panel → System Settings → uncheck "Enable Unified Network" → reload. Network should use legacy Synapse. Re-check → reload. Unified Network returns.
   ```js
   // After disabling:
   localStorage.getItem('enable-unified-network')  // → 'false'
   // After re-enabling:
   localStorage.getItem('enable-unified-network')  // → null (removeItem)
   ```

---

## 7. Remaining Recommendations (out of scope for this PR)

- **Cache-busting automation:** The CSS `?v=` string and `BUILD_ID` constant in `boot-diagnostics.js` are currently edited by hand. A simple build script (`npm run bump-version`) or a CI step that injects a git SHA would remove the manual step.
- **SW scope test:** After deploying, verify in DevTools → Application → Service Workers that the v3 worker activates and the v2 cache is deleted.
- **`assets/js/main.js` removal:** This file is dead code (not loaded by `index.html`). It can be removed in a follow-up cleanup PR along with its dependencies (`assets/js/globals.js`, `assets/js/login.js`).
