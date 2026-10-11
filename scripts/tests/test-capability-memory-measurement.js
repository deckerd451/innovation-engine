#!/usr/bin/env node

// Deterministic contract tests for Capability Memory's measurement foundation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/capability-memory.js', 'utf8');
const sql = fs.readFileSync('supabase/sql/migrations/20261011_capability_memory.sql', 'utf8');
const context = {
  window: {},
  document: { createElement: () => ({ textContent: '', innerHTML: '' }) },
  console,
};
vm.runInNewContext(source, context, { filename: 'capability-memory.js' });
const { median, confidenceAdjustedEffectiveness, rankPackages, summarizeStats } = context.window.CapabilityMemoryTesting;

assert.equal(median([8, 2, 4]), 4, 'median should use all actual attempt values');

const stats = new Map([
  ['high-sample', { completed: 10, success: 8, verifiedSuccess: 0, savedHours: [8, 4, 2] }],
  ['small-sample', { completed: 1, success: 1, verifiedSuccess: 0, savedHours: [20] }],
]);
assert.ok(
  confidenceAdjustedEffectiveness(stats.get('high-sample')) > confidenceAdjustedEffectiveness(stats.get('small-sample')),
  'ranking should shrink small self-reported samples instead of rewarding raw success counts'
);

const ranked = rankPackages([
  { id: 'small-sample', goal: 'different goal' },
  { id: 'high-sample', goal: 'another goal' },
], stats);
assert.equal(ranked[0].id, 'high-sample', 'ranking must use returned stats fields');
assert.equal(Object.prototype.hasOwnProperty.call(ranked[0], 'goalRelevance'), false, 'goal relevance must not be claimed before goal matching exists');

const summary = summarizeStats(new Map([
  ['a', { completed: 2, success: 1, verifiedSuccess: 0, savedHours: [8, 2] }],
  ['b', { completed: 1, success: 1, verifiedSuccess: 1, savedHours: [4] }],
]));
assert.equal(summary.completed, 3, 'summary should count completed attempts');
assert.equal(summary.success, 2, 'summary should count successful completed attempts');
assert.equal(summary.verifiedSuccess, 1, 'summary should keep verified successes separate');
assert.equal(summary.savedHours, 4, 'summary should use raw attempt savings for the median');
assert.match(sql, /outcome_status IN \('succeeded', 'not_succeeded'\)/, 'SQL must define completed attempts explicitly');
assert.match(sql, /verification_status = 'verified'/, 'SQL must keep independent verification separate');
assert.match(sql, /Only a different package creator can verify an attempt/, 'self-reported results must not self-upgrade');
assert.match(sql, /ARRAY_AGG\(a\.baseline_hours - a\.actual_hours/, 'SQL must return actual attempt savings for a weighted median');
assert.match(sql, /verified_success_count >= 2/, 'SQL must not call two self-reported successes proven');

console.log('✅ Capability Memory measurement contracts passed');
