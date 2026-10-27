#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (file) => fs.readFileSync(file, 'utf8');

const nav = read('assets/js/mobile-nav.js');
const dashboardCss = read('assets/css/command-dashboard.css');
const youCss = read('assets/css/mobile-you.css');
const panel = read('assets/js/node-panel.js');
const projectCss = read('assets/css/mobile-project-scroll.css');
const home = read('assets/js/home-view.js');
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
// Overview carries the one next step (Home's own rule); Work no longer
// repeats a "Continue your work" prompt above the task list.
assert.match(panel, /id="pd-next"/);
assert.match(panel, /window\.HomeView\.chooseNextTask\(open\)/);
assert.doesNotMatch(panel, /Continue your work/);

// Home picks one task to continue (home-view.js, every width).
assert.match(home, /const task = chooseNextTask\(work\.tasks\)/);
assert.match(home, /data-next-task="\$\{esc\(task\.id\)\}">Continue</);
assert.match(nav, /cd-mobile-secondary-links/);
assert.match(nav, /unread > 0/);

// Home keeps the member's work and goal help; the profile biography/intent
// is never presented as the member's objective.
assert.match(home, /Your projects/);
assert.match(home, /data-next-project/);
assert.match(home, /Your work/); // the next task, below discovery (was "Pick up where you left off")
assert.match(home, /Have something in mind\?/);
assert.doesNotMatch(home, /profile\.(bio|intent)|p\?\.(bio|intent) *\?/);
assert.match(youCss, /z-index: 700/);

// The project overlay retains safe-area and dynamic viewport clearance.
assert.match(projectCss, /100dvh/);
assert.match(projectCss, /env\(safe-area-inset-bottom/);
assert.match(projectCss, /scroll-padding-bottom/);

// The isolation fix must actually reach clients; stale asset URLs were the
// production failure mode that allowed the pre-fix shell to remain visible.
const shellTag = (sw.match(/const VERSION = "v\d+-([^"]+)"/) || [])[1];
assert.ok(shellTag, 'service worker must declare a versioned shell');
for (const asset of ['command-dashboard.css', 'mobile-nav.js', 'mobile-you.css', 'mobile-you.js', 'home-view.js', 'home-view.css', 'mobile-goal-discovery.js', 'mobile-task-assistance.js', 'mobile-task-assistance.css', 'assistance-interventions.js', 'assistance-interventions.css', 'capability-memory.js']) {
  assert.match(index, new RegExp(`${asset.replace('.', '\\.')}\\?v=${shellTag}`), `${asset} must be cache-busted with the current shell version`);
}
// One vocabulary at every width: Home, Explore, Network, Inbox, You.
const labels = [...index.matchAll(/data-destination="([a-z]+)"[^>]*>\s*<i[^>]*><\/i><span>([^<]+)<\/span>/g)].map(m => `${m[1]}:${m[2]}`);
assert.deepEqual(labels, ['home:Home', 'explore:Explore', 'network:Network', 'inbox:Inbox', 'you:You']);
assert.doesNotMatch(index, /<span>(My Space|Community)<\/span>|data-workspace-view=/);

console.log('Mobile UX stabilization contracts passed');
