#!/usr/bin/env node
// Shared navigation (Phase 2, PR 1): one markup structure and one router for
// every width -- Home · Explore · Network · Inbox · You. Behaviour is driven
// in Chrome by scripts/tests/browser/run-responsive-parity.mjs; this keeps the
// structure in place for CI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const appNav = read('assets/js/app-nav.js');
const mobileNav = read('assets/js/mobile-nav.js');
const base = read('assets/css/base.css');
const commandCss = read('assets/css/command-dashboard.css');

// One navigation, five destinations, in order, hidden until signed in.
assert.equal((index.match(/<nav id="app-nav"/g) || []).length, 1);
assert.equal((index.match(/aria-label="Main navigation"/g) || []).length, 1);
assert.match(index, /<nav id="app-nav" class="app-nav" aria-label="Main navigation" hidden>/);
const order = [...index.matchAll(/class="app-nav-btn" data-destination="([a-z]+)"/g)].map(m => m[1]);
assert.deepEqual(order, ['home', 'explore', 'network', 'inbox', 'you']);
assert.match(index, /<script src="assets\/js\/app-nav\.js\?v=[a-z0-9-]+" defer><\/script>/);

// The competing navigation is gone: no bottom tab bar, no Home | Network
// switcher, no mobile Explore | Network switcher, no second Messages button.
for (const old of [/id="mobile-tab-bar"/, /class="mob-tab/, /buildspace-view-switcher/, /data-workspace-view=/, /id="btn-messages-mobile"/, /id="cd-messages-btn"/]) {
  assert.doesNotMatch(index, old);
}
assert.doesNotMatch(mobileNav, /cd-mobile-discover-mode|data-discover-mode|\.mob-tab|\btabs[.[]/);

// One router: only app-nav.js handles the destinations.
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
})('assets/js');
const routers = jsFiles.filter(file => /data-destination|\[data-destination\]/.test(read(file)));
assert.deepEqual(routers.map(f => path.basename(f)), ['app-nav.js']);

// Destinations reuse the existing screens.
assert.match(appNav, /destination === 'inbox'[\s\S]{0,120}window\.openMessagesModal\(\)/);
assert.match(appNav, /destination === 'you'[\s\S]{0,60}window\.openProfileModal\?\.\(\)/);
assert.match(appNav, /window\.CommandDashboard\?\.setWorkspaceView\?\.\(page === 'network' \? 'network' : 'today'\)/);
assert.match(appNav, /window\.MobileNav\?\.show\?\.\(page\)/);
assert.match(mobileNav, /window\.MobileNav = \{/);
for (const page of ['home', 'explore', 'network', "'event-mode'", 'suggestions', 'themes']) {
  assert.match(mobileNav, new RegExp(`\\n    ${page}: \\(\\) =>`), `MobileNav keeps ${page}`);
}

// Switching pages closes overlays that belonged to the previous one.
assert.match(appNav, /window\.MobileTaskAssistance\?\.close\?\.\(\)/);
assert.match(appNav, /closeMessagesModal/);

// History and deep links: the router never touches history or the URL.
assert.doesNotMatch(appNav, /pushState|replaceState|location\.(hash|href|search)\s*=/);

// Signed-in/out: shown with the app, hidden on sign-out.
for (const event of ['app-ready', 'profile-loaded', 'user-logged-out']) {
  assert.match(appNav, new RegExp(`addEventListener\\('${event}'`));
}

// Layout: a bottom bar above everything on phones/tablets (as before); a
// side bar on desktop below modals and panels, with the app moved over.
assert.match(base, /@media \(max-width: 1023px\) \{[\s\S]*?#app-nav \{[\s\S]*?bottom: 0;[\s\S]*?z-index: 10000;/);
assert.match(base, /@media \(min-width: 1024px\) \{[\s\S]*?#app-nav \{[\s\S]*?width: var\(--app-nav-width\);[\s\S]*?z-index: 150;/);
assert.match(base, /body\.app-nav-visible #main-content \{\s*left: var\(--app-nav-width\) !important;/);
assert.match(commandCss, /body\[data-destination="explore"\] #command-dashboard #cd-focus \{ display:none!important; \}/);

// Admin and Actions on mobile live in the body-level header row, above the
// Home screen (inside #main-content they were covered on Home).
const header = index.slice(index.indexOf('id="mobile-header-actions"'), index.indexOf('id="btn-actions-mobile"'));
assert.match(header, /id="btn-admin-mobile"/);
assert.match(commandCss, /#btn-admin-mobile \{\s*\/\* Sits in the #mobile-header-actions row, before Actions\. \*\/\s*position:static;/);

// Callers that used the old tabs go through the router.
assert.match(read('assets/js/mobile-task-assistance.js'), /window\.AppNav\?\.go\?\.\('home'\)/);
assert.match(read('assets/js/command-dashboard.js'), /window\.AppNav\?\.go\?\.\('inbox'\)[\s\S]*window\.AppNav\?\.go\?\.\('explore'\)/);
assert.match(read('assets/js/mobile-today-continuity.js'), /document\.body\.dataset\.destination !== 'home'/);

console.log('shared navigation contracts passed');
