#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { summarizeParticipation: summarize } = require('../human-potential-metrics');
assert.deepEqual(summarize({ participated: 4, notParticipated: 4, missing: 2 }), {
  suppressed: false, total: 10, observed: 8, missing: 2,
  observedRate: 0.5, lowerBound: 0.4, upperBound: 0.6
});
assert.deepEqual(summarize({ participated: 1, notParticipated: 0, missing: 0 }), { suppressed: true });
assert.deepEqual(summarize({ participated: 0, notParticipated: 0, missing: 10 }), {
  suppressed: false, total: 10, observed: 0, missing: 10,
  observedRate: null, lowerBound: 0, upperBound: 1
});
assert.throws(() => summarize({ participated: -1, notParticipated: 10, missing: 0 }), TypeError);
assert.throws(() => summarize({ participated: 1, notParticipated: 0, missing: 0 }, 1), RangeError);
assert.throws(() => summarize({ participated: 0.5, notParticipated: 10, missing: 0 }), TypeError);
console.log('Human potential aggregate metric tests passed');
