#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = { addEventListener() {} };
page.window = page;
vm.runInNewContext(fs.readFileSync('assets/js/home-view.js', 'utf8'), page);
const choose = page.HomeViewTesting.preferParticipation;
for (const enabled of [false, undefined, 'true', true]) {
  assert.equal(choose(enabled, false, false), null);
  assert.equal(choose(enabled, true, false), 'join');
  assert.equal(choose(enabled, false, true), 'meet');
  assert.equal(choose(enabled, true, true), enabled === true ? 'join' : 'meet');
}
console.log('HPE Home priority checks passed');
