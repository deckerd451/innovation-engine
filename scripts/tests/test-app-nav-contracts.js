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

// Inbox and You are destinations: their open functions enter them (so every
// entry point selects the tab), leaving hides them without clearing them,
// and their close functions leave for the page underneath.
const pane = read('assets/js/dashboardPane.js');
const profile = read('profile.js');
const messaging = read('assets/js/messaging.js');
assert.match(appNav, /const SCREENS = \{ inbox: 'messages-modal', you: 'profile-modal' \};/);
assert.match(appNav, /window\.AppNav = \{\s*go,\s*enter,\s*exit,/);
assert.match(pane, /window\.openMessagesModal = async \(\) => \{\s*window\.AppNav\?\.enter\?\.\("inbox"\);/);
assert.match(pane, /window\.hideMessagesModal = \(\) => \{\s*closeModal\("messages-modal"\);\s*document\.body\.classList\.remove\("messages-open"\);\s*\};/);
assert.match(pane, /window\.closeMessagesModal = \(\) => \{\s*if \(window\.AppNav\?\.exit\) window\.AppNav\.exit\("inbox"\);/);
assert.doesNotMatch(pane.slice(pane.indexOf('window.hideMessagesModal'), pane.indexOf('window.openProjectsModal')), /cleanup\(/, 'leaving Inbox keeps Messages');
assert.match(profile, /window\.openProfileModal = function openProfileModal\(\) \{[\s\S]*?window\.AppNav\?\.enter\?\.\("you"\);[\s\S]*?if \(!editorOpen\(\)\) showProfileView\(\);/);
assert.match(profile, /window\.closeProfileModal = function closeProfileModal\(\) \{\s*if \(window\.AppNav\?\.exit\) window\.AppNav\.exit\("you"\);/);
assert.match(profile, /\$\("edit-cancel"\)\?\.addEventListener\("click", \(\) => showProfileView\(\)/, 'Cancel returns to the profile');
assert.match(profile, /toast\("Profile updated successfully!"\);\s*showProfileView\(\);/, 'Save returns to the profile');
for (const id of ['messages-modal" data-app-screen="inbox"', 'profile-modal" data-app-screen="you"']) assert.ok(index.includes(id), id);
// The page underneath is out of reach while they show, and is given back as it was.
assert.match(appNav, /const PAGE_CONTENT = \['main-content', 'mobile-you-screen', 'mobile-header-actions'\];/);
assert.match(appNav, /if \(!\(id in pageInert\)\) pageInert\[id\] = el\.inert;/);
// Beside the navigation, never over it; no X below 1024px; the bar steps
// aside only while typing on a touch screen.
assert.match(base, /body\.app-nav-visible #profile-modal\.modal \{\s*top: 0 !important;[\s\S]*?bottom: var\(--mobile-tab-bar-height\) !important;/);
assert.match(base, /body\.app-nav-visible #messages-modal > \.modal-content > \.modal-close,\s*body\.app-nav-visible #profile-modal > \.modal-content > \.modal-close \{ display: none !important; \}/);
assert.match(base, /@media \(max-width: 1023px\) and \(pointer: coarse\) \{\s*body\.app-nav-typing #app-nav \{ display: none !important; \}/);
assert.match(base, /body\.app-nav-visible #profile-modal \.swipe-handle \{ display: none !important; \}/, 'no swipe-to-close on the You page');
assert.match(base, /@media \(min-width: 1024px\) \{[\s\S]*?#profile-modal\.modal \{ left: var\(--app-nav-width\) !important; \}/);
// Messages: kept while away; read only in view; discreet notices; cleared on sign-out.
assert.match(messaging, /function isViewing\(\) \{\s*return !!document\.getElementById\("messages-modal"\)\?\.classList\.contains\("active"\) &&\s*document\.visibilityState !== "hidden";/);
assert.match(messaging, /if \(isViewing\(\)\) \{\s*await markMessagesAsRead\(conversationId\);/);
assert.match(messaging, /if \(isViewing\(\)\) \{\s*await markMessagesAsRead\(state\.activeConversation\.id\);/);
assert.equal((messaging.match(/markMessagesAsRead\(/g) || []).length, 4, 'every read is guarded (definition, load, realtime, onShown)');
assert.match(messaging, /function showIncomingToast\(senderName, convId\)/);
assert.doesNotMatch(messaging.slice(messaging.indexOf('function showIncomingToast'), messaging.indexOf('// REALTIME')), /preview|content/, 'the notice never shows the message');
assert.match(messaging, /function cleanup\(\) \{[\s\S]*?realtimeManager\.unsubscribe\("messaging"\)[\s\S]*?state\.drafts = \{\};[\s\S]*?container\.innerHTML = "";/);
assert.match(profile, /window\.addEventListener\("user-logged-out", \(\) => \{[\s\S]*?window\.hideProfileModal\(\);[\s\S]*?content\.innerHTML = "";/);
// Escape never closes or blanks them.
assert.match(read('assets/js/keyboard-shortcuts.js'), /if \(modal\.closest\('\[data-app-screen\]'\)\) return;\s*if \(modal\.classList\.contains\('modal'\)\) \{\s*modal\.classList\.remove\('active'\);/);

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

// Each desktop destination shows its own part of the dashboard: Home the
// focus cards, Explore the Explore list, Network the people list.
for (const rule of [
  /body\[data-destination="home"\] #command-dashboard #cd-explore \{ display:none!important; \}/,
  /body\[data-destination="explore"\] #command-dashboard #cd-focus \{ display:none!important; \}/,
  /body\[data-destination="network"\] #command-dashboard #cd-focus \{ display:none!important; \}/,
  /body\[data-destination="network"\] #command-dashboard \.udc-resource-tab:not\(\[data-resource="people"\]\) \{ display:none!important; \}/,
]) assert.match(commandCss, rule);
assert.match(appNav, /if \(page === 'network'\) window\.CommandDashboard\?\.selectResourceTab\?\.\('people'\)/);
// Crossing into the desktop layout clears the phone/tablet surface state.
assert.match(appNav, /if \(isDesktop\(\)\) \{\s*window\.MobileNav\?\.reset\?\.\(\);/);
assert.match(mobileNav, /function reset\(\) \{[\s\S]*?mobile-network-list[\s\S]*?cd-mobile-panel[\s\S]*?inert = false/);

// "People you met" is one section, mounted by the router on Network at every
// width and removed elsewhere; it brings its own card styles.
const events = read('assets/js/nearify-events-panel.js');
assert.match(events, /export async function mountNearifyEventsPanel\(container\) \{[\s\S]*?ensureNearifyEventsPanelStyles\(\);[\s\S]*?renderNearifyEventsPanel\(\)[\s\S]*?initNearifyEventsPanel\(section\)/);
assert.match(appNav, /if \(page !== 'network'\) \{\s*window\.NearifyEventsPanel\?\.unmount\?\.\(\);/);
assert.match(appNav, /window\.NearifyEventsPanel\?\.mount\?\.\(document\.getElementById\('cd-explore-body'\)\)/);
assert.match(appNav, /\n    syncNetworkHistory\(page\);\n  \}/, 'every layout runs it');
const mounters = jsFiles.filter(file => !file.endsWith('nearify-events-panel.js') && /NearifyEventsPanel\??\.(render|init|mount)\b/.test(read(file)));
assert.deepEqual(mounters.map(f => path.basename(f)), ['app-nav.js']);
// Network is its only home: the profile (You) no longer renders or loads it.
assert.doesNotMatch(read('profile.js'), /NearifyEventsPanel/);
assert.doesNotMatch(commandCss, /#profile-modal \.ch-nearify-events-panel/);
assert.doesNotMatch(events, /id="nearify-events/);
// The desktop list heading names the page.
assert.match(appNav, /heading\.textContent = page === 'network' \? 'Network' : 'Explore';/);
// One module instance: the router's fallback import matches the page's.
const eventsTag = (index.match(/nearify-events-panel\.js\?v=([a-z0-9-]+)/) || [])[1];
assert.ok(eventsTag && appNav.includes(`import('./nearify-events-panel.js?v=${eventsTag}')`));

// Network → View map (phones and tablets) is its own surface; the Network
// list surface hides the map.
assert.match(mobileNav, /addEventListener\('click', \(\) => \{\s*\/\/[^\n]*\n\s*setMobileSurface\('map'\);\s*window\.CommandDashboard\?\.setWorkspaceView\?\.\('network'\);/);
assert.match(mobileNav, /const surfaces = \['today', 'discover', 'community', 'you', 'map'\];/);

// Search from Network: people stay in Network; anything else opens in Explore.
assert.match(read('assets/js/dashboardPane.js'), /if \(mode && mode !== 'people' && document\.body\.dataset\.destination === 'network'\) \{\s*window\.AppNav\?\.go\?\.\('explore'\);\s*\}\s*if \(mode\) window\.CommandDashboard\?\.selectResourceTab\?\.\(mode\);/);

// Callers that used the old tabs go through the router.
assert.match(read('assets/js/mobile-task-assistance.js'), /window\.AppNav\?\.go\?\.\('home'\)/);
assert.match(read('assets/js/home-view.js'), /window\.AppNav\?\.go\?\.\('inbox'\)[\s\S]*window\.AppNav\?\.go\?\.\('explore'\)/);
// Home's sections (home-view.js) at every width: desktop Home shows them in
// the dashboard, phones and tablets in the Home screen.
assert.match(read('assets/js/home-view.js'), /document\.body\.dataset\.destination === 'home'/);
assert.match(appNav, /if \(page === 'home'\) window\.HomeView\?\.show\?\.\(\);/);
assert.match(read('assets/js/mobile-you.js'), /window\.HomeView\.show\(\)/);

console.log('shared navigation contracts passed');
