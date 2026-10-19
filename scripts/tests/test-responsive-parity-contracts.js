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

// Messages is Inbox in the shared navigation (body level, above every mobile
// surface). The mobile Actions button stays in a header outside #main-content
// (its own stacking context, beneath the mobile Home screen).
assert.doesNotMatch(commandCss, /body:not\(\.mobile-tab-home\) #mobile-header-actions #btn-messages-mobile/);
assert.match(commandCss, /#mobile-header-actions \{[^}]*flex-direction: row !important;/, 'the header is one row, clear of the search box');
assert.match(read('assets/css/mobile-you.css'), /\.mobile-you-header \{[^}]*padding:\.15rem 108px/, 'the Home header leaves room for the header buttons');
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
assert.ok(header < index.indexOf('wireKeyClick("btn-actions-mobile"'), 'the header exists before the script that wires it');
assert.doesNotMatch(index, /id="btn-messages-mobile"|id="cd-messages-btn"/, 'Inbox is the one Messages entry point');
const appNavAt = index.indexOf('<nav id="app-nav"');
assert.ok(appNavAt > mainEnd, 'the main navigation sits outside #main-content');
assert.match(read('assets/js/app-nav.js'), /destination === 'inbox'[\s\S]{0,120}window\.openMessagesModal\(\)/);

// Scrolling on phones and tablets: the dashboard is a fixed-height column
// ending at the bottom bar, so Explore and Network scroll inside it (the
// scroll area must not size to its content), and full-screen surfaces end at
// the bar's top edge, safe area included.
assert.match(commandCss, /#command-dashboard\.cd-mobile-panel \.cd-scroll-area \{\s*flex: 1 1 auto;\s*min-height: 0;\s*overflow-y: auto;/);
assert.doesNotMatch(commandCss, /cd-mobile-panel \.cd-scroll-area \{\s*flex: none/);
assert.match(read('assets/css/base.css'), /:root \{ --mobile-tab-bar-height: calc\(60px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
assert.match(commandCss, /inset:0 0 calc\(60px \+ env\(safe-area-inset-bottom,0px\)\) 0!important;/, 'the dashboard ends at the bottom bar');

// The You (profile) close button: below the top safe area on phones (the
// window sits inside the safe areas), a labelled 44px target in the corner,
// and a click effect may not reposition it (micro-interactions.js used to make
// every clicked button position: relative).
const profileJs = read('profile.js');
assert.match(profileJs, /#profile-modal \.modal-content\{width:calc\(100vw - 16px\) !important;height:calc\(100dvh - 16px - env\(safe-area-inset-top, 0px\) - env\(safe-area-inset-bottom, 0px\)\) !important;[^}]*margin:env\(safe-area-inset-top, 0px\) 0 env\(safe-area-inset-bottom, 0px\) !important;/);
assert.match(profileJs, /#profile-modal \.modal-close\{position:absolute !important;top:8px !important;right:8px !important;z-index:2;min-width:44px;min-height:44px;/);
assert.match(index, /<button class="modal-close" type="button" aria-label="Close profile" onclick="closeProfileModal\(\)">/);
const micro = read('assets/js/micro-interactions.js');
assert.match(micro, /if \(getComputedStyle\(btn\)\.position === 'static'\) btn\.style\.position = 'relative';/);
assert.doesNotMatch(micro, /\n\s*btn\.style\.position = 'relative';/);

// The Messages header: below the top safe area when full screen, with the
// close X in the header row (the same 44px corner X as You); New and X are
// labelled 44px targets at every width.
const messagingCss = read('assets/css/messaging.css');
assert.match(messagingCss, /#messages-container \.conversations-header \{\s*padding: calc\(0\.75rem \+ var\(--safe-top, 0px\)\) calc\(44px \+ 1rem\) 0\.75rem 1rem !important;/);
assert.match(messagingCss, /#messages-modal \.modal-close \{\s*position: absolute !important;\s*top: calc\(0\.75rem \+ 1px \+ var\(--safe-top, 0px\)\) !important;/);
assert.match(messagingCss, /\.conversations-header \.new-message-btn \{\s*min-height: 44px;/);
assert.match(messagingCss, /#messages-modal \.modal-close \{\s*min-width: 44px;\s*min-height: 44px;/);
assert.match(messagingCss, /\.conversations-header \{\s*flex-wrap: wrap;/);
assert.match(messagingCss, /#messages-container \.chat-header \{[^}]*padding-right: calc\(44px \+ 1rem\) !important;/);
assert.match(messagingCss, /#messages-container \.chat-header-info,\s*#messages-container \.chat-context \{\s*min-width: 0;\s*overflow-wrap: anywhere;/);
assert.doesNotMatch(messagingCss, /^\/\/\*/m, 'no stray slash that would drop the next rule');
assert.match(index, /<button class="modal-close" type="button" aria-label="Close messages" onclick="closeMessagesModal\(\)">/);
// Messages switches between list and chat wherever the CSS makes it full
// screen and hides the chat panel (below 1024px); a narrower JS breakpoint
// left iPads and 769–1023px windows with no chat after tapping a
// conversation. The sidebar collapse tab is desktop-only to match.
assert.match(messagingCss, /@media \(max-width: 1023px\) \{\s*\/\* Full-screen modal behavior/);
assert.match(messagingCss, /#messages-container \.chat-panel \{\s*display: none !important;/);
assert.match(read('assets/js/messaging.js'), /function isMobile\(\) \{\s*return window\.matchMedia && window\.matchMedia\("\(max-width: 1023px\)"\)\.matches;/);
assert.match(messagingCss, /@media \(min-width: 1024px\) \{\s*\.msg-sidebar-tab \{/);
assert.doesNotMatch(messagingCss, /@media \(min-width: 769px\)/);
assert.match(read('assets/js/messaging.js'), /<button class="new-message-btn" type="button" aria-label="New message" onclick="MessagingModule\.showNewMessageModal\(\)">/);

// Discovery: one switch in Settings ("Suggest people and projects on the
// map"), no injected Discovery button, no old preferences dialog, and no
// shortcuts that take over the browser's Cmd/Ctrl+P, D or H.
{
  const integrationJs = read('assets/js/unified-network-integration.js');
  const onboardingJs = read('assets/js/unified-network/onboarding.js');
  const apiJs = read('assets/js/unified-network/api.js');
  const settingsJs = read('assets/js/settings-modal.js');
  assert.doesNotMatch(integrationJs, /unified-network-preferences-btn|showPreferencesPanel|addEventListener\('keydown'/);
  assert.doesNotMatch(onboardingJs, /discovery-frequency|Discovery Preferences|createPreferencesPanel/);
  assert.doesNotMatch(apiJs, /PreferencesPanel|loadPreferences\(/);
  assert.match(settingsJs, /id="settings-discovery-suggestions"/);
  assert.match(settingsJs, />Suggest people and projects on the map</);
  assert.match(settingsJs, /window\.SettingsModal = \{ open, close, discoverySuggestionsEnabled \}/);
  // The map starts with the saved setting (no Settings dependency, no gap).
  assert.match(read('assets/js/unified-network/state-manager.js'), /this\._discoveryEnabled = storedDiscoveryEnabled\(\);/);
  // A change applies even before the map has started (no "not initialized"
  // error, straight to the state manager), from a listener registered when
  // the module loads; turning it off while suggestions show or appear also
  // clears their highlight and focus.
  {
    const setPrefs = apiJs.slice(apiJs.indexOf('  setDiscoveryPreferences(preferences) {'), apiJs.indexOf('  getDiscoveryPreferences() {'));
    assert.doesNotMatch(setPrefs, /_ensureInitialized/);
    assert.match(setPrefs, /this\._stateManager\.setDiscoveryEnabled\(enabled\);/);
    assert.match(setPrefs, /if \(!enabled && wasActive && this\._initialized\) \{\s*this\.resetToMyNetwork\(\);/);
    assert.match(apiJs, /getDiscoveryPreferences\(\) \{\s*return \{ enabled: this\._stateManager\.isDiscoveryEnabled\(\) \};/);
    assert.match(integrationJs, /^window\.addEventListener\('discovery-suggestions-changed'/m);
    assert.doesNotMatch(apiJs, /discovery-requested/);
    // The changed map modules are fetched fresh with api.js.
    for (const m of ['state-manager', 'discovery-trigger-manager', 'onboarding', 'accessibility']) {
      assert.match(apiJs, new RegExp(`from '\\./${m}\\.js\\?v=discovery-setting-20261019'`), `${m}.js is cache-busted`);
    }
  }
  // The map's keyboard handler leaves the browser's Ctrl/Cmd+D alone.
  assert.doesNotMatch(read('assets/js/unified-network/accessibility.js'), /case 'd':/);
  assert.doesNotMatch(read('assets/css/mobile-safe-area.css'), /unified-network-preferences|\.preferences-content/);
}
// Settings on desktop uses the existing settings modal (one implementation).
assert.match(index, /<div class="cd-identity-actions">[\s\S]*?id="cd-settings-btn"[\s\S]*?id="cd-logout-btn"/);
assert.match(commandJs, /\$id\('cd-settings-btn'\);[\s\S]{0,80}addEventListener\('click', \(\) => window\.SettingsModal\?\.open\?\.\(\)\)/);
assert.match(commandJs, /_wireAdminBtn\(\);\s*_wireSettingsBtn\(\);/);
assert.match(commandCss, /#command-dashboard \.cd-identity \{ display:none!important; \}/, 'mobile keeps Settings in Home → Account only');

// Labels: Home, Explore, Network.
assert.match(mobileNav, /isNetwork \? 'Network' : 'Explore'/);
// Home is not rebuilt by the 30-second unread refresh (that closed its
// sections and cleared unfinished text); the Inbox badge shows the count.
assert.doesNotMatch(mobileNav, /total-unread-messages-updated/);
assert.match(read('assets/js/app-nav.js'), /addEventListener\('total-unread-messages-updated', \(event\) => setUnread\(event\.detail\?\.count\)\)/);
// The shared navigation is the only Explore / Network switch.
assert.doesNotMatch(mobileNav, /data-discover-mode|cd-mobile-discover-mode/);

// Returning visitors get the changed files: each carries this phase's tag
// or a later shell version (sw.js).
const tag = 'shared-nav-20261016';
const shellTag = (sw.match(/const VERSION = "v\d+-([^"]+)"/) || [])[1];
assert.ok(shellTag, 'service worker declares a versioned shell');
const versions = `(${escapeRegExp(tag)}|${escapeRegExp(shellTag)})`;
for (const asset of ['dashboard.css', 'assets/css/command-dashboard.css', 'assets/js/command-dashboard.js', 'assets/js/mobile-nav.js', 'assets/js/mobile-you.js', 'assets/js/unified-network-integration.js']) {
  assert.match(index, new RegExp(`${escapeRegExp(asset)}\\?v=${versions}`), `${asset} is cache-busted`);
}
assert.match(integration, new RegExp(`import './explorer-coordinator\\.js\\?v=${tag}';`));

console.log('responsive parity contracts passed');
