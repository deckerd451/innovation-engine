#!/usr/bin/env node

// Regression: connections.js's sendConnectionRequest resolves to a
// { success, error } result on a handled failure (already connected,
// self-connect, RLS denial, duplicate insert, etc.) rather than rejecting --
// a bare `await sendConnectionRequest(...)` with no result check discards
// that outcome and reports success/advances UI state even when the send
// actually failed. This verifies searchEngine.js's connect-button handler
// and dashboard.js's window.sendRequest now check `result.success` before
// treating the request as sent.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// --- assets/js/searchEngine.js -------------------------------------------
const searchEngineSrc = fs.readFileSync(path.join(root, 'assets/js/searchEngine.js'), 'utf8');

assert.match(
  searchEngineSrc,
  /const result = await sendConnectionRequest\(member\.id\);\s*\n\s*if \(!result\?\.success\) \{\s*\n\s*const error = result\?\.error;\s*\n\s*throw new Error\(/,
  'searchEngine.js must capture sendConnectionRequest()\'s result and throw when result.success is falsy, instead of assuming the call always succeeded'
);

assert.doesNotMatch(
  searchEngineSrc,
  /await sendConnectionRequest\(member\.id\);\s*\n\s*\n?\s*showSearchNotification\('Connection request sent!', 'success'\)/,
  'searchEngine.js must not show a success notification without first checking sendConnectionRequest()\'s result'
);

// --- dashboard.js ----------------------------------------------------------
const dashboardSrc = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');

assert.match(
  dashboardSrc,
  /const result = await sendConnectionRequest\(userId\);\s*\n\s*if \(!result\?\.success\) \{/,
  'dashboard.js\'s window.sendRequest must capture sendConnectionRequest()\'s result and check result.success before reloading suggested connections'
);

assert.doesNotMatch(
  dashboardSrc,
  /await sendConnectionRequest\(userId\);\s*\n\s*\n?\s*\/\/ Reload suggested connections/,
  'dashboard.js\'s window.sendRequest must not proceed to reload suggested connections without first checking sendConnectionRequest()\'s result'
);

console.log('✅ test-send-connection-result-check passed');
