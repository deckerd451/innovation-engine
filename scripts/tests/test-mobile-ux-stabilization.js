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
assert.match(nav, /community: \(\) => setDiscoverMode\('network', 'community'\)/);
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

// You remains a real destination and explains contribution counts in plain language.
assert.match(you, /Your projects/);
assert.match(you, /Your progress/);
assert.match(you, /mobile-you-goal-discovery/);
assert.match(you, /data-next-project/);
assert.match(you, /What are you working on\?/);
assert.match(you, /What do you want to accomplish next\?/);
assert.match(you, /profile\.intent/);
assert.doesNotMatch(you, /const focus = profile\.bio/);
assert.match(you, /target\.dataset\.compact = 'true'/);
assert.match(youCss, /z-index: 700/);

// The project overlay retains safe-area and dynamic viewport clearance.
assert.match(projectCss, /100dvh/);
assert.match(projectCss, /env\(safe-area-inset-bottom/);
assert.match(projectCss, /scroll-padding-bottom/);

// The isolation fix must actually reach clients; stale asset URLs were the
// production failure mode that allowed the pre-fix shell to remain visible.
assert.match(index, /command-dashboard\.css\?v=adoption-shell-20261013/);
assert.match(index, /mobile-nav\.js\?v=adoption-shell-20261013/);
assert.match(index, /mobile-you\.css\?v=adoption-space-20261013/);
assert.match(index, /mobile-you\.js\?v=adoption-space-20261013/);
assert.match(index, /mobile-goal-discovery\.js\?v=adoption-goal-20261013/);
assert.match(index, /My Space/);
assert.match(index, /Explore/);
assert.match(index, /data-surface="community"/);
assert.match(index, /Community/);
assert.match(sw, /v11-adoption-shell-20261013/);

console.log('Mobile UX stabilization contracts passed');
