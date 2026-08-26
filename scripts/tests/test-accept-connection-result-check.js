#!/usr/bin/env node

// Regression: connections.js's acceptConnectionRequest resolves to a
// { success, error } result on a handled failure (RLS denial, stale/
// already-actioned row, missing profile, etc.) rather than rejecting -- a
// bare `await acceptConnectionRequest(...)` with no result check discards
// that outcome and reports success/advances UI state even when the accept
// actually failed. node-panel.js, unified-notification-system.js, and
// connectionRequests.js already read `result.success` correctly; this
// verifies searchEngine.js's accept-button handler and dashboard.js's
// window.acceptRequest now do too.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// --- assets/js/searchEngine.js -------------------------------------------
const searchEngineSrc = fs.readFileSync(path.join(root, 'assets/js/searchEngine.js'), 'utf8');

assert.match(
  searchEngineSrc,
  /const result = await acceptConnectionRequest\(acceptBtn\.dataset\.id\);\s*\n\s*if \(!result\?\.success\) \{\s*\n\s*const error = result\?\.error;\s*\n\s*throw new Error\(/,
  'searchEngine.js must capture acceptConnectionRequest()\'s result and throw when result.success is falsy, instead of assuming the call always succeeded'
);

assert.doesNotMatch(
  searchEngineSrc,
  /await acceptConnectionRequest\(acceptBtn\.dataset\.id\);\s*\n\s*showSearchNotification\('Connection accepted!', 'success'\)/,
  'searchEngine.js must not show a success notification without first checking acceptConnectionRequest()\'s result'
);

// --- dashboard.js ----------------------------------------------------------
const dashboardSrc = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');

assert.match(
  dashboardSrc,
  /const result = await acceptConnectionRequest\(requestId\);\s*\n\s*if \(!result\?\.success\) \{/,
  'dashboard.js\'s window.acceptRequest must capture acceptConnectionRequest()\'s result and check result.success before reloading requests/connections'
);

assert.doesNotMatch(
  dashboardSrc,
  /await acceptConnectionRequest\(requestId\);\s*\n\s*\n?\s*\/\/ Reload both pending requests/,
  'dashboard.js\'s window.acceptRequest must not proceed to reload pending requests/connections without first checking acceptConnectionRequest()\'s result'
);

console.log('✅ test-accept-connection-result-check passed');
