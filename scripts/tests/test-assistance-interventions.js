#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/assistance-interventions.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const choose = context.window.AssistanceInterventionsTesting.interventionFor;
const speaker = choose('Select speaker(s) for Harborhack 2026 prep');
assert.equal(speaker.type, 'speaker-selection');
assert.match(speaker.fields[2][1], /Would you be open to speaking/);
const validation = choose('Validate my business idea with customer interviews');
assert.equal(validation.type, 'validation');
assert.match(validation.fields[1][1], /repeated descriptions/);
const unknown = choose('Improve the first version of my tool');
assert.equal(unknown.type, 'decision-brief');
assert.ok(unknown.fields.length >= 3);
console.log('deterministic cold-start intervention contracts passed');
