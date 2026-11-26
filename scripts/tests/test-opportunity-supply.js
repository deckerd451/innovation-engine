#!/usr/bin/env node
const assert = require('node:assert/strict');
const { stageOpportunities } = require('../opportunity-supply');
const now = Date.parse('2026-11-26T12:00:00Z');
const row = {title:'Volunteer',organization:'Example',sourceUrl:'https://example.org/apply',deadline:'2026-12-01',reviewedAt:'2026-11-25',reviewStatus:'verified'};
const result = stageOpportunities([row,{...row,sourceUrl:row.sourceUrl+'?utm_source=test#info'},{...row,deadline:'2026-11-25'},{...row,reviewStatus:'pending'},{...row,reviewedAt:'2026-11-01'},{...row,sourceUrl:'javascript:alert(1)'}],now);
assert.equal(result.accepted.length,1);
assert.equal(result.accepted[0].status,'staged');
assert.equal(result.rejected.length,5);
console.log('Opportunity supply intake checks passed');
