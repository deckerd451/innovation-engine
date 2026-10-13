#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (file) => fs.readFileSync(file, 'utf8');
const html = read('index.html');
const discover = read('assets/js/mobile-goal-discovery.js');
const memory = read('assets/js/capability-memory.js');
const css = read('assets/css/mobile-goal-discovery.css');

assert.match(html, /id="mgd-goal-discovery"/);
assert.match(html, /Browse the community/);
assert.match(html, /mobile-goal-discovery\.js/);
assert.match(discover, /What are you trying to accomplish\?/);
assert.match(discover, /CapabilityMemory\.searchGoal/);
assert.match(discover, /CapabilityMemory\.renderPackageCard/);
assert.match(discover, /authorizedProjects/);
assert.match(discover, /CapabilityMemory\.importCapability/);
assert.match(discover, /project_members/);
assert.match(memory, /permission_mode.*community/);
assert.match(memory, /window\.CapabilityMemory = \{ mount, searchGoal, renderPackageCard, importCapability \}/);
assert.match(css, /@media \(max-width: 1023px\)/);
assert.match(css, /font-size: 16px/);
console.log('goal-first Discover contracts passed');
