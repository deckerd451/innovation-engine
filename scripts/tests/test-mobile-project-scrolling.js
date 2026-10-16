#!/usr/bin/env node

// Deterministic source contracts for the mobile project/capability scroll path.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('assets/css/mobile-project-scroll.css', 'utf8');
const panel = fs.readFileSync('assets/js/node-panel.js', 'utf8');
const swipe = fs.readFileSync('assets/js/swipe-dismiss.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(css, /height:\s*100dvh/, 'mobile overlay should follow the dynamic viewport');
assert.match(css, /min-height:\s*100svh/, 'mobile overlay should have a stable small-viewport fallback');
assert.match(css, /overflow-y:\s*auto\s*!important/, 'the mobile overlay must be vertically scrollable');
assert.match(css, /-webkit-overflow-scrolling:\s*touch/, 'iOS momentum scrolling should be enabled');
assert.match(css, /env\(safe-area-inset-bottom/, 'bottom safe-area padding must be reserved');
assert.match(css, /var\(--pd-bottom-nav-height/, 'bottom spacing must use the measured navigation height');
assert.match(css, /scroll-padding-bottom:/, 'the overlay scroll end must include bottom navigation clearance');
assert.match(css, /#project-detail-overlay #pd-tabs[\s\S]*?overflow-x:\s*auto/, 'project tabs must scroll horizontally');
assert.match(css, /touch-action:\s*pan-x pan-y/, 'tab gestures must permit both axes');
assert.match(css, /@media \(min-width: 701px\) and \(pointer: fine\)/, 'desktop behavior must remain separately scoped');
assert.match(css, /\.project-detail-panel[\s\S]*?max-height: 90vh[\s\S]*?overflow-y: auto/, 'desktop panel scrolling must remain bounded and intact');
assert.match(css, /#project-detail-overlay #pt-groups[\s\S]*?overflow:\s*visible/, 'task groups must not create a trapped nested scroller');
assert.match(panel, /className = 'project-detail-overlay'/, 'project overlay should have a stable CSS hook');
assert.match(panel, /class="project-detail-panel"/, 'project panel should have a stable CSS hook');
assert.match(panel, /field\.scrollIntoView\(\{ block: 'center'/, 'focused mobile fields should be brought above the keyboard');
assert.match(panel, /getElementById\('app-nav'\)/, 'project overlay must measure the actual mobile navigation');
assert.match(panel, /navRect\.width >= window\.innerWidth - 1/, 'the desktop side bar takes no height from the bottom');
assert.match(panel, /--pd-safe-bottom/, 'safe-area fallback must not be double-counted when navigation is visible');
assert.match(swipe, /Math\.abs\(rawDy\) <= Math\.abs\(rawDx\)/, 'vertical page scrolling must not be captured as a dismiss drag');
assert.match(swipe, /closest\?\.\('\.swipe-handle'\)/, 'dismiss gestures should start only from the explicit handle');
assert.match(html, /assets\/css\/mobile-project-scroll\.css\?v=project-scroll-20261012/, 'scroll fix stylesheet must be loaded');

console.log('✅ Mobile project scrolling contracts passed');
