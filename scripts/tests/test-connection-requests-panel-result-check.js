#!/usr/bin/env node

// Regression: connections.js's acceptConnectionRequest/declineConnectionRequest/
// cancelConnectionRequest/removeConnection all resolve to a { success, error }
// result on a handled failure (RLS denial, stale/already-actioned row, missing
// profile, etc.) rather than rejecting -- a bare try/catch around the call
// never sees those, so the Connections panel (assets/js/connectionRequests.js)
// used to show a false "Connection accepted!"/"Request declined."/"Request
// cancelled."/"Connection removed." success notification even when the action
// had actually failed. node-panel.js and unified-notification-system.js
// already read `result.success` correctly for the same functions; this
// verifies connectionRequests.js's four handlers now do too, and that the
// helper it uses to extract an error message handles every shape
// connections.js actually returns (a plain string, an { message } object, or
// nothing at all).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'assets/js/connectionRequests.js'), 'utf8');

const handlers = [
  { action: 'accept', call: 'acceptConnectionRequest' },
  { action: 'decline', call: 'declineConnectionRequest' },
  { action: 'cancel', call: 'cancelConnectionRequest' },
  { action: 'remove', call: 'removeConnection' },
];

for (const { action, call } of handlers) {
  const callSite = new RegExp(`const result = await ${call}\\(btn\\.dataset\\.id\\);\\s*\\n\\s*if \\(!result\\?\\.success\\) throw new Error\\(`);
  assert.match(src, callSite,
    `the ${action} handler must capture ${call}()'s result and throw when result.success is falsy, instead of assuming the call always succeeded`);
}

// The old bug: showing a success/info notification unconditionally right
// after the call, with no result captured and no success check in between.
for (const { action, call } of handlers) {
  const blindSuccess = new RegExp(`await ${call}\\(btn\\.dataset\\.id\\);\\s*\\n\\s*showPanelNotification\\([^)]*'(?:success|info)'\\)`);
  assert.doesNotMatch(src, blindSuccess,
    `the ${action} handler must not show a success notification without first checking ${call}()'s result`);
}

// Every catch block must also re-render its own section so a failed action
// leaves the button in its normal state instead of stuck showing a spinner
// forever (the result-check throw above routes failures through here too).
assert.match(src, /if \(!result\?\.success\) throw new Error\(connectionActionErrorMessage\(result, 'Failed to accept connection request\.'\)\);\s*\n\s*showPanelNotification\('Connection accepted!', 'success'\);\s*\n\s*await loadAllSections\(\);\s*\n\s*await refreshPendingCount\(\);\s*\n\s*\} catch \(err\) \{\s*\n\s*showPanelNotification\(err\.message, 'error'\);\s*\n\s*await loadReceivedRequests\(\);/,
  'a failed accept must show an accurate error and restore the button via a re-render, not leave it stuck mid-spin');
assert.match(src, /if \(!result\?\.success\) throw new Error\(connectionActionErrorMessage\(result, 'Failed to cancel connection request\.'\)\);\s*\n\s*showPanelNotification\('Request cancelled\.', 'info'\);\s*\n\s*await loadSentRequests\(\);\s*\n\s*\} catch \(err\) \{\s*\n\s*showPanelNotification\(err\.message, 'error'\);\s*\n\s*await loadSentRequests\(\);/,
  'a failed cancel must show an accurate error and restore the button via a re-render, not leave it stuck mid-spin');

// --- connectionActionErrorMessage(): behavioral check of every result shape
// connections.js actually returns (see e.g. cancelConnectionRequest's
// `{ success: false, error: "Missing id" }` vs acceptConnectionRequest's
// `{ success: false, error: readErr }` where readErr is a Supabase error
// object carrying .message).
const fnMatch = src.match(/function connectionActionErrorMessage\([\s\S]*?\n\}/);
assert.ok(fnMatch, 'connectionActionErrorMessage() must exist so every handler extracts errors the same way');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${fnMatch[0]}\nglobalThis.connectionActionErrorMessage = connectionActionErrorMessage;`, sandbox);

assert.equal(sandbox.connectionActionErrorMessage({ success: false, error: 'Missing id' }, 'fallback'), 'Missing id',
  'a plain string error (e.g. cancelConnectionRequest\'s early-exit errors) must be used as-is');
assert.equal(sandbox.connectionActionErrorMessage({ success: false, error: { message: 'RLS denied' } }, 'fallback'), 'RLS denied',
  'a Supabase-style error object must use its .message');
assert.equal(sandbox.connectionActionErrorMessage({ success: false }, 'fallback'), 'fallback',
  'a result with no error detail at all must fall back to the caller-supplied message, never crash or say "undefined"');
assert.equal(sandbox.connectionActionErrorMessage(undefined, 'fallback'), 'fallback',
  'a missing result must fall back cleanly rather than throwing on optional chaining');

console.log('Connections panel result-check regression: all checks passed');
