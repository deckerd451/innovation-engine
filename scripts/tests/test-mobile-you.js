#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const index = fs.readFileSync('index.html', 'utf8');
const nav = fs.readFileSync('assets/js/mobile-nav.js', 'utf8');
const appNav = fs.readFileSync('assets/js/app-nav.js', 'utf8');
const you = fs.readFileSync('assets/js/mobile-you.js', 'utf8');
const css = fs.readFileSync('assets/css/mobile-you.css', 'utf8');

assert.match(index, /id="mobile-you-screen"/);
// Home (the shared navigation) shows this screen on phones and tablets.
assert.match(index, /id="app-nav"[\s\S]*?data-destination="home"/);
assert.match(appNav, /window\.MobileNav\?\.show\?\.\(page\)/);
assert.match(nav, /home: \(\) => \{\s*setMobileSurface\('you'\);\s*window\.MobileYou\?\.show\(\);/);
assert.match(nav, /window\.MobileYou\?\.show/);
assert.match(nav, /window\.MobileYou\?\.hide/);
for (const state of ['Loading your space', 'Sign in to see', 'could not be loaded']) assert.match(you, new RegExp(state));
for (const table of ['projects', 'project_members', 'project_tasks', 'capability_attempts']) assert.match(you, new RegExp(`from\\('${table}'\\)`));
assert.match(you, /openProfileModal/);
assert.match(you, /SettingsModal/);
assert.match(you, /doLogout/);
assert.match(you, /viewProjectDetails/);
assert.match(you, /viewProjectTask/);
assert.match(you, /data-next-task/);
assert.match(css, /inset: 0 0 var\(--mobile-tab-bar-height, 68px\) 0/);
assert.match(css, /overflow-y: auto/);
assert.match(css, /min-height:44px/);
assert.match(css, /#mobile-you-screen\[hidden\]/);
console.log('persistent mobile You navigation, states, project access, profile editing, logout, and clearance contracts passed');
