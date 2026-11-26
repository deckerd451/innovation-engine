#!/usr/bin/env node
const assert = require('node:assert/strict');
const {proposeInventory} = require('../opportunity-publication');
const now=Date.parse('2026-11-26T12:00:00Z');
const row={title:'Volunteer',organization:'Example',sourceUrl:'https://example.org/volunteer',reviewStatus:'verified',reviewedAt:'2026-11-25T12:00:00Z',deadline:'2026-12-30T00:00:00Z',reviewer:'maintainer',evidenceNote:'Reviewed provider program page',availability:'provider_confirmation_required'};
const result=proposeInventory([row],now);
assert.equal(result.inventory.opportunities[0].deadline,'2026-12-02T12:00:00.000Z');
assert.equal(result.inventory.opportunities[0].status,'published');
assert.equal(result.inventory.opportunities[0].reviewer,undefined);
for(const patch of [{reviewer:''},{evidenceNote:''},{reviewStatus:'reachable'},{reviewedAt:'2026-11-01'},{availability:'unknown'}]) {
 const rejected=proposeInventory([{...row,...patch}],now);
 assert.equal(rejected.inventory.opportunities.length,0);
 assert.equal(rejected.rejectedCount,1);
}
console.log('Publication proposal checks passed');

assert.deepEqual(proposeInventory([{...row,topics:[' Garden ','garden',null,'x'.repeat(65)]}],now).inventory.opportunities[0].topics,['garden']);
