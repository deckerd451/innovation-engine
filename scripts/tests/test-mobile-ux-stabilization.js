#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (file) => fs.readFileSync(file, 'utf8');

const nav = read('assets/js/mobile-nav.js');
const dashboardCss = read('assets/css/command-dashboard.css');
const youCss = read('assets/css/mobile-you.css');
const panel = read('assets/js/node-panel.js');
const projectCss = read('assets/css/mobile-project-scroll.css');
const today = read('assets/js/mobile-today-continuity.js');
const you = read('assets/js/mobile-you.js');
const index = read('index.html');
const sw = read('sw.js');

// One active mobile surface owns visibility, touch, and focus state.
assert.match(nav, /function setMobileSurface\(surface\)/);
assert.match(nav, /`mobile-surface-\$\{name\}`/);
assert.match(nav, /setMobileSurface\('you'\)/);
assert.match(nav, /surface = mode === 'network' \? 'community' : 'discover'/);
assert.match(nav, /network: \(\) => setDiscoverMode\('network', 'community'\)/);
assert.match(nav, /\.inert = surface/);
assert.match(dashboardCss, /body\.mobile-surface-discover #command-dashboard #cd-focus/);
assert.match(dashboardCss, /mobile-surface-community #synapse-main-view/);
assert.match(dashboardCss, /mobile-surface-community #network-reflection/);
assert.match(dashboardCss, /pointer-events: none !important/);
assert.match(dashboardCss, /body\.mobile-surface-you #command-dashboard/);

// Mobile project navigation has three visible sections while legacy callers remain.
assert.match(panel, /pd-mobile-work-tab/);
assert.match(panel, /class="pd-tab-btn pd-legacy-tab" data-tab="activity"/);
assert.match(projectCss, /#project-detail-overlay #pd-tabs \.pd-legacy-tab/);
assert.match(panel, /data-tab-focus="activity"/);
assert.match(panel, /Continue your work/);
assert.match(panel, /updateWorkNext/);

// Today chooses one task first and keeps community suggestions secondary.
assert.match(today, /focus\.prepend\(card\)/);
assert.match(today, /data-continuity-tab="tasks"/);
assert.match(nav, /cd-mobile-secondary-links/);
assert.match(nav, /unread > 0/);

// My Space leads with one next move and objective entry; the profile
// biography/intent is never presented as the member's objective.
assert.match(you, /Your projects/);
assert.match(you, /mobile-you-goal-discovery/);
assert.match(you, /data-next-project/);
assert.match(you, /Pick up where you left off/);
assert.match(you, /What do you want to accomplish\?/);
assert.match(you, /Get help with this/);
assert.doesNotMatch(you, /profile\.(bio|intent)/);
assert.match(youCss, /z-index: 700/);

// The project overlay retains safe-area and dynamic viewport clearance.
assert.match(projectCss, /100dvh/);
assert.match(projectCss, /env\(safe-area-inset-bottom/);
assert.match(projectCss, /scroll-padding-bottom/);

// The isolation fix must actually reach clients; stale asset URLs were the
// production failure mode that allowed the pre-fix shell to remain visible.
const shellTag = (sw.match(/const VERSION = "v\d+-([^"]+)"/) || [])[1];
assert.ok(shellTag, 'service worker must declare a versioned shell');
for (const asset of ['command-dashboard.css', 'mobile-nav.js', 'mobile-you.css', 'mobile-you.js', 'mobile-goal-discovery.js', 'mobile-task-assistance.js', 'mobile-task-assistance.css', 'assistance-interventions.js', 'assistance-interventions.css', 'capability-memory.js']) {
  assert.match(index, new RegExp(`${asset.replace('.', '\\.')}\\?v=${shellTag}`), `${asset} must be cache-busted with the current shell version`);
}
// One vocabulary at every width: Home, Explore, Network, Inbox, You.
const labels = [...index.matchAll(/data-destination="([a-z]+)"[^>]*>\s*<i[^>]*><\/i><span>([^<]+)<\/span>/g)].map(m => `${m[1]}:${m[2]}`);
assert.deepEqual(labels, ['home:Home', 'explore:Explore', 'network:Network', 'inbox:Inbox', 'you:You']);
assert.doesNotMatch(index, /<span>(My Space|Community)<\/span>|data-workspace-view=/);

console.log('Mobile UX stabilization contracts passed');
