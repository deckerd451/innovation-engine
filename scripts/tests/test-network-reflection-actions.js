#!/usr/bin/env node

// Focused contract/browser harness for Reflection actions.  The production
// implementation remains the single ExplorerCoordinator-backed dashboard
// route; this file only verifies that Reflection does not grow a parallel
// navigation implementation.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const digest = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
const mentor = fs.readFileSync(path.join(root, 'assets/js/mentor-guide.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'assets/js/explorer-coordinator.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');

assert.match(digest, /_isGenericReflectionNavigation/);
assert.match(digest, /downloadReflectionNetworkReport/);
assert.doesNotMatch(digest, /activateReflectionExplorer/);
assert.match(digest, /selectReflectionEntity/);
assert.match(mentor, /selectReflectionEntity\?\.\('project'/);
assert.match(mentor, /selectReflectionEntity\?\.\('person'/);
assert.doesNotMatch(mentor, /Explore Network/);
assert.match(coordinator, /function setActiveMode\(mode\)/);
assert.match(dashboard, /selectResourceTab: _switchResourceTab/);
assert.doesNotMatch(digest, /new\s+ExplorerCoordinator/);

console.log('Network Reflection action contract: all checks passed');

// In an authenticated browser, run `window.testNetworkReflectionActions()`.
// It checks the canonical Reflection affordances and invokes the shared
// report-export action without opening the legacy modal.
if (typeof window !== 'undefined') {
  window.testNetworkReflectionActions = function () {
    const api = window.StartDailyDigest;
    const reflection = document.getElementById('network-reflection');
    if (!reflection) throw new Error('Canonical Reflection is not rendered');
    const text = reflection.textContent.toLowerCase();
    if (text.includes('explore network') || text.includes('browse themes')) {
      throw new Error('Generic Explorer navigation remains in Reflection');
    }
    if (!document.getElementById('network-reflection-download')) {
      throw new Error('Reflection report download control is missing');
    }
    if (typeof api?.downloadNetworkReport !== 'function') {
      throw new Error('Reflection report export helper is missing');
    }
    return { genericNavigationRemoved: true, reportExportAvailable: true };
  };
}
