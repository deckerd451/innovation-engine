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

assert.match(digest, /activateReflectionExplorer\s*=\s*activateReflectionExplorer/);
assert.match(digest, /CommandDashboard\?\.selectResourceTab/);
assert.match(digest, /UnifiedNotifications\?\.showPanel\?\.\('actions'\)/, 'mobile must use the existing responsive Explorer surface');
assert.match(digest, /closeNodePanel\?\./, 'Explorer actions must close detail without resetting context');
assert.match(digest, /handler === 'openThemes'[^\n]*return 'themes'/);
assert.match(digest, /handler === 'openSkillMatchedProjects'[^\n]*return 'projects'/);
assert.match(digest, /handler === 'openConnectionRequests'[^\n]*return 'people'/);
assert.match(digest, /selectReflectionEntity/);
assert.match(mentor, /selectReflectionEntity\?\.\('project'/);
assert.match(mentor, /selectReflectionEntity\?\.\('person'/);
assert.match(mentor, /activateReflectionExplorer\?\.\('people'\)/);
assert.match(coordinator, /function setActiveMode\(mode\)/);
assert.match(dashboard, /selectResourceTab: _switchResourceTab/);
assert.doesNotMatch(digest, /new\s+ExplorerCoordinator/);

console.log('Network Reflection action contract: all checks passed');

// In an authenticated browser, run `window.testNetworkReflectionActions()`.
// It exercises both actions through the real dashboard and checks the visual
// tab state.  It intentionally uses the same helper for desktop/mobile.
if (typeof window !== 'undefined') {
  window.testNetworkReflectionActions = function () {
    const api = window.StartDailyDigest;
    const tabs = resource => document.querySelector(`.udc-resource-tab[data-resource="${resource}"]`);
    if (!api?.activateReflectionExplorer) throw new Error('Reflection action helper missing');
    if (!tabs('people') || !tabs('themes')) throw new Error('Explore tabs are not rendered');
    api.activateReflectionExplorer('people');
    if (!tabs('people').classList.contains('active')) throw new Error('Explore Network did not activate PEOPLE');
    api.activateReflectionExplorer('themes');
    if (!tabs('themes').classList.contains('active')) throw new Error('Browse Themes did not activate THEMES');
    return { people: true, themes: true, sharedHelper: true };
  };
}
