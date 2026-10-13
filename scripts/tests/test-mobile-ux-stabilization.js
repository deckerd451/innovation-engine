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

// One active mobile surface owns visibility, touch, and focus state.
assert.match(nav, /function setMobileSurface\(surface\)/);
assert.match(nav, /`mobile-surface-\$\{name\}`/);
assert.match(nav, /setMobileSurface\('today'\)/);
assert.match(nav, /setMobileSurface\('discover'\)/);
assert.match(nav, /setMobileSurface\('you'\)/);
assert.match(nav, /\.inert = surface/);
assert.match(dashboardCss, /body\.mobile-surface-discover #command-dashboard\.cd-mobile-panel #cd-focus/);
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
assert.match(you, /across your projects/);
assert.match(you, /method\$\{data\.attempts/);
assert.match(youCss, /z-index: 700/);

// The project overlay retains safe-area and dynamic viewport clearance.
assert.match(projectCss, /100dvh/);
assert.match(projectCss, /env\(safe-area-inset-bottom/);
assert.match(projectCss, /scroll-padding-bottom/);

console.log('Mobile UX stabilization contracts passed');
