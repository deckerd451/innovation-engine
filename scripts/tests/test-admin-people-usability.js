#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'assets/js/adminPeoplePanel.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/admin-panel.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(panel, /data-claimed-filter="false"/, 'unclaimed KPI must offer a direct filtered view');
assert.match(panel, /Review unclaimed accounts/, 'unclaimed KPI must explain its follow-up action');
assert.match(panel, /Math\.round\(\(claimed \/ total\) \* 100\)/,
  'claimed count must include adoption context');
assert.match(panel, /state\.search = ''[\s\S]*people-search-input'\)\.value = ''/,
  'Clear all must clear search state and its visible control');
assert.match(panel, /active-filter-count[\s\S]*aria-live="polite"/,
  'filter feedback must be announced to assistive technology');
assert.match(panel, /aria-pressed/, 'interactive KPI filters must expose selected state');
assert.match(css, /\.admin-people-stat:focus-visible/, 'KPI filters must have a visible keyboard focus state');
assert.match(index, /adminPeoplePanel\.js\?v=admin-people-actions-20260826/,
  'the changed production module must have a cache-busting version');

console.log('✅ test-admin-people-usability passed');
