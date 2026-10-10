#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../../assets/js/suggestions/start-integration.js'), 'utf8');
assert.match(src, /daily-suggestions-ready/);
assert.match(src, /setTimeout\(finish, 10000\)/);
assert.match(src, /did not become ready/);
assert.doesNotMatch(src, /if \(!window\.DailySuggestionsUI\) \{\s*console\.warn\('⚠️ \[START\] Daily Suggestions Engine not ready yet/);
console.log('START waits for Daily Suggestions readiness instead of reporting a startup race');
