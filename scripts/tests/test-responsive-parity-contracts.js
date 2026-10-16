#!/usr/bin/env node
// Responsive feature parity (phase 1): one set of functions at every width.
// scripts/tests/browser/run-responsive-parity.mjs drives these in Chrome at
// phone, tablet and desktop widths; this keeps the structural fixes in place
// for CI, which runs only the offline suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const index = read('index.html');
const dashboardCss = read('dashboard.css');
const commandCss = read('assets/css/command-dashboard.css');
const commandJs = read('assets/js/command-dashboard.js');
const mobileNav = read('assets/js/mobile-nav.js');
const coordinator = read('assets/js/explorer-coordinator.js');
const integration = read('assets/js/unified-network-integration.js');
const sw = read('sw.js');

// Explore: Organizations and Opportunities are not hidden at any width, and
// the Explore list is not trapped in a closed <details> on desktop (a closed
// details hides its content even with display: contents).
assert.doesNotMatch(dashboardCss, /\[data-resource="(organizations|opportunities)"\][^{]*\{\s*display:\s*none/);
assert.match(index, /<details class="cd-mobile-browse" open>/);

// Search: one search box at every width; keyboard-friendly on phones.
assert.doesNotMatch(commandCss, /\.cd-mobile-panel \.cd-search \{ display:none/);
assert.match(commandCss, /\.cd-mobile-panel \.cd-search #global-search \{ font-size:16px!important; \}/);
assert.match(commandCss, /\.cd-mobile-panel \.cd-search #search-suggestions \{\s*top:calc\(100% \+ \.35rem\)!important; bottom:auto!important;/);
assert.match(index, /id="global-search"[\s\S]{0,200}autocapitalize="off"[\s\S]{0,60}spellcheck="false"[\s\S]{0,60}enterkeyhint="search"/);
assert.match(mobileNav, /getElementById\('centered-search-container'\)[\s\S]{0,120}scrollIntoView/);
// Choosing a person must open their panel even when the map is not ready.
assert.match(coordinator, /try \{\s*window\.GraphController\?\.focusNode\?\.\(personId, \{ openPanel: false \}\);\s*\} catch/);

// Messages: the header is outside #main-content (its own stacking context,
// beneath the mobile Home screen) and shown on every mobile destination.
assert.doesNotMatch(commandCss, /body:not\(\.mobile-tab-home\) #mobile-header-actions #btn-messages-mobile/);
const mainStart = index.indexOf('id="main-content"');
let depth = 0;
let mainEnd = -1;
const tags = /<div\b|<\/div>/g;
tags.lastIndex = index.lastIndexOf('<div', mainStart);
for (let m; (m = tags.exec(index));) {
  depth += m[0] === '</div>' ? -1 : 1;
  if (depth === 0) { mainEnd = m.index; break; }
}
const header = index.indexOf('id="mobile-header-actions"');
assert.ok(mainEnd > mainStart && header > mainEnd, 'the Messages / Actions header sits outside #main-content');
assert.ok(header < index.indexOf('wireKeyClick("btn-messages-mobile"'), 'the header exists before the script that wires it');

// Settings on desktop uses the existing settings modal (one implementation).
assert.match(index, /<div class="cd-identity-actions">[\s\S]*?id="cd-settings-btn"[\s\S]*?id="cd-logout-btn"/);
assert.match(commandJs, /\$id\('cd-settings-btn'\);[\s\S]{0,80}addEventListener\('click', \(\) => window\.SettingsModal\?\.open\?\.\(\)\)/);
assert.match(commandJs, /_wireAdminBtn\(\);\s*_wireSettingsBtn\(\);/);
assert.match(commandCss, /#command-dashboard \.cd-identity \{ display:none!important; \}/, 'mobile keeps Settings in Home → Account only');

// Labels: Home, Explore, Network.
assert.match(mobileNav, /isNetwork \? 'Network' : 'Explore'/);
assert.match(mobileNav, /data-discover-mode="explore" aria-selected="true">Explore<\/button>/);
assert.doesNotMatch(mobileNav, />Discover<\/button>|>My network<\/button>/);

// Returning visitors get the changed files.
const tag = 'responsive-parity-20261016';
for (const asset of ['dashboard.css', 'assets/css/command-dashboard.css', 'assets/js/command-dashboard.js', 'assets/js/mobile-nav.js', 'assets/js/mobile-you.js', 'assets/js/unified-network-integration.js']) {
  assert.match(index, new RegExp(`${escapeRegExp(asset)}\\?v=${tag}`), `${asset} is cache-busted`);
}
assert.match(integration, new RegExp(`import './explorer-coordinator\\.js\\?v=${tag}';`));
assert.match(sw, new RegExp(`const VERSION = "v14-${tag}";`));

console.log('responsive parity contracts passed');
