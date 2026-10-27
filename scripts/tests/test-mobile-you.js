#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const index = fs.readFileSync('index.html', 'utf8');
const nav = fs.readFileSync('assets/js/mobile-nav.js', 'utf8');
const appNav = fs.readFileSync('assets/js/app-nav.js', 'utf8');
const you = fs.readFileSync('assets/js/mobile-you.js', 'utf8');
const css = fs.readFileSync('assets/css/mobile-you.css', 'utf8');
const home = fs.readFileSync('assets/js/home-view.js', 'utf8');
const homeCss = fs.readFileSync('assets/css/home-view.css', 'utf8');

assert.match(index, /id="mobile-you-screen"/);
// Home (the shared navigation) shows this screen on phones and tablets.
assert.match(index, /id="app-nav"[\s\S]*?data-destination="home"/);
assert.match(appNav, /window\.MobileNav\?\.show\?\.\(page\)/);
assert.match(nav, /home: \(\) => \{\s*setMobileSurface\('you'\);\s*window\.MobileYou\?\.show\(\);/);
assert.match(nav, /window\.MobileYou\?\.show/);
assert.match(nav, /window\.MobileYou\?\.hide/);
// The screen shows Home's sections (home-view.js), or asks to sign in.
assert.match(you, /Sign in to see/);
assert.match(you, /window\.HomeView\.show\(\)/);
assert.match(home, /couldn’t be loaded/);
// Your community: the member's projects and connections (no tasks on Home).
for (const table of ['projects', 'project_members', 'connections']) assert.match(home, new RegExp(`from\\('${table}'\\)`));
// Account controls (Edit Profile, Settings, Log out) are in You, the
// profile (profile.js), not on Home.
assert.doesNotMatch(you, /data-profile-action|openProfileModal|SettingsModal|doLogout/);
assert.doesNotMatch(home, /data-profile-action|SettingsModal|doLogout/);
const profile = fs.readFileSync('profile.js', 'utf8');
for (const id of ['btn-open-profile-editor', 'btn-profile-settings', 'btn-profile-logout']) assert.match(profile, new RegExp(`id="${id}"`));
assert.match(home, /viewProjectDetails/);
assert.match(home, /data-project-id/);
assert.match(css, /inset: 0 0 var\(--mobile-tab-bar-height, 68px\) 0/);
assert.match(css, /overflow-y: auto/);
assert.match(homeCss, /min-height:44px/);
assert.match(css, /#mobile-you-screen\[hidden\]/);
console.log('mobile Home screen navigation, states, project access and clearance contracts passed (account controls in You)');
