#!/usr/bin/env node
const assert = require('node:assert/strict');
const { reportOutcome } = require('../hpe-outcome-report');
const input = {windowStart:'2026-01-01T00:00:00Z',windowEnd:'2026-01-31T00:00:00Z',participated:6,notParticipated:2,missing:2};
const now = Date.parse('2026-02-01T00:00:00Z');
const result = reportOutcome(input,now);
assert.equal(result.observedRate,.75);
assert.equal(result.lowerBound,.6);
assert.equal(result.upperBound,.8);
assert.deepEqual(reportOutcome({...input,participated:1},now),{schemaVersion:1,suppressed:true});
assert.throws(()=>reportOutcome({...input,memberId:'private'},now));
assert.throws(()=>reportOutcome(input,Date.parse(input.windowStart)));
assert.throws(()=>reportOutcome({...input,windowEnd:'2026-01-30T00:00:00Z'},now));
assert.equal(reportOutcome({...input,participated:0,notParticipated:0,missing:10},now).observedRate,null);
console.log('HPE outcome reporting checks passed');
