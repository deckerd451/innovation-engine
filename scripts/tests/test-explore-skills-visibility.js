#!/usr/bin/env node
'use strict';

// Explore's skills (command-dashboard.js's Skills list and node-panel.js's
// "People with this skill" view) never count or list members hidden from
// discovery, matching every other discovery surface (search, matching, the
// Daily Brief). Both read community rows with the same client-side filter;
// row-level security and database permissions are unchanged.
//
// Themes and theme circles were replaced by skills, so Explore → Skills lists
// only skills members list (never a theme circle title), each counted once
// per discoverable member other than the member themselves; the skill view
// lists exactly those members, with full names only for accepted connections
// (and admins) and "First L." for anyone else, as search, Explore → People
// and the profile preview show them.
//
// The rendered behaviour (counts and names with a synthetic hidden member) is
// covered by scripts/tests/browser/run-discovery-home.mjs.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const HIDDEN_FILTER = String.raw`\.or\('is_hidden\.is\.null,is_hidden\.eq\.false'\)`;

const dashboard = read('assets/js/command-dashboard.js');
const skillsList = dashboard.slice(dashboard.indexOf('async function _loadSkills'), dashboard.indexOf('async function _loadSkills') + 2500);
assert.match(skillsList, new RegExp(String.raw`\.from\('community'\)\s*\.select\('id, user_id, skills'\)\s*` + HIDDEN_FILTER),
  'the Skills list counts only members who are not hidden from discovery');
assert.doesNotMatch(dashboard, /\.from\('community'\)\s*\.select\('(id, user_id, )?skills'\)\s*;/, 'no unfiltered skills count remains');
assert.doesNotMatch(dashboard, /theme_circles/, 'Explore → Skills never lists theme circles');
assert.match(skillsList, /String\(p\.id\) === String\(_userId\) \|\| \(selfAuth && String\(p\.user_id\) === selfAuth\)\) return;/,
  'never counts the member themselves (a duplicate row for them included)');
assert.match(skillsList, /const identity = String\(p\.user_id \?\? p\.id\);[\s\S]*members\.get\(key\)\.add\(identity\)/,
  'each member counts once per skill, however many rows or spellings they have');
assert.doesNotMatch(dashboard, /New Theme|Add Theme|Theme name/, 'no way to add a theme from Explore');

const panel = read('assets/js/node-panel.js');
const lens = panel.slice(panel.indexOf('async function renderSkillLensPanel'), panel.indexOf('async function renderThemeLensPanel'));
assert.match(lens, new RegExp(String.raw`\.from\('community'\)\s*\.select\('id,user_id,name,skills'\)\s*` + HIDDEN_FILTER),
  'the skill view lists and counts only members who are not hidden from discovery');
assert.match(lens, /String\(person\.id\) === me \|\| \(myAuth && String\(person\.user_id\) === myAuth\)\) return false;/,
  'the skill view leaves out the member themselves, as the count does');
assert.match(lens, /const fullAccess = isAdmin \|\| connected\.has\(String\(person\.id\)\);\s*const name = fullAccess \? [^:]+ : limitedDisplayName\(person\.name\);/,
  'full names only for accepted connections (and admins); anyone else "First L."');
assert.match(lens, /\.from\('connections'\)\.select\('from_user_id,to_user_id'\)\s*\.or\([^)]*\)\.eq\('status', 'accepted'\)/,
  'connected means an accepted connection');

// The same rule as the brief, so Home's chips and Explore agree.
assert.match(read('assets/js/intelligence/daily-brief-engine.js'), new RegExp(String.raw`\.from\('community'\)\s*\.select\([^)]*\)\s*` + HIDDEN_FILTER));

console.log('Explore skills visibility: all checks passed');
