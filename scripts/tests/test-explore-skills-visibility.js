#!/usr/bin/env node
'use strict';

// Explore's skills (command-dashboard.js's Skills list and node-panel.js's
// "People with this skill" view) never count or list members hidden from
// discovery, matching every other discovery surface (search, matching, the
// Daily Brief). Both read community rows with the same client-side filter;
// row-level security and database permissions are unchanged.
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
assert.match(dashboard, new RegExp(String.raw`\.from\('community'\)\s*\.select\('skills'\)\s*` + HIDDEN_FILTER),
  'the Skills list counts only members who are not hidden from discovery');
assert.doesNotMatch(dashboard, /\.from\('community'\)\s*\.select\('skills'\)\s*;/, 'no unfiltered skills count remains');

const panel = read('assets/js/node-panel.js');
const lens = panel.slice(panel.indexOf('async function renderSkillLensPanel'), panel.indexOf('async function renderSkillLensPanel') + 3000);
assert.match(lens, new RegExp(String.raw`\.from\('community'\)\s*\.select\('id,name,skills'\)\s*` + HIDDEN_FILTER),
  'the skill view lists and counts only members who are not hidden from discovery');

// The same rule as the brief, so Home's chips and Explore agree.
assert.match(read('assets/js/intelligence/daily-brief-engine.js'), new RegExp(String.raw`\.from\('community'\)\s*\.select\([^)]*\)\s*` + HIDDEN_FILTER));

console.log('Explore skills visibility: all checks passed');
