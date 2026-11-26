#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = { addEventListener() {} };
page.window = page;
vm.runInNewContext(fs.readFileSync('assets/js/home-view.js', 'utf8'), page);
const query = page.HomeViewTesting.learningQuery;
assert.equal(query('I want to learn Python'), 'Python');
assert.equal(query('Help me learn community gardening'), 'community gardening');
assert.equal(query('Learn GIS'), 'GIS');
assert.equal(query('I would like to learn design'), 'design');
assert.equal(query('Python'), null);
assert.equal(query('I want to learn'), null);
assert.equal(query(''), null);
console.log('HPE explicit learning query checks passed');
