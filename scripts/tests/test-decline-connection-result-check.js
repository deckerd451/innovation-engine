#!/usr/bin/env node

// Regression: connections.js's declineConnectionRequest resolves to a
// { success, error } result on a handled failure (RLS denial, stale row,
// missing profile, etc.) rather than rejecting -- a bare
// `await declineConnectionRequest(...)` with no result check discards that
// outcome and reports success/advances UI state even when the decline
// actually failed. This verifies searchEngine.js's decline-button handler
// and dashboard.js's window.declineRequest now read `result.success` before
// treating the call as successful.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// --- assets/js/searchEngine.js -------------------------------------------
const searchEngineSrc = fs.readFileSync(path.join(root, 'assets/js/searchEngine.js'), 'utf8');

assert.match(
  searchEngineSrc,
  /const result = await declineConnectionRequest\(declineBtn\.dataset\.id\);\s*\n\s*if \(!result\?\.success\) \{\s*\n\s*const error = result\?\.error;\s*\n\s*throw new Error\(/,
  'searchEngine.js must capture declineConnectionRequest()\'s result and throw when result.success is falsy, instead of assuming the call always succeeded'
);

assert.doesNotMatch(
  searchEngineSrc,
  /await declineConnectionRequest\(declineBtn\.dataset\.id\);\s*\n\s*showSearchNotification\('Connection declined\.', 'info'\)/,
  'searchEngine.js must not show a success notification without first checking declineConnectionRequest()\'s result'
);

// --- dashboard.js ----------------------------------------------------------
const dashboardSrc = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');

assert.match(
  dashboardSrc,
  /const result = await declineConnectionRequest\(requestId\);\s*\n\s*if \(!result\?\.success\) \{/,
  'dashboard.js\'s window.declineRequest must capture declineConnectionRequest()\'s result and check result.success before reloading pending requests'
);

assert.doesNotMatch(
  dashboardSrc,
  /await declineConnectionRequest\(requestId\);\s*\n\s*await loadPendingRequests/,
  'dashboard.js\'s window.declineRequest must not proceed to reload pending requests without first checking declineConnectionRequest()\'s result'
);

console.log('✅ test-decline-connection-result-check passed');
